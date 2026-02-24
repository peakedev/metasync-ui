"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Play, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface WorkerDetail { _id: string; workerId: string; status: string; config?: { pollInterval?: number; maxItemsPerBatch?: number }; }

export default function WorkerDetailPage() {
  const { tenantSlug, id } = useParams<{ tenantSlug: string; id: string }>();
  const router = useRouter();
  const [pollInterval, setPollInterval] = useState("");
  const [maxBatch, setMaxBatch] = useState("");
  const [init, setInit] = useState(false);

  const { data: worker, isPending, error } = useMetaSyncProxy<WorkerDetail>({ path: `/workers/${id}`, tenantSlug });

  if (worker && !init) { setPollInterval(worker.config?.pollInterval?.toString() || ""); setMaxBatch(worker.config?.maxItemsPerBatch?.toString() || ""); setInit(true); }

  const isRunning = worker?.status === "RUNNING";
  const updateMutation = useMetaSyncMutation<Record<string, unknown>, void>({ path: `/workers/${id}`, method: "PATCH", tenantSlug, invalidateKeys: [["metasync", tenantSlug, `/workers/${id}`]] });
  const startMutation = useMetaSyncMutation<Record<string, never>, void>({ path: `/workers/${id}/start`, method: "POST", tenantSlug, invalidateKeys: [["metasync", tenantSlug, `/workers/${id}`], ["metasync", tenantSlug, "/workers"]] });
  const stopMutation = useMetaSyncMutation<Record<string, never>, void>({ path: `/workers/${id}/stop`, method: "POST", tenantSlug, invalidateKeys: [["metasync", tenantSlug, `/workers/${id}`], ["metasync", tenantSlug, "/workers"]] });
  const deleteMutation = useMetaSyncMutation<Record<string, never>, void>({ path: `/workers/${id}`, method: "DELETE", tenantSlug, invalidateKeys: [["metasync", tenantSlug, "/workers"]] });

  if (isPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>;
  if (error) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Worker</h1><MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} /></div>;
  if (!worker) return <div className="text-muted-foreground">Worker not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{worker.workerId}</h1>
        <Badge variant={isRunning ? "secondary" : "outline"}>{worker.status}</Badge>
      </div>
      <div className="flex gap-2">
        {!isRunning && <Button onClick={() => startMutation.mutate({} as never, { onSuccess: () => toast.success("Worker started") })}><Play className="mr-2 h-4 w-4" />Start</Button>}
        {isRunning && <Button variant="outline" onClick={() => stopMutation.mutate({} as never, { onSuccess: () => toast.success("Worker stopped") })}><Square className="mr-2 h-4 w-4" />Stop</Button>}
        <Button variant="destructive" disabled={isRunning} onClick={() => { if (confirm("Delete this worker?")) deleteMutation.mutate({} as never, { onSuccess: () => router.push(`/${tenantSlug}/workers`) }); }}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Poll Interval (ms)</Label><Input type="number" value={pollInterval} onChange={e => setPollInterval(e.target.value)} disabled={isRunning} /></div>
            <div className="space-y-2"><Label>Max Batch Size</Label><Input type="number" value={maxBatch} onChange={e => setMaxBatch(e.target.value)} disabled={isRunning} /></div>
          </div>
          <Button disabled={isRunning || updateMutation.isPending} onClick={() => updateMutation.mutate({ config: { pollInterval: parseInt(pollInterval), maxItemsPerBatch: parseInt(maxBatch) } }, { onSuccess: () => toast.success("Config updated") })}>
            {updateMutation.isPending ? "Saving..." : "Save Config"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
