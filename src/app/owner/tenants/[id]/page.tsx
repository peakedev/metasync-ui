"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { generatePassword } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Trash2, Copy, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Post-creation state
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { data: tenant, isLoading: tenantLoading } = useQuery({
    queryKey: ["tenant", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: admins = [], isLoading: adminsLoading } = useQuery({
    queryKey: ["tenant-admins", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("*, user:user_id(email:raw_user_meta_data->email)")
        .eq("tenant_id", id)
        .eq("role", "tenant_admin");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
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
        body: JSON.stringify({ email, password, role: "tenant_admin", tenantId: id }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-admins", id] });
      toast.success(`Admin account created for ${createEmail}`);
    },
    onError: (err) => {
      setCreateError(err.message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("tenant_memberships")
        .delete()
        .eq("user_id", userId)
        .eq("tenant_id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenant-admins", id] }),
  });

  function resetCreateForm() {
    setCreateEmail("");
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
    createMutation.mutate({ email: createEmail, password });
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

  if (tenantLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!tenant) {
    return <div className="text-muted-foreground">Tenant not found</div>;
  }

  const isCreated = createMutation.isSuccess && createdPassword;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{tenant.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">MetaSync Backend URL</span>
            {tenant.backend_url ? (
              <Badge variant="secondary">Configured</Badge>
            ) : (
              <Badge variant="outline">Not configured</Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Admin API Key</span>
            <Badge variant="outline">Check in tenant config</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Tenant Admins</CardTitle>
            <CardDescription>Manage administrators for this tenant</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Create Admin
          </Button>
        </CardHeader>
        <CardContent>
          {adminsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin: any) => (
                  <TableRow key={admin.id}>
                    <TableCell>{(admin as any).user?.email || admin.user_id}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(admin.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Remove this admin?")) {
                            removeMutation.mutate(admin.user_id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {admins.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      No admins assigned yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(v) => { if (!v) handleCloseCreate(); else setCreateOpen(true); }}>
        <DialogContent>
          {!isCreated ? (
            <form onSubmit={handleCreateSubmit}>
              <DialogHeader>
                <DialogTitle>Create Tenant Admin</DialogTitle>
                <DialogDescription>
                  Create a new admin account for {tenant.name} with a generated password.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="createEmail">Email address</Label>
                <Input
                  id="createEmail"
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  required
                />
                {createError && <p className="text-sm text-destructive mt-2">{createError}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseCreate}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || !createEmail}>
                  {createMutation.isPending ? "Creating..." : "Create Admin"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Admin Created</DialogTitle>
                <DialogDescription>
                  Account created for <strong>{createEmail}</strong>. Copy the generated password below and share it with the admin.
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
