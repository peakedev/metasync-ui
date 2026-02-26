"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/hooks/use-tenant";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { useClientContext } from "@/contexts/client-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Copy, Check, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ClientDetail {
  clientId: string;
  name: string;
  enabled: boolean;
  createdAt: string;
}

export default function ClientDetailPage() {
  const { tenantSlug, id } = useParams<{ tenantSlug: string; id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: tenant } = useTenant(tenantSlug);
  const { clientsWithKeys } = useClientContext();
  const [editName, setEditName] = useState("");
  const [nameInit, setNameInit] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clientApiKey, setClientApiKey] = useState("");

  const { data: client, isPending, error } = useMetaSyncProxy<ClientDetail>({
    path: `/clients/${id}`,
    tenantSlug,
  });

  // Users assigned to this client (from junction table)
  const { data: assignedUsers = [] } = useQuery({
    queryKey: ["client-users", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_client_assignments")
        .select("id, user_id, client_id")
        .eq("client_id", id);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant,
  });

  // All tenant users (tenant_user role) who are NOT assigned to this client
  const { data: unassignedUsers = [] } = useQuery({
    queryKey: ["unassigned-users", tenant?.id, id],
    queryFn: async () => {
      const { data: members, error: memErr } = await supabase
        .from("tenant_memberships")
        .select("user_id")
        .eq("tenant_id", tenant!.id)
        .eq("role", "tenant_user");
      if (memErr) throw memErr;

      const { data: assigned, error: assErr } = await supabase
        .from("user_client_assignments")
        .select("user_id")
        .eq("client_id", id);
      if (assErr) throw assErr;

      const assignedIds = new Set((assigned || []).map((a) => a.user_id));
      return (members || []).filter((m) => !assignedIds.has(m.user_id));
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

  const storeKeyMutation = useMutation({
    mutationFn: async (key: string) => {
      const { data, error } = await supabase.functions.invoke("proxy", {
        body: {
          action: "store_client_key",
          tenantId: tenant!.id,
          clientId: id,
          key,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      setClientApiKey("");
      queryClient.invalidateQueries({ queryKey: ["client-keys-check"] });
      toast.success("Client API key saved");
    },
    onError: (err) => {
      toast.error(`Failed to save client key: ${err.message}`);
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-assignments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "assign", userId, clientId: id, tenantId: tenant!.id }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", id] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-users", tenant?.id, id] });
      toast.success("User assigned");
    },
    onError: (err) => {
      toast.error(`Failed to assign user: ${err.message}`);
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-assignments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "unassign", userId, clientId: id, tenantId: tenant!.id }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", id] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-users", tenant?.id, id] });
      toast.success("User unassigned");
    },
    onError: (err) => {
      toast.error(`Failed to unassign user: ${err.message}`);
    },
  });

  function copyKey() {
    if (shownKey) {
      navigator.clipboard.writeText(shownKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (isPending) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Client</h1>
        <MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} />
      </div>
    );
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
          <CardTitle>Client API Key</CardTitle>
          <CardDescription>
            Store the client API key in Vault so this client can be selected and used for scoped API calls.
            The key is stored securely and never displayed after saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="password"
              value={clientApiKey}
              onChange={(e) => setClientApiKey(e.target.value)}
              placeholder="Enter client API key"
            />
            <Button
              onClick={() => storeKeyMutation.mutate(clientApiKey)}
              disabled={storeKeyMutation.isPending || !clientApiKey}
            >
              {storeKeyMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
          <div>
            {clientsWithKeys.has(id) ? (
              <Badge variant="secondary">Configured</Badge>
            ) : (
              <Badge variant="outline">Not configured</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assigned Users</CardTitle>
          <CardDescription>Users operating under this client&apos;s API key. A user can be assigned to multiple clients.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignedUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-sm">{u.user_id}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => unassignMutation.mutate(u.user_id)}>
                      Unassign
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {assignedUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                    No users assigned.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {unassignedUsers.length > 0 && (
            <div className="mt-4 space-y-2">
              <Label>Assign a tenant user</Label>
              <Select onValueChange={(userId) => assignMutation.mutate(userId)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user to assign" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedUsers.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
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
