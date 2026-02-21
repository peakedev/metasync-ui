"use client";

import { useParams } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StreamDetail { _id: string; model: string; temperature: number; status: string; userPrompt: string; response: string; metrics?: { tokens?: number; cost?: number; duration?: number }; }

export default function StreamDetailPage() {
  const { tenantSlug, id } = useParams<{ tenantSlug: string; id: string }>();
  const { data: stream, isLoading } = useMetaSyncProxy<StreamDetail>({ path: `/stream/${id}`, tenantSlug });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (!stream) return <div className="text-muted-foreground">Stream not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Stream Detail</h1>
        <div className="flex gap-2">
          <Badge variant="outline">{stream.model}</Badge>
          <Badge variant={stream.status === "COMPLETED" ? "secondary" : "destructive"}>{stream.status}</Badge>
        </div>
      </div>
      <div className="space-y-4">
        <div className="flex justify-end"><div className="max-w-[70%] rounded-lg bg-primary p-3 text-primary-foreground"><p className="text-sm">{stream.userPrompt}</p></div></div>
        <div className="flex justify-start"><div className="max-w-[70%] rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground mb-1">{stream.model}</p><p className="text-sm whitespace-pre-wrap">{stream.response}</p></div></div>
      </div>
      {stream.metrics && (
        <Card>
          <CardHeader><CardTitle>Metrics</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted-foreground">Tokens:</span> {stream.metrics.tokens}</div>
            <div><span className="text-muted-foreground">Cost:</span> ${stream.metrics.cost?.toFixed(4)}</div>
            <div><span className="text-muted-foreground">Duration:</span> {stream.metrics.duration}ms</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
