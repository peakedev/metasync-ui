"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ModelDetail {
  _id: string;
  name: string;
  sdk: string;
  endpoint: string;
  apiType?: string;
  apiVersion?: string;
  deployment?: string;
  service?: string;
  maxToken?: number;
  minTemperature?: number;
  maxTemperature?: number;
}

export default function ModelDetailPage() {
  const { tenantSlug, id } = useParams<{ tenantSlug: string; id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({});
  const [formInit, setFormInit] = useState(false);

  const { data: model, isLoading } = useMetaSyncProxy<ModelDetail>({
    path: `/models/${id}`,
    tenantSlug,
  });

  if (model && !formInit) {
    setForm({
      name: model.name || "",
      endpoint: model.endpoint || "",
      apiType: model.apiType || "",
      apiVersion: model.apiVersion || "",
      deployment: model.deployment || "",
      service: model.service || "",
      maxToken: model.maxToken?.toString() || "",
      minTemperature: model.minTemperature?.toString() || "",
      maxTemperature: model.maxTemperature?.toString() || "",
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
    const payload: Record<string, unknown> = { ...form };
    if (form.maxToken) payload.maxToken = parseInt(form.maxToken);
    if (form.minTemperature) payload.minTemperature = parseFloat(form.minTemperature);
    if (form.maxTemperature) payload.maxTemperature = parseFloat(form.maxTemperature);
    updateMutation.mutate(payload, { onSuccess: () => toast.success("Model updated") });
  }

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
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
              <Input value={form.apiType || ""} onChange={(e) => setForm({ ...form, apiType: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>API Version</Label>
              <Input value={form.apiVersion || ""} onChange={(e) => setForm({ ...form, apiVersion: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input type="number" value={form.maxToken || ""} onChange={(e) => setForm({ ...form, maxToken: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Min Temp</Label>
              <Input type="number" step="0.1" value={form.minTemperature || ""} onChange={(e) => setForm({ ...form, minTemperature: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Max Temp</Label>
              <Input type="number" step="0.1" value={form.maxTemperature || ""} onChange={(e) => setForm({ ...form, maxTemperature: e.target.value })} />
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
