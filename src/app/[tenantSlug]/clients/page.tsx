"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTenant } from "@/hooks/use-tenant";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Plus, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface Client {
  _id: string;
  name: string;
  enabled: boolean;
  apiKey?: string;
  createdAt: string;
}

export default function ClientsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const { data: tenant } = useTenant(tenantSlug);
  const [createOpen, setCreateOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: clients, isLoading, error } = useMetaSyncProxy<Client[]>({
    path: "/clients",
    tenantSlug,
  });

  const createMutation = useMetaSyncMutation<{ name: string }, Client>({
    path: "/clients",
    method: "POST",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/clients"]],
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(
      { name: newClientName },
      {
        onSuccess: (data) => {
          if (data.apiKey) {
            setShownKey(data.apiKey);
          }
          setNewClientName("");
          setCreateOpen(false);
          toast.success("Client created");
        },
      }
    );
  }

  function copyKey() {
    if (shownKey) {
      navigator.clipboard.writeText(shownKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Client
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Key Stored</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(clients || []).map((client) => (
              <TableRow
                key={client._id}
                className="cursor-pointer"
                onClick={() => router.push(`/${tenantSlug}/clients/${client._id}`)}
              >
                <TableCell className="font-medium">{client.name}</TableCell>
                <TableCell>
                  <Badge variant={client.enabled ? "secondary" : "outline"}>
                    {client.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">Stored</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(client.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
            {(!clients || clients.length === 0) && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No clients yet. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create Client</DialogTitle>
              <DialogDescription>Create a new MetaSync client for this tenant.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <Label htmlFor="clientName">Client Name</Label>
              <Input
                id="clientName"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* API key display dialog */}
      <Dialog open={!!shownKey} onOpenChange={() => setShownKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client API Key</DialogTitle>
            <DialogDescription>
              This key will only be shown once. Copy it now and store it safely.
            </DialogDescription>
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
