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
interface Prompt { _id: string; name: string; }

export default function NewRunPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const [form, setForm] = useState({ evalModel: "", metaModel: "", evalPromptId: "", metaPromptId: "", maxIterations: "5", temperature: "0.7", priority: "1", requestData: "{}" });
  const [workingModels, setWorkingModels] = useState<string[]>([]);

  const { data: models } = useMetaSyncProxy<Model[]>({ path: "/models", tenantSlug });
  const { data: prompts } = useMetaSyncProxy<Prompt[]>({ path: "/prompts", tenantSlug });

  const createMutation = useMetaSyncMutation<Record<string, unknown>, { _id: string }>({
    path: "/runs", method: "POST", tenantSlug, invalidateKeys: [["metasync", tenantSlug, "/runs"]],
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let requestData;
    try { requestData = JSON.parse(form.requestData); } catch { toast.error("Invalid JSON"); return; }
    createMutation.mutate({
      evalModel: form.evalModel, metaModel: form.metaModel, evalPromptId: form.evalPromptId, metaPromptId: form.metaPromptId,
      workingModels, maxIterations: parseInt(form.maxIterations), temperature: parseFloat(form.temperature), priority: parseInt(form.priority), requestData,
    }, { onSuccess: () => { toast.success("Run created"); router.push(`/${tenantSlug}/runs`); } });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Create Run</h1>
      <Card>
        <CardHeader><CardTitle>Run Configuration</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Eval Model</Label><Select value={form.evalModel} onValueChange={v => setForm({...form, evalModel: v})}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{(models || []).map(m => <SelectItem key={m._id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Meta Model</Label><Select value={form.metaModel} onValueChange={v => setForm({...form, metaModel: v})}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{(models || []).map(m => <SelectItem key={m._id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Eval Prompt</Label><Select value={form.evalPromptId} onValueChange={v => setForm({...form, evalPromptId: v})}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{(prompts || []).map(p => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Meta Prompt</Label><Select value={form.metaPromptId} onValueChange={v => setForm({...form, metaPromptId: v})}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{(prompts || []).map(p => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Max Iterations</Label><Input type="number" value={form.maxIterations} onChange={e => setForm({...form, maxIterations: e.target.value})} /></div>
              <div className="space-y-2"><Label>Temperature</Label><Input type="number" step="0.1" value={form.temperature} onChange={e => setForm({...form, temperature: e.target.value})} /></div>
              <div className="space-y-2"><Label>Priority</Label><Input type="number" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})} /></div>
            </div>
            <div className="space-y-2"><Label>Request Data (JSON)</Label><Textarea value={form.requestData} onChange={e => setForm({...form, requestData: e.target.value})} rows={4} className="font-mono text-sm" /></div>
            <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Run"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
