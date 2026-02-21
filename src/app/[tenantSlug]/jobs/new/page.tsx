"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Model { _id: string; name: string; }

export default function NewJobPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const [isBatch, setIsBatch] = useState(false);
  const [form, setForm] = useState({
    operation: "completion",
    model: "",
    temperature: "0.7",
    priority: "1",
    requestData: "{}",
    clientReference: "",
  });

  const { data: models } = useMetaSyncProxy<Model[]>({ path: "/models", tenantSlug });

  const createMutation = useMetaSyncMutation<Record<string, unknown>, unknown>({
    path: isBatch ? "/jobs/batch" : "/jobs",
    method: "POST",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/jobs"]],
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let requestData;
    try { requestData = JSON.parse(form.requestData); } catch { toast.error("Invalid JSON in request data"); return; }

    const payload = {
      operation: form.operation,
      model: form.model,
      temperature: parseFloat(form.temperature),
      priority: parseInt(form.priority),
      requestData,
      clientReference: form.clientReference || undefined,
    };

    const body: Record<string, unknown> = isBatch ? { jobs: [payload] } : payload;
    createMutation.mutate(body, {
      onSuccess: () => { toast.success("Job created"); router.push(`/${tenantSlug}/jobs`); },
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Create Job</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Job Configuration
            <Button size="sm" variant="outline" onClick={() => setIsBatch(!isBatch)}>
              {isBatch ? "Single Mode" : "Batch Mode"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Operation</Label>
                <Select value={form.operation} onValueChange={(v) => setForm({ ...form, operation: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completion">Completion</SelectItem>
                    <SelectItem value="evaluation">Evaluation</SelectItem>
                    <SelectItem value="meta">Meta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
                  <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                  <SelectContent>
                    {(models || []).map((m) => <SelectItem key={m._id} value={m.name}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Temperature</Label>
                <Input type="number" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Client Reference</Label>
                <Input value={form.clientReference} onChange={(e) => setForm({ ...form, clientReference: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Request Data (JSON)</Label>
              <Textarea value={form.requestData} onChange={(e) => setForm({ ...form, requestData: e.target.value })} rows={6} className="font-mono text-sm" />
            </div>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : isBatch ? "Create Batch" : "Create Job"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
