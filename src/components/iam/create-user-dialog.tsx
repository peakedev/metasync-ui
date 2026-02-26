"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { proxyFetch } from "@/hooks/use-metasync-proxy";
import { generatePassword } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Copy, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface CreateUserDialogProps {
  defaultTenantId?: string;
  onSuccess?: () => void;
}

export function CreateUserDialog({ defaultTenantId, onSuccess }: CreateUserDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"tenant_admin" | "tenant_user">("tenant_admin");
  const [tenantId, setTenantId] = useState(defaultTenantId || "");
  const [clientId, setClientId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Post-creation state
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: clients = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["metasync-clients", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const result = await proxyFetch(tenantId, "/clients") as Array<{
        clientId: string;
        name: string;
        enabled: boolean;
      }>;
      if (!Array.isArray(result)) return [];
      return result.filter((c) => c.enabled).map((c) => ({ id: c.clientId, name: c.name }));
    },
    enabled: !!tenantId && role === "tenant_user",
  });

  const createMutation = useMutation({
    mutationFn: async ({ password }: { password: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-user`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          role,
          tenantId,
          clientId: role === "tenant_user" && clientId ? clientId : null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["iam-users"] });
      toast.success(`User account created for ${email}`);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function resetForm() {
    setEmail("");
    setRole("tenant_admin");
    if (!defaultTenantId) setTenantId("");
    setClientId("");
    setError(null);
    setCreatedPassword(null);
    setCopied(false);
    setShowPassword(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const password = generatePassword();
    setCreatedPassword(password);
    createMutation.mutate({ password });
  }

  function handleCopy() {
    if (!createdPassword) return;
    navigator.clipboard.writeText(createdPassword);
    setCopied(true);
    toast.success("Password copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setOpen(false);
    resetForm();
  }

  const isCreated = createMutation.isSuccess && createdPassword;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </DialogTrigger>
      <DialogContent>
        {!isCreated ? (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>Create a new user account with a generated password.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Tenant</Label>
                <Select
                  value={tenantId}
                  onValueChange={setTenantId}
                  disabled={!!defaultTenantId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "tenant_admin" | "tenant_user")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                    <SelectItem value="tenant_user">Tenant User</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {role === "tenant_user" && tenantId && (
                <div className="space-y-2">
                  <Label>Client (optional)</Label>
                  <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? "" : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="No client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No client (unassigned)</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || !tenantId || !email}>
                {createMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>User Created</DialogTitle>
              <DialogDescription>
                Account created for <strong>{email}</strong>. Copy the generated password below and share it with the user.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Generated Password</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    type={showPassword ? "text" : "password"}
                    value={createdPassword}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This password will not be shown again. Make sure to copy it now.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
