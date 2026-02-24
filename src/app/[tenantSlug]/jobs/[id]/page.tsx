"use client";

import { useParams } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { toast } from "sonner";

interface JobDetail {
  _id: string;
  status: string;
  operation: string;
  model: string;
  temperature: number;
  priority: number;
  requestData: unknown;
  responseData: unknown;
  clientReference?: string;
  metrics?: { tokens?: number; cost?: number; duration?: number };
  evalResult?: unknown;
  createdAt: string;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CANCELED"],
  PROCESSED: ["CONSUMED", "ERROR_CONSUMING"],
};

function JsonViewer({ data, label }: { data: unknown; label: string }) {
  if (!data) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <pre className="overflow-auto rounded border bg-muted p-3 text-xs max-h-64">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default function JobDetailPage() {
  const { tenantSlug, id } = useParams<{ tenantSlug: string; id: string }>();

  const { data: job, isPending, error } = useMetaSyncProxy<JobDetail>({
    path: `/jobs/${id}`,
    tenantSlug,
  });

  const updateMutation = useMetaSyncMutation<{ status: string }, JobDetail>({
    path: `/jobs/${id}`,
    method: "PATCH",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, `/jobs/${id}`], ["metasync", tenantSlug, "/jobs"]],
  });

  if (isPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (error) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Job</h1><MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} /></div>;
  if (!job) return <div className="text-muted-foreground">Job not found</div>;

  const validTransitions = VALID_TRANSITIONS[job.status] || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Job Detail</h1>
        <Badge variant="outline" className="text-base">{job.status}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle>Job Info</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">Operation:</span> {job.operation}</div>
          <div><span className="text-muted-foreground">Model:</span> {job.model}</div>
          <div><span className="text-muted-foreground">Temperature:</span> {job.temperature}</div>
          <div><span className="text-muted-foreground">Priority:</span> {job.priority}</div>
          <div><span className="text-muted-foreground">Reference:</span> {job.clientReference || "-"}</div>
          <div><span className="text-muted-foreground">Created:</span> {new Date(job.createdAt).toLocaleString()}</div>
        </CardContent>
      </Card>

      {validTransitions.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Status Actions</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            {validTransitions.map((status) => (
              <Button
                key={status}
                variant="outline"
                onClick={() => {
                  if (confirm(`Change status to ${status}?`)) {
                    updateMutation.mutate({ status }, { onSuccess: () => toast.success(`Status updated to ${status}`) });
                  }
                }}
                disabled={updateMutation.isPending}
              >
                {status}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {job.metrics && (
        <Card>
          <CardHeader><CardTitle>Metrics</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted-foreground">Tokens:</span> {job.metrics.tokens}</div>
            <div><span className="text-muted-foreground">Cost:</span> ${job.metrics.cost?.toFixed(4)}</div>
            <div><span className="text-muted-foreground">Duration:</span> {job.metrics.duration}ms</div>
          </CardContent>
        </Card>
      )}

      <JsonViewer data={job.requestData} label="Request Data" />
      <JsonViewer data={job.responseData} label="Response Data" />
      <JsonViewer data={job.evalResult} label="Eval Result" />
    </div>
  );
}
