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
import { Plus, Copy, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const SDK_TYPES = [
  "ChatCompletionsClient",
  "AzureOpenAI",
  "Anthropic",
  "Gemini",
  "OpenAI",
  "test",
];

const API_TYPES = ["anthropic", "foundry", "google-ai"];
const SERVICES = ["google", "azure-ai", "anthropic"];
const MAX_TOKEN_FIELDS = ["maxToken", "maxCompletionToken"];
const CURRENCIES = ["USD", "EUR"];

interface Model {
  model_id: string;
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
    deployment: "", service: "", key: "", maxTokenValue: "",
    maxTokenField: "maxToken" as string,
    minTemperature: "", maxTemperature: "",
    costTokens: "", costCurrency: "USD", costInput: "", costOutput: "",
  });

  const { data: models, isPending, error, refetch, isRefetching } = useMetaSyncProxy<Model[]>({
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
    const { maxTokenValue, maxTokenField, costTokens, costCurrency, costInput, costOutput, ...rest } = form;
    const payload: Record<string, unknown> = { ...rest };

    if (maxTokenValue) payload[maxTokenField] = parseInt(maxTokenValue);
    if (form.minTemperature) payload.minTemperature = parseFloat(form.minTemperature);
    if (form.maxTemperature) payload.maxTemperature = parseFloat(form.maxTemperature);

    // Remove transient fields that shouldn't be sent
    delete payload.maxTokenValue;
    delete payload.maxTokenField;
    delete payload.costTokens;
    delete payload.costCurrency;
    delete payload.costInput;
    delete payload.costOutput;

    if (costTokens && costInput && costOutput) {
      payload.cost = {
        tokens: parseInt(costTokens),
        currency: costCurrency,
        input: parseFloat(costInput),
        output: parseFloat(costOutput),
      };
    }

    createMutation.mutate(payload, {
      onSuccess: (data) => {
        if (data.key) setShownKey(data.key);
        setCreateOpen(false);
        setForm({ name: "", sdk: "", endpoint: "", apiType: "", apiVersion: "", deployment: "", service: "", key: "", maxTokenValue: "", maxTokenField: "maxToken", minTemperature: "", maxTemperature: "", costTokens: "", costCurrency: "USD", costInput: "", costOutput: "" });
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
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Models</h1>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Model
        </Button>
      </div>

      {isPending ? (
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
              <TableRow key={model.model_id} className="cursor-pointer" onClick={() => router.push(`/${tenantSlug}/models/${model.model_id}`)}>
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
                  <Select value={form.apiType} onValueChange={(v) => setForm({ ...form, apiType: v })}>
                    <SelectTrigger><SelectValue placeholder="Select API type" /></SelectTrigger>
                    <SelectContent>
                      {API_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
                  <Select value={form.service} onValueChange={(v) => setForm({ ...form, service: v })}>
                    <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                    <SelectContent>
                      {SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Max Tokens Field</Label>
                <Select value={form.maxTokenField} onValueChange={(v) => setForm({ ...form, maxTokenField: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAX_TOKEN_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input type="number" value={form.maxTokenValue} onChange={(e) => setForm({ ...form, maxTokenValue: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Min Temp (0-1)</Label>
                  <Input type="number" step="0.01" min="0" max="1" value={form.minTemperature} onChange={(e) => setForm({ ...form, minTemperature: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Temp (0-1)</Label>
                  <Input type="number" step="0.01" min="0" max="1" value={form.maxTemperature} onChange={(e) => setForm({ ...form, maxTemperature: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-base font-medium">Cost</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Token Base</Label>
                    <Input type="number" placeholder="e.g. 1000000" value={form.costTokens} onChange={(e) => setForm({ ...form, costTokens: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={form.costCurrency} onValueChange={(v) => setForm({ ...form, costCurrency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Input Cost</Label>
                    <Input type="number" step="0.01" placeholder="e.g. 3" value={form.costInput} onChange={(e) => setForm({ ...form, costInput: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Output Cost</Label>
                    <Input type="number" step="0.01" placeholder="e.g. 15" value={form.costOutput} onChange={(e) => setForm({ ...form, costOutput: e.target.value })} />
                  </div>
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
