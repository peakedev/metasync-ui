"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function UsersPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { data: tenant } = useTenant(tenantSlug);
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteClientId, setInviteClientId] = useState("");

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

  const { data: invitations = [] } = useQuery({
    queryKey: ["tenant-invitations", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("invitations").select("*").eq("tenant_id", tenant!.id).eq("status", "pending");
      if (error) throw error;
      return data;
    },
    enabled: !!tenant,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const response = await supabase.functions.invoke("invite", {
        body: { email: inviteEmail, role: "tenant_user", tenantId: tenant!.id, clientId: inviteClientId || undefined },
      });
      if (response.error) throw new Error(response.error.message);
    },
    onSuccess: () => { setInviteOpen(false); setInviteEmail(""); setInviteClientId(""); queryClient.invalidateQueries({ queryKey: ["tenant-invitations"] }); toast.success("Invitation sent"); },
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

  const revokeMutation = useMutation({
    mutationFn: async (invId: string) => {
      const { error } = await supabase.from("invitations").update({ status: "expired" }).eq("id", invId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tenant-invitations"] }); toast.success("Invitation revoked"); },
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <Button onClick={() => setInviteOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Invite User</Button>
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

      {invitations.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Pending Invitations</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Expires</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {invitations.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell><Badge variant="outline">{inv.role}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{new Date(inv.expires_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => revokeMutation.mutate(inv.id)}>Revoke</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form onSubmit={e => { e.preventDefault(); inviteMutation.mutate(); }}>
            <DialogHeader><DialogTitle>Invite User</DialogTitle><DialogDescription>Invite a new user to this tenant.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Client (optional)</Label>
                <Select value={inviteClientId} onValueChange={setInviteClientId}>
                  <SelectTrigger><SelectValue placeholder="No client" /></SelectTrigger>
                  <SelectContent><SelectItem value="">No client</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={inviteMutation.isPending}>{inviteMutation.isPending ? "Sending..." : "Send Invitation"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
