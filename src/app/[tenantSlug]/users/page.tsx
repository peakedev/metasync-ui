"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/hooks/use-tenant";
import { generatePassword } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Trash2, Copy, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function UsersPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { data: tenant } = useTenant(tenantSlug);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createClientId, setCreateClientId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Post-creation state
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["tenant-members", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenant_memberships").select("*").eq("tenant_id", tenant!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["tenant-clients", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").eq("tenant_id", tenant!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant,
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
          email: createEmail,
          password,
          role: "tenant_user",
          tenantId: tenant!.id,
          clientId: createClientId || null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-members"] });
      toast.success(`User account created for ${createEmail}`);
    },
    onError: (err) => {
      setCreateError(err.message);
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ userId, clientId }: { userId: string; clientId: string | null }) => {
      const { error } = await supabase.from("tenant_memberships").update({ client_id: clientId }).eq("user_id", userId).eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tenant-members"] }); toast.success("Assignment updated"); },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("tenant_memberships").delete().eq("user_id", userId).eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tenant-members"] }); toast.success("User removed"); },
  });

  function resetCreateForm() {
    setCreateEmail("");
    setCreateClientId("");
    setCreateError(null);
    setCreatedPassword(null);
    setCopied(false);
    setShowPassword(false);
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
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

  function handleCloseCreate() {
    setCreateOpen(false);
    resetCreateForm();
  }

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>;

  const isCreated = createMutation.isSuccess && createdPassword;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <Button onClick={() => setCreateOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Create User</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow><TableHead>User ID</TableHead><TableHead>Role</TableHead><TableHead>Client</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {members.map(m => (
            <TableRow key={m.id}>
              <TableCell className="font-mono text-sm">{m.user_id}</TableCell>
              <TableCell><Badge variant="outline">{m.role}</Badge></TableCell>
              <TableCell>
                <Select value={m.client_id || "unassigned"} onValueChange={v => assignMutation.mutate({ userId: m.user_id, clientId: v === "unassigned" ? null : v })}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remove this user?")) removeMutation.mutate(m.user_id); }}><Trash2 className="h-4 w-4" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={createOpen} onOpenChange={(v) => { if (!v) handleCloseCreate(); else setCreateOpen(true); }}>
        <DialogContent>
          {!isCreated ? (
            <form onSubmit={handleCreateSubmit}>
              <DialogHeader><DialogTitle>Create User</DialogTitle><DialogDescription>Create a new user account for this tenant with a generated password.</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Client (optional)</Label>
                  <Select value={createClientId || "none"} onValueChange={v => setCreateClientId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="No client" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">No client</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {createError && <p className="text-sm text-destructive">{createError}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseCreate}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || !createEmail}>{createMutation.isPending ? "Creating..." : "Create User"}</Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>User Created</DialogTitle>
                <DialogDescription>
                  Account created for <strong>{createEmail}</strong>. Copy the generated password below and share it with the user.
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
                    <Button type="button" variant="outline" size="icon" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={handleCopy}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This password will not be shown again. Make sure to copy it now.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseCreate}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
