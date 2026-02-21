"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/hooks/use-tenant";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ClientDetail {
  _id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
}

export default function ClientDetailPage() {
  const { tenantSlug, id } = useParams<{ tenantSlug: string; id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: tenant } = useTenant(tenantSlug);
  const [editName, setEditName] = useState("");
  const [nameInit, setNameInit] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: client, isLoading } = useMetaSyncProxy<ClientDetail>({
    path: `/clients/${id}`,
    tenantSlug,
  });

  // Users assigned to this client
  const { data: assignedUsers = [] } = useQuery({
    queryKey: ["client-users", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("*")
        .eq("client_id", id);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant,
  });

  // All tenant users without client assignment
  const { data: unassignedUsers = [] } = useQuery({
    queryKey: ["unassigned-users", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("role", "tenant_user")
        .is("client_id", null);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant,
  });

  if (client && !nameInit) {
    setEditName(client.name);
    setNameInit(true);
  }

  const updateMutation = useMetaSyncMutation<{ name?: string; enabled?: boolean }, ClientDetail>({
    path: `/clients/${id}`,
    method: "PATCH",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, `/clients/${id}`], ["metasync", tenantSlug, "/clients"]],
  });

  const deleteMutation = useMetaSyncMutation<Record<string, never>, void>({
    path: `/clients/${id}`,
    method: "DELETE",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/clients"]],
  });

  const rotateMutation = useMetaSyncMutation<Record<string, never>, { apiKey: string }>({
    path: `/clients/${id}/rotate-key`,
    method: "POST",
    tenantSlug,
  });

  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("tenant_memberships")
        .update({ client_id: id })
        .eq("user_id", userId)
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", id] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-users", tenant?.id] });
      toast.success("User assigned");
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("tenant_memberships")
        .update({ client_id: null })
        .eq("user_id", userId)
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", id] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-users", tenant?.id] });
      toast.success("User unassigned");
    },
  });

  function copyKey() {
    if (shownKey) {
      navigator.clipboard.writeText(shownKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>;
  }

  if (!client) {
    return <div className="text-muted-foreground">Client not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        <Badge variant={client.enabled ? "secondary" : "outline"}>
          {client.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => updateMutation.mutate({ name: editName })} disabled={updateMutation.isPending}>
                Save
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => updateMutation.mutate({ enabled: !client.enabled })}
            >
              {client.enabled ? "Disable" : "Enable"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                rotateMutation.mutate({} as Record<string, never>, {
                  onSuccess: (data) => setShownKey(data.apiKey),
                });
              }}
              disabled={rotateMutation.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Rotate Key
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm("Delete this client?")) {
                  deleteMutation.mutate({} as Record<string, never>, {
                    onSuccess: () => router.push(`/${tenantSlug}/clients`),
                  });
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assigned Users</CardTitle>
          <CardDescription>Users operating under this client&apos;s API key</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignedUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-sm">{u.user_id}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => unassignMutation.mutate(u.user_id)}>
                      Unassign
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {assignedUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                    No users assigned.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {unassignedUsers.length > 0 && (
            <div className="mt-4 space-y-2">
              <Label>Assign unassigned user</Label>
              <Select onValueChange={(userId) => assignMutation.mutate(userId)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user to assign" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedUsers.map((u) => (
                    <SelectItem key={u.id} value={u.user_id}>
                      {u.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rotated key display */}
      <Dialog open={!!shownKey} onOpenChange={() => setShownKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API Key</DialogTitle>
            <DialogDescription>This key will only be shown once.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 py-4">
            <Input value={shownKey || ""} readOnly className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={copyKey}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShownKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
