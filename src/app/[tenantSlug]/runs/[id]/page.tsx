"use client";

import { useParams } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Pause, Play, X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface RunDetail { _id: string; status: string; currentIteration: number; maxIterations: number; currentModelIndex?: number; currentJobId?: string; modelRuns?: Array<{ model: string; iterations: Array<{ iteration: number; status: string; evalResult?: string; suggestedPrompt?: string }>; metrics?: { tokens?: number; cost?: number; duration?: number } }>; metrics?: { tokens?: number; cost?: number; duration?: number }; }

export default function RunDetailPage() {
  const { tenantSlug, id } = useParams<{ tenantSlug: string; id: string }>();
  const { data: run, isPending, error } = useMetaSyncProxy<RunDetail>({ path: `/runs/${id}`, tenantSlug });

  const pauseMutation = useMetaSyncMutation<Record<string, never>, void>({ path: `/runs/${id}/pause`, method: "PATCH", tenantSlug, invalidateKeys: [["metasync", tenantSlug, `/runs/${id}`]] });
  const resumeMutation = useMetaSyncMutation<Record<string, never>, void>({ path: `/runs/${id}/resume`, method: "PATCH", tenantSlug, invalidateKeys: [["metasync", tenantSlug, `/runs/${id}`]] });
  const cancelMutation = useMetaSyncMutation<Record<string, never>, void>({ path: `/runs/${id}/cancel`, method: "PATCH", tenantSlug, invalidateKeys: [["metasync", tenantSlug, `/runs/${id}`]] });

  if (isPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (error) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Run</h1><MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} /></div>;
  if (!run) return <div className="text-muted-foreground">Run not found</div>;

  const isRunning = run.status === "RUNNING";
  const isPaused = run.status === "PAUSED";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Run Detail</h1>
        <Badge variant="outline" className="text-base">{run.status}</Badge>
      </div>

      <div className="flex gap-2">
        {isRunning && <Button variant="outline" onClick={() => pauseMutation.mutate({} as never, { onSuccess: () => toast.success("Run paused") })}><Pause className="mr-2 h-4 w-4" />Pause</Button>}
        {isPaused && <Button onClick={() => resumeMutation.mutate({} as never, { onSuccess: () => toast.success("Run resumed") })}><Play className="mr-2 h-4 w-4" />Resume</Button>}
        {(isRunning || isPaused) && <Button variant="destructive" onClick={() => cancelMutation.mutate({} as never, { onSuccess: () => toast.success("Run cancelled") })}><X className="mr-2 h-4 w-4" />Cancel</Button>}
      </div>

      <Card>
        <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span>Iteration</span><span>{run.currentIteration} / {run.maxIterations}</span></div>
            <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(run.currentIteration / run.maxIterations) * 100}%` }} /></div>
          </div>
          {run.currentJobId && <p className="mt-4 text-sm">Current Job: <Link href={`/${tenantSlug}/jobs/${run.currentJobId}`} className="text-primary underline">{run.currentJobId}</Link></p>}
        </CardContent>
      </Card>

      {run.modelRuns?.map((mr, i) => (
        <Card key={i}>
          <CardHeader><CardTitle>{mr.model}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Iteration</TableHead><TableHead>Status</TableHead><TableHead>Eval Result</TableHead><TableHead>Suggested Prompt</TableHead></TableRow></TableHeader>
              <TableBody>
                {(mr.iterations || []).map((iter, j) => (
                  <TableRow key={j}>
                    <TableCell>{iter.iteration}</TableCell>
                    <TableCell><Badge variant="outline">{iter.status}</Badge></TableCell>
                    <TableCell className="text-sm">{iter.evalResult || "-"}</TableCell>
                    <TableCell className="text-sm truncate max-w-xs">{iter.suggestedPrompt || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {mr.metrics && <div className="mt-4 flex gap-4 text-sm text-muted-foreground">{mr.metrics.tokens && <span>{mr.metrics.tokens} tokens</span>}{mr.metrics.cost && <span>${mr.metrics.cost.toFixed(4)}</span>}{mr.metrics.duration && <span>{mr.metrics.duration}ms</span>}</div>}
          </CardContent>
        </Card>
      ))}

      {run.metrics && (
        <Card>
          <CardHeader><CardTitle>Overall Metrics</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted-foreground">Total Tokens:</span> {run.metrics.tokens}</div>
            <div><span className="text-muted-foreground">Total Cost:</span> ${run.metrics.cost?.toFixed(4)}</div>
            <div><span className="text-muted-foreground">Total Duration:</span> {run.metrics.duration}ms</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
