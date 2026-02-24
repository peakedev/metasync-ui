"use client";

import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import {
  Clock,
  Cpu,
  DollarSign,
  Zap,
  ArrowUpRight,
  ArrowDownLeft,
  Timer,
  Tag,
} from "lucide-react";
import { formatCost, formatDuration, formatDate } from "@/lib/formatters";
import type { ProcessingMetrics } from "@/types/processing-metrics";

interface StreamFullDetail {
  _id: string;
  streamId: string;
  clientId: string;
  model: string;
  temperature: number;
  status: string;
  requestData: {
    userPrompt: string;
    additionalPrompts: string[] | null;
    systemPrompt: string | null;
  } | null;
  responseData: {
    text: string;
  } | null;
  processingMetrics: ProcessingMetrics | null;
  clientReference: Record<string, unknown> | string | null;
  _metadata: {
    createdAt: string;
    completedAt: string | null;
    isDeleted: boolean;
    deletedAt: string | null;
    updatedAt: string | null;
    archivedAt: string | null;
    createdBy: string | null;
    updatedBy: string | null;
    deletedBy: string | null;
  };
}

function parseClientReference(
  ref: StreamFullDetail["clientReference"]
): Record<string, unknown> | null {
  if (ref == null) return null;
  if (typeof ref === "object") return ref;
  try {
    const parsed = JSON.parse(ref);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right">{children}</span>
    </div>
  );
}

interface StreamDetailModalProps {
  streamId: string | null;
  tenantSlug: string;
  onClose: () => void;
}

export function StreamDetailModal({ streamId, tenantSlug, onClose }: StreamDetailModalProps) {
  const { data: stream, isPending, error } = useMetaSyncProxy<StreamFullDetail>({
    path: streamId ? `/stream/${streamId}` : "",
    tenantSlug,
    enabled: !!streamId,
  });

  const clientRef = stream ? parseClientReference(stream.clientReference) : null;
  const m = stream?.processingMetrics;

  return (
    <Dialog open={!!streamId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        {isPending ? (
          <div className="p-6 space-y-4">
            <DialogTitle className="sr-only">Loading stream details</DialogTitle>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
            <Skeleton className="h-40" />
          </div>
        ) : error ? (
          <div className="p-6">
            <DialogTitle className="sr-only">Error loading stream</DialogTitle>
            <MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} />
          </div>
        ) : stream ? (
          <>
            <DialogHeader className="px-6 pt-6 pb-0">
              <div className="flex items-center justify-between gap-4 pr-8">
                <div className="min-w-0">
                  <DialogTitle className="font-mono text-sm truncate">
                    {stream.streamId || stream._id}
                  </DialogTitle>
                  <DialogDescription className="mt-1">
                    {formatDate(stream._metadata.createdAt)}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{stream.model}</Badge>
                  <Badge variant="outline">temp {stream.temperature}</Badge>
                  <Badge
                    variant={
                      stream.status === "completed"
                        ? "secondary"
                        : stream.status === "error"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {stream.status}
                  </Badge>
                </div>
              </div>
            </DialogHeader>

            <Tabs defaultValue="overview" className="flex-1 min-h-0 px-6 pt-4 pb-6">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="request">Request</TabsTrigger>
                <TabsTrigger value="response">Response</TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[calc(85vh-180px)] mt-4">
                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-0 space-y-4">
                  {/* Quick metrics */}
                  {m && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <MetricCard
                        icon={<Cpu className="h-4 w-4" />}
                        label="Total Tokens"
                        value={m.totalTokens.toLocaleString()}
                        sub={`In: ${m.inputTokens.toLocaleString()} / Out: ${m.outputTokens.toLocaleString()}`}
                      />
                      <MetricCard
                        icon={<DollarSign className="h-4 w-4" />}
                        label="Total Cost"
                        value={formatCost(m.totalCost, m.currency)}
                        sub={`In: ${formatCost(m.inputCost, m.currency)} / Out: ${formatCost(m.outputCost, m.currency)}`}
                      />
                      <MetricCard
                        icon={<Timer className="h-4 w-4" />}
                        label="Total Duration"
                        value={formatDuration(m.totalDuration)}
                        sub={`LLM: ${formatDuration(m.llmDuration)} / Overhead: ${formatDuration(m.overheadDuration)}`}
                      />
                      <MetricCard
                        icon={<Zap className="h-4 w-4" />}
                        label="LLM Duration"
                        value={formatDuration(m.llmDuration)}
                        sub={`${((m.llmDuration / m.totalDuration) * 100).toFixed(0)}% of total`}
                      />
                    </div>
                  )}

                  {/* Details */}
                  <div className="rounded-lg border p-4 space-y-1">
                    <h3 className="text-sm font-medium mb-2">Details</h3>
                    <InfoRow label="Stream ID">
                      <span className="font-mono text-xs">{stream.streamId || stream._id}</span>
                    </InfoRow>
                    <InfoRow label="Client ID">
                      <span className="font-mono text-xs">{stream.clientId}</span>
                    </InfoRow>
                    <InfoRow label="Model">{stream.model}</InfoRow>
                    <InfoRow label="Temperature">{stream.temperature}</InfoRow>
                    <InfoRow label="Status">
                      <Badge
                        variant={
                          stream.status === "completed"
                            ? "secondary"
                            : stream.status === "error"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {stream.status}
                      </Badge>
                    </InfoRow>
                  </div>

                  {/* Client Reference */}
                  {clientRef && Object.keys(clientRef).length > 0 && (
                    <div className="rounded-lg border p-4 space-y-1">
                      <h3 className="text-sm font-medium mb-2">Client Reference</h3>
                      {Object.entries(clientRef).map(([key, val]) => (
                        <InfoRow key={key} label={key}>
                          <span className="font-mono text-xs">{String(val)}</span>
                        </InfoRow>
                      ))}
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="rounded-lg border p-4 space-y-1">
                    <h3 className="text-sm font-medium mb-2">Timestamps</h3>
                    <InfoRow label="Created">{formatDate(stream._metadata.createdAt)}</InfoRow>
                    {stream._metadata.completedAt && (
                      <InfoRow label="Completed">
                        {formatDate(stream._metadata.completedAt)}
                      </InfoRow>
                    )}
                    {stream._metadata.updatedAt && (
                      <InfoRow label="Updated">{formatDate(stream._metadata.updatedAt)}</InfoRow>
                    )}
                  </div>
                </TabsContent>

                {/* Request Tab */}
                <TabsContent value="request" className="mt-0 flex flex-col gap-4 h-[calc(85vh-220px)]">
                  {stream.requestData?.systemPrompt && (
                    <div className="flex flex-col min-h-0 shrink">
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-2 shrink-0">
                        <Tag className="h-3.5 w-3.5" />
                        System Prompt
                      </h3>
                      <pre className="rounded-lg border bg-muted/50 p-4 text-sm whitespace-pre-wrap break-words overflow-auto font-mono max-h-40">
                        {stream.requestData.systemPrompt}
                      </pre>
                    </div>
                  )}

                  <div className="flex flex-col flex-1 min-h-0">
                    <h3 className="text-sm font-medium mb-2 flex items-center gap-2 shrink-0">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      User Prompt
                    </h3>
                    {stream.requestData?.userPrompt ? (
                      <pre className="rounded-lg border bg-muted/50 p-4 text-sm whitespace-pre-wrap break-words overflow-auto font-mono flex-1 min-h-0">
                        {stream.requestData.userPrompt}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">No user prompt available.</p>
                    )}
                  </div>

                  {stream.requestData?.additionalPrompts &&
                    stream.requestData.additionalPrompts.length > 0 && (
                      <div className="flex flex-col min-h-0 shrink">
                        <h3 className="text-sm font-medium mb-2 shrink-0">Additional Prompts</h3>
                        <div className="space-y-2 overflow-auto max-h-40">
                          {stream.requestData.additionalPrompts.map((p, i) => (
                            <pre
                              key={i}
                              className="rounded-lg border bg-muted/50 p-4 text-sm whitespace-pre-wrap break-words font-mono"
                            >
                              {p}
                            </pre>
                          ))}
                        </div>
                      </div>
                    )}
                </TabsContent>

                {/* Response Tab */}
                <TabsContent value="response" className="mt-0 flex flex-col gap-4 h-[calc(85vh-220px)]">
                  <div className="flex flex-col flex-1 min-h-0">
                    <h3 className="text-sm font-medium mb-2 flex items-center gap-2 shrink-0">
                      <ArrowDownLeft className="h-3.5 w-3.5" />
                      Response
                    </h3>
                    {stream.responseData?.text ? (
                      <pre className="rounded-lg border bg-muted/50 p-4 text-sm whitespace-pre-wrap break-words overflow-auto font-mono flex-1 min-h-0">
                        {stream.responseData.text}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">No response data available.</p>
                    )}
                  </div>
                </TabsContent>

                {/* Metrics Tab */}
                <TabsContent value="metrics" className="mt-0 space-y-4">
                  {m ? (
                    <>
                      {/* Token Breakdown */}
                      <div className="rounded-lg border p-4">
                        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                          <Cpu className="h-3.5 w-3.5" />
                          Token Usage
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Input Tokens</p>
                            <p className="text-lg font-semibold">
                              {m.inputTokens.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Output Tokens</p>
                            <p className="text-lg font-semibold">
                              {m.outputTokens.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total Tokens</p>
                            <p className="text-lg font-semibold">
                              {m.totalTokens.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {/* Visual bar */}
                        <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-muted">
                          <div
                            className="bg-blue-500 h-full"
                            style={{
                              width: `${(m.inputTokens / m.totalTokens) * 100}%`,
                            }}
                          />
                          <div
                            className="bg-emerald-500 h-full"
                            style={{
                              width: `${(m.outputTokens / m.totalTokens) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                            Input ({((m.inputTokens / m.totalTokens) * 100).toFixed(1)}%)
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                            Output ({((m.outputTokens / m.totalTokens) * 100).toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      {/* Cost Breakdown */}
                      <div className="rounded-lg border p-4">
                        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                          <DollarSign className="h-3.5 w-3.5" />
                          Cost Breakdown ({m.currency})
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Input Cost</p>
                            <p className="text-lg font-semibold">
                              {formatCost(m.inputCost, m.currency)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Output Cost</p>
                            <p className="text-lg font-semibold">
                              {formatCost(m.outputCost, m.currency)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total Cost</p>
                            <p className="text-lg font-semibold">
                              {formatCost(m.totalCost, m.currency)}
                            </p>
                          </div>
                        </div>
                        {/* Visual bar */}
                        <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-muted">
                          <div
                            className="bg-amber-500 h-full"
                            style={{
                              width: `${(m.inputCost / m.totalCost) * 100}%`,
                            }}
                          />
                          <div
                            className="bg-orange-500 h-full"
                            style={{
                              width: `${(m.outputCost / m.totalCost) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                            Input ({((m.inputCost / m.totalCost) * 100).toFixed(1)}%)
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
                            Output ({((m.outputCost / m.totalCost) * 100).toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      {/* Duration Breakdown */}
                      <div className="rounded-lg border p-4">
                        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5" />
                          Duration Breakdown
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">LLM Duration</p>
                            <p className="text-lg font-semibold">
                              {formatDuration(m.llmDuration)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Overhead</p>
                            <p className="text-lg font-semibold">
                              {formatDuration(m.overheadDuration)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total Duration</p>
                            <p className="text-lg font-semibold">
                              {formatDuration(m.totalDuration)}
                            </p>
                          </div>
                        </div>
                        {/* Visual bar */}
                        <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-muted">
                          <div
                            className="bg-violet-500 h-full"
                            style={{
                              width: `${(m.llmDuration / m.totalDuration) * 100}%`,
                            }}
                          />
                          <div
                            className="bg-pink-500 h-full"
                            style={{
                              width: `${(m.overheadDuration / m.totalDuration) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
                            LLM ({((m.llmDuration / m.totalDuration) * 100).toFixed(1)}%)
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-pink-500" />
                            Overhead ({((m.overheadDuration / m.totalDuration) * 100).toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No metrics available for this stream.
                    </p>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
