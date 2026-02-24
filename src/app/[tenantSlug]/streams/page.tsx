"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { StreamDetailModal } from "@/components/stream-detail-modal";
import { StreamAnalyticsChart } from "@/components/stream-analytics-chart";
import { Plus, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import { formatCost, formatDuration } from "@/lib/formatters";
import type { ProcessingMetrics } from "@/types/processing-metrics";

interface StreamSession {
  _id: string;
  streamId: string;
  clientId: string;
  model: string;
  temperature: number;
  status: string;
  processingMetrics: ProcessingMetrics | null;
  clientReference: Record<string, unknown> | string | null;
  _metadata: {
    createdAt: string;
    completedAt: string | null;
    isDeleted: boolean;
    updatedAt: string | null;
  };
}

interface StreamSummary {
  streaming: number;
  completed: number;
  error: number;
  total: number;
  processingMetrics: ProcessingMetrics | null;
}

function parseClientReference(ref: StreamSession["clientReference"]): Record<string, unknown> | null {
  if (ref == null) return null;
  if (typeof ref === "object") return ref;
  try {
    const parsed = JSON.parse(ref);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

type SortField = "totalTokens" | "totalCost" | "duration" | "createdAt";
type SortDir = "asc" | "desc";

function getMetric(s: StreamSession, field: SortField): number {
  if (field === "createdAt") return new Date(s._metadata.createdAt).getTime();
  if (!s.processingMetrics) return 0;
  if (field === "totalTokens") return s.processingMetrics.totalTokens ?? 0;
  if (field === "totalCost") return s.processingMetrics.totalCost ?? 0;
  if (field === "duration") return s.processingMetrics.totalDuration ?? 0;
  return 0;
}

function hasMetrics(m: ProcessingMetrics | null): m is ProcessingMetrics & { totalTokens: number } {
  return m != null && m.totalTokens != null;
}

export default function StreamsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("1h");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const ms: Record<string, number> = {
      "1h": 3600000,
      "6h": 21600000,
      "24h": 86400000,
      "7d": 604800000,
      "30d": 2592000000,
    };
    const cutoff = ms[timeFilter];
    if (!cutoff) return undefined;
    const from = new Date(Date.now() - cutoff).toISOString();
    const to = new Date().toISOString();
    return { from, to };
  }, [timeFilter]);

  const { data: streams, isPending, error, refetch, isRefetching } = useMetaSyncProxy<StreamSession[]>({ path: "/stream", tenantSlug, queryParams });

  const summaryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (statusFilter) p.status = statusFilter;
    if (modelFilter) p.model = modelFilter;
    if (queryParams?.from) p.from = queryParams.from;
    if (queryParams?.to) p.to = queryParams.to;
    return Object.keys(p).length > 0 ? p : undefined;
  }, [statusFilter, modelFilter, queryParams]);

  const { data: summary, isPending: summaryPending } = useMetaSyncProxy<StreamSummary>({
    path: "/stream/summary",
    tenantSlug,
    queryParams: summaryParams,
  });

  const models = useMemo(() => {
    if (!streams) return [];
    return [...new Set(streams.map((s) => s.model))].sort();
  }, [streams]);

  const clientRefColumns = useMemo(() => {
    if (!streams) return [];
    const keys = new Set<string>();
    for (const s of streams) {
      const parsed = parseClientReference(s.clientReference);
      if (parsed) {
        for (const key of Object.keys(parsed)) keys.add(key);
      }
    }
    return [...keys].sort();
  }, [streams]);

  const filtered = useMemo(() => {
    if (!streams) return [];
    let result = streams;
    if (statusFilter) result = result.filter((s) => s.status.toLowerCase() === statusFilter.toLowerCase());
    if (modelFilter) result = result.filter((s) => s.model === modelFilter);
    result = [...result].sort((a, b) => {
      const av = getMetric(a, sortField);
      const bv = getMetric(b, sortField);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return result;
  }, [streams, statusFilter, modelFilter, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3 inline" /> : <ArrowDown className="ml-1 h-3 w-3 inline" />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Streams</h1>
        <MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Streams</h1>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <Button onClick={() => router.push(`/${tenantSlug}/streams/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>

      <div className="flex gap-4">
        <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Time range" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last hour</SelectItem>
            <SelectItem value="6h">Last 6 hours</SelectItem>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={modelFilter} onValueChange={(v) => setModelFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Model" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All models</SelectItem>
            {models.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {summaryPending ? (
        <Skeleton className="h-16" />
      ) : summary ? (
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <div><span className="text-muted-foreground">Total</span> <span className="font-semibold">{summary.total}</span></div>
            <div><span className="text-muted-foreground">Completed</span> <span className="font-semibold text-green-600">{summary.completed}</span></div>
            <div><span className="text-muted-foreground">Streaming</span> <span className="font-semibold text-blue-600">{summary.streaming}</span></div>
            <div><span className="text-muted-foreground">Errors</span> <span className="font-semibold text-destructive">{summary.error}</span></div>
            <div className="border-l pl-6">
              <span className="text-muted-foreground">Tokens</span>{" "}
              <span className="font-semibold" title={summary.processingMetrics ? `${(summary.processingMetrics.inputTokens ?? 0).toLocaleString("de-DE")} in / ${(summary.processingMetrics.outputTokens ?? 0).toLocaleString("de-DE")} out` : ""}>
                {summary.processingMetrics?.totalTokens != null ? summary.processingMetrics.totalTokens.toLocaleString("de-DE") : "-"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Cost</span>{" "}
              <span className="font-semibold">
                {summary.processingMetrics?.totalCost != null
                  ? formatCost(summary.processingMetrics.totalCost, summary.processingMetrics.currency ?? "USD")
                  : "-"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Duration</span>{" "}
              <span className="font-semibold" title={summary.processingMetrics ? `LLM: ${formatDuration(summary.processingMetrics.llmDuration ?? 0)} / Overhead: ${formatDuration(summary.processingMetrics.overheadDuration ?? 0)}` : ""}>
                {summary.processingMetrics?.totalDuration != null ? formatDuration(summary.processingMetrics.totalDuration) : "-"}
              </span>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="hidden md:block">
        <StreamAnalyticsChart
          tenantSlug={tenantSlug}
          from={queryParams?.from}
          to={queryParams?.to}
          onStreamClick={(id) => setSelectedStreamId(id)}
        />
      </div>

      {isPending ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stream ID</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("totalTokens")}>
                Tokens <SortIcon field="totalTokens" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("totalCost")}>
                Cost <SortIcon field="totalCost" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("duration")}>
                Duration <SortIcon field="duration" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("createdAt")}>
                Created <SortIcon field="createdAt" />
              </TableHead>
              {clientRefColumns.map((col) => (
                <TableHead key={col} className="capitalize">{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.streamId || s._id} className="cursor-pointer" onClick={() => setSelectedStreamId(s.streamId || s._id)}>
                <TableCell className="font-mono text-sm">{s.streamId || s._id}</TableCell>
                <TableCell>{s.model}</TableCell>
                <TableCell>
                  <Badge variant={
                    s.status === "completed" ? "secondary"
                    : s.status === "error" ? "destructive"
                    : "outline"
                  }>
                    {s.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {hasMetrics(s.processingMetrics) ? (
                    <span title={`In: ${s.processingMetrics.inputTokens ?? 0} / Out: ${s.processingMetrics.outputTokens ?? 0}`}>
                      {s.processingMetrics.totalTokens.toLocaleString()}
                    </span>
                  ) : "-"}
                </TableCell>
                <TableCell>
                  {hasMetrics(s.processingMetrics) && s.processingMetrics.totalCost != null ? (
                    <span title={`In: ${formatCost(s.processingMetrics.inputCost ?? 0, s.processingMetrics.currency ?? "USD")} / Out: ${formatCost(s.processingMetrics.outputCost ?? 0, s.processingMetrics.currency ?? "USD")}`}>
                      {formatCost(s.processingMetrics.totalCost, s.processingMetrics.currency ?? "USD")}
                    </span>
                  ) : "-"}
                </TableCell>
                <TableCell>
                  {hasMetrics(s.processingMetrics) && s.processingMetrics.totalDuration != null ? (
                    <span title={`LLM: ${formatDuration(s.processingMetrics.llmDuration ?? 0)} / Overhead: ${formatDuration(s.processingMetrics.overheadDuration ?? 0)}`}>
                      {formatDuration(s.processingMetrics.totalDuration)}
                    </span>
                  ) : "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(s._metadata.createdAt).toLocaleDateString()}
                </TableCell>
                {clientRefColumns.map((col) => {
                  const parsed = parseClientReference(s.clientReference);
                  const val = parsed?.[col];
                  return (
                    <TableCell key={col} className="text-sm">
                      {val != null ? String(val) : "-"}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7 + clientRefColumns.length} className="text-center text-muted-foreground py-8">
                  {streams && streams.length > 0 ? "No streams match the current filters." : "No streams yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <StreamDetailModal
        streamId={selectedStreamId}
        tenantSlug={tenantSlug}
        onClose={() => setSelectedStreamId(null)}
      />
    </div>
  );
}
