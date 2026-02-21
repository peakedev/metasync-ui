"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Plus, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const SDK_TYPES = [
  "ChatCompletionsClient",
  "AzureOpenAI",
  "Anthropic",
  "Gemini",
  "test",
];

interface Model {
  _id: string;
  name: string;
  sdk: string;
  endpoint: string;
  enabled?: boolean;
  key?: string;
  createdAt: string;
}

export default function ModelsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    name: "", sdk: "", endpoint: "", apiType: "", apiVersion: "",
    deployment: "", service: "", key: "", maxToken: "",
    minTemperature: "", maxTemperature: "",
  });

  const { data: models, isLoading, error } = useMetaSyncProxy<Model[]>({
    path: "/models",
    tenantSlug,
  });

  const createMutation = useMetaSyncMutation<Record<string, unknown>, Model>({
    path: "/models",
    method: "POST",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/models"]],
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    if (form.maxToken) payload.maxToken = parseInt(form.maxToken);
    if (form.minTemperature) payload.minTemperature = parseFloat(form.minTemperature);
    if (form.maxTemperature) payload.maxTemperature = parseFloat(form.maxTemperature);

    createMutation.mutate(payload, {
      onSuccess: (data) => {
        if (data.key) setShownKey(data.key);
        setCreateOpen(false);
        setForm({ name: "", sdk: "", endpoint: "", apiType: "", apiVersion: "", deployment: "", service: "", key: "", maxToken: "", minTemperature: "", maxTemperature: "" });
        toast.success("Model created");
      },
    });
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
        <h1 className="text-2xl font-semibold">Models</h1>
        <MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Models</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Model
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SDK</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(models || []).map((model) => (
              <TableRow key={model._id} className="cursor-pointer" onClick={() => router.push(`/${tenantSlug}/models/${model._id}`)}>
                <TableCell className="font-medium">{model.name}</TableCell>
                <TableCell><Badge variant="outline">{model.sdk}</Badge></TableCell>
                <TableCell className="text-muted-foreground truncate max-w-xs">{model.endpoint}</TableCell>
                <TableCell><Badge variant="secondary">Active</Badge></TableCell>
              </TableRow>
            ))}
            {(!models || models.length === 0) && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No models configured yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create Model</DialogTitle>
              <DialogDescription>Configure an LLM model for this tenant.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>SDK *</Label>
                <Select value={form.sdk} onValueChange={(v) => setForm({ ...form, sdk: v })}>
                  <SelectTrigger><SelectValue placeholder="Select SDK type" /></SelectTrigger>
                  <SelectContent>
                    {SDK_TYPES.map((sdk) => <SelectItem key={sdk} value={sdk}>{sdk}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Endpoint *</Label>
                <Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input type="password" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>API Type</Label>
                  <Input value={form.apiType} onChange={(e) => setForm({ ...form, apiType: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>API Version</Label>
                  <Input value={form.apiVersion} onChange={(e) => setForm({ ...form, apiVersion: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Deployment</Label>
                  <Input value={form.deployment} onChange={(e) => setForm({ ...form, deployment: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Service</Label>
                  <Input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input type="number" value={form.maxToken} onChange={(e) => setForm({ ...form, maxToken: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Min Temp</Label>
                  <Input type="number" step="0.1" value={form.minTemperature} onChange={(e) => setForm({ ...form, minTemperature: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Temp</Label>
                  <Input type="number" step="0.1" value={form.maxTemperature} onChange={(e) => setForm({ ...form, maxTemperature: e.target.value })} />
                </div>
              </div>
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

      <Dialog open={!!shownKey} onOpenChange={() => setShownKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Model API Key</DialogTitle>
            <DialogDescription>This key will only be shown once.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 py-4">
            <Input value={shownKey || ""} readOnly className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={copyKey}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter><Button onClick={() => setShownKey(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
