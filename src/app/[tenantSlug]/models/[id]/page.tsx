"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

const API_TYPES = ["anthropic", "foundry", "google-ai"];
const SERVICES = ["google", "azure-ai", "anthropic"];
const MAX_TOKEN_FIELDS = ["maxToken", "maxCompletionToken"];
const CURRENCIES = ["USD", "EUR"];

interface ModelDetail {
  model_id: string;
  name: string;
  sdk: string;
  endpoint: string;
  apiType?: string;
  apiVersion?: string;
  deployment?: string;
  service?: string;
  maxToken?: number;
  maxCompletionToken?: number;
  minTemperature?: number;
  maxTemperature?: number;
  cost?: {
    tokens: number;
    currency: string;
    input: number;
    output: number;
  };
}

export default function ModelDetailPage() {
  const { tenantSlug, id } = useParams<{ tenantSlug: string; id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({});
  const [formInit, setFormInit] = useState(false);

  const { data: model, isPending, error } = useMetaSyncProxy<ModelDetail>({
    path: `/models/${id}`,
    tenantSlug,
  });

  if (model && !formInit) {
    const hasMaxCompletionToken = model.maxCompletionToken != null;
    setForm({
      name: model.name || "",
      endpoint: model.endpoint || "",
      apiType: model.apiType || "",
      apiVersion: model.apiVersion || "",
      deployment: model.deployment || "",
      service: model.service || "",
      maxTokenField: hasMaxCompletionToken ? "maxCompletionToken" : "maxToken",
      maxTokenValue: (hasMaxCompletionToken ? model.maxCompletionToken : model.maxToken)?.toString() || "",
      minTemperature: model.minTemperature?.toString() || "",
      maxTemperature: model.maxTemperature?.toString() || "",
      costTokens: model.cost?.tokens?.toString() || "",
      costCurrency: model.cost?.currency || "USD",
      costInput: model.cost?.input?.toString() || "",
      costOutput: model.cost?.output?.toString() || "",
    });
    setFormInit(true);
  }

  const updateMutation = useMetaSyncMutation<Record<string, unknown>, ModelDetail>({
    path: `/models/${id}`,
    method: "PATCH",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, `/models/${id}`], ["metasync", tenantSlug, "/models"]],
  });

  const deleteMutation = useMetaSyncMutation<Record<string, never>, void>({
    path: `/models/${id}`,
    method: "DELETE",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/models"]],
  });

  function handleSave() {
    const { maxTokenValue, maxTokenField, costTokens, costCurrency, costInput, costOutput, ...rest } = form;
    const payload: Record<string, unknown> = { ...rest };

    if (maxTokenValue) payload[maxTokenField] = parseInt(maxTokenValue);
    if (form.minTemperature) payload.minTemperature = parseFloat(form.minTemperature);
    if (form.maxTemperature) payload.maxTemperature = parseFloat(form.maxTemperature);

    // Remove transient fields
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

    updateMutation.mutate(payload, { onSuccess: () => toast.success("Model updated") });
  }

  if (isPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (error) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Model</h1><MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} /></div>;
  if (!model) return <div className="text-muted-foreground">Model not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{model.name}</h1>
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm("Delete this model?")) {
              deleteMutation.mutate({} as Record<string, never>, {
                onSuccess: () => router.push(`/${tenantSlug}/models`),
              });
            }
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Model Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>SDK</Label>
              <Input value={model.sdk} disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Endpoint</Label>
            <Input value={form.endpoint || ""} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>API Type</Label>
              <Select value={form.apiType || ""} onValueChange={(v) => setForm({ ...form, apiType: v })}>
                <SelectTrigger><SelectValue placeholder="Select API type" /></SelectTrigger>
                <SelectContent>
                  {API_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>API Version</Label>
              <Input value={form.apiVersion || ""} onChange={(e) => setForm({ ...form, apiVersion: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Deployment</Label>
              <Input value={form.deployment || ""} onChange={(e) => setForm({ ...form, deployment: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Service</Label>
              <Select value={form.service || ""} onValueChange={(v) => setForm({ ...form, service: v })}>
                <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                <SelectContent>
                  {SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Max Tokens Field</Label>
            <Select value={form.maxTokenField || "maxToken"} onValueChange={(v) => setForm({ ...form, maxTokenField: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MAX_TOKEN_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input type="number" value={form.maxTokenValue || ""} onChange={(e) => setForm({ ...form, maxTokenValue: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Min Temp (0-1)</Label>
              <Input type="number" step="0.01" min="0" max="1" value={form.minTemperature || ""} onChange={(e) => setForm({ ...form, minTemperature: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Max Temp (0-1)</Label>
              <Input type="number" step="0.01" min="0" max="1" value={form.maxTemperature || ""} onChange={(e) => setForm({ ...form, maxTemperature: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-base font-medium">Cost</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Token Base</Label>
                <Input type="number" placeholder="e.g. 1000000" value={form.costTokens || ""} onChange={(e) => setForm({ ...form, costTokens: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.costCurrency || "USD"} onValueChange={(v) => setForm({ ...form, costCurrency: v })}>
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
                <Input type="number" step="0.01" placeholder="e.g. 3" value={form.costInput || ""} onChange={(e) => setForm({ ...form, costInput: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Output Cost</Label>
                <Input type="number" step="0.01" placeholder="e.g. 15" value={form.costOutput || ""} onChange={(e) => setForm({ ...form, costOutput: e.target.value })} />
              </div>
            </div>
          </div>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
