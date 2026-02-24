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
import { UserPlus, Trash2, Copy, Check, Eye, EyeOff, X, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function UsersPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { data: tenant } = useTenant(tenantSlug);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createClientId, setCreateClientId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { data: members = [], isLoading, refetch, isRefetching } = useQuery({
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

  // Fetch all user_client_assignments for this tenant's clients
  const clientIds = clients.map((c) => c.id);
  const { data: assignments = [] } = useQuery({
    queryKey: ["tenant-client-assignments", tenant?.id],
    queryFn: async () => {
      if (clientIds.length === 0) return [];
      const { data, error } = await supabase
        .from("user_client_assignments")
        .select("user_id, client_id")
        .in("client_id", clientIds);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant && clientIds.length > 0,
  });

  // Map: userId -> set of assigned clientIds
  const userAssignments: Record<string, string[]> = {};
  for (const a of assignments) {
    if (!userAssignments[a.user_id]) userAssignments[a.user_id] = [];
    userAssignments[a.user_id].push(a.client_id);
  }

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
      queryClient.invalidateQueries({ queryKey: ["tenant-client-assignments"] });
      toast.success(`User account created for ${createEmail}`);
    },
    onError: (err) => {
      setCreateError(err.message);
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ userId, clientId }: { userId: string; clientId: string }) => {
      const { error } = await supabase
        .from("user_client_assignments")
        .insert({ user_id: userId, client_id: clientId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-client-assignments"] });
      toast.success("Client assigned");
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async ({ userId, clientId }: { userId: string; clientId: string }) => {
      const { error } = await supabase
        .from("user_client_assignments")
        .delete()
        .eq("user_id", userId)
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-client-assignments"] });
      toast.success("Client unassigned");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("tenant_memberships").delete().eq("user_id", userId).eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-members"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-client-assignments"] });
      toast.success("User removed");
    },
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
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Users</h1>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <Button onClick={() => setCreateOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Create User</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow><TableHead>User ID</TableHead><TableHead>Role</TableHead><TableHead>Clients</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {members.map(m => {
            const assigned = userAssignments[m.user_id] || [];
            const assignedSet = new Set(assigned);
            const unassigned = clients.filter((c) => !assignedSet.has(c.id));

            return (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-sm">{m.user_id}</TableCell>
                <TableCell><Badge variant="outline">{m.role}</Badge></TableCell>
                <TableCell>
                  {m.role === "tenant_admin" ? (
                    <Badge variant="secondary">Admin key</Badge>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      {assigned.map((cid) => {
                        const client = clients.find((c) => c.id === cid);
                        return (
                          <Badge key={cid} variant="secondary" className="gap-1 pr-1">
                            {client?.name || cid}
                            <button
                              onClick={() => unassignMutation.mutate({ userId: m.user_id, clientId: cid })}
                              className="ml-1 rounded-sm p-0.5 hover:bg-muted"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                      {assigned.length === 0 && (
                        <span className="text-sm text-muted-foreground">No clients</span>
                      )}
                      {unassigned.length > 0 && (
                        <Select
                          value=""
                          onValueChange={(v) => assignMutation.mutate({ userId: m.user_id, clientId: v })}
                        >
                          <SelectTrigger className="h-7 w-7 p-0 border-dashed" size="sm">
                            <Plus className="h-3 w-3" />
                          </SelectTrigger>
                          <SelectContent>
                            {unassigned.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remove this user?")) removeMutation.mutate(m.user_id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={createOpen} onOpenChange={(v) => { if (!v) handleCloseCreate(); else setCreateOpen(true); }}>
        <DialogContent>
          {!isCreated ? (
            <form onSubmit={handleCreateSubmit}>
              <DialogHeader><DialogTitle>Create User</DialogTitle><DialogDescription>Create a new user account for this tenant with a generated password.</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Initial Client (optional)</Label>
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
