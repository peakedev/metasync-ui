"use client";

import { useMemo, useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { LegendPayload } from "recharts/types/component/DefaultLegendContent";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { BarChart3, ChevronUp, ChevronDown } from "lucide-react";
import { formatMetricValue } from "@/lib/formatters";
import type { MetricKey } from "@/types/processing-metrics";
import type { StreamAnalyticsResponse } from "@/types/stream-analytics";
import {
  transformToChartData,
  downsampleIfNeeded,
  smoothToTimeBuckets,
  pivotForRecharts,
  METRIC_OPTIONS,
  GROUPING_OPTIONS,
  CHART_COLORS,
  OTHER_COLOR,
  type GroupingKey,
  type RechartsRow,
} from "@/lib/chart-utils";

interface StreamAnalyticsChartProps {
  tenantSlug: string;
  from?: string;
  to?: string;
  onStreamClick: (streamId: string) => void;
}

function ChartTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    dataKey: string;
    color: string;
    payload: RechartsRow;
  }>;
  metric: MetricKey;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const meta = entry.payload[`_meta_${entry.dataKey}`] as
    | { streamId: string; userPrompt: string }
    | undefined;

  return (
    <div className="rounded-lg border bg-popover/95 backdrop-blur-sm px-3 py-2.5 text-popover-foreground shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: entry.color }}
        />
        <span className="text-xs font-medium text-muted-foreground">
          {entry.name === "all" ? "All streams" : entry.name}
        </span>
      </div>
      <p className="text-base font-semibold tracking-tight">
        {formatMetricValue(entry.value, metric)}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        {new Date(entry.payload.timestamp as number).toLocaleString()}
      </p>
      {meta?.userPrompt && (
        <p className="mt-1.5 text-[11px] text-muted-foreground/80 truncate max-w-[280px] border-t pt-1.5">
          {meta.userPrompt.slice(0, 80)}
          {meta.userPrompt.length > 80 ? "\u2026" : ""}
        </p>
      )}
    </div>
  );
}

export function StreamAnalyticsChart({
  tenantSlug,
  from,
  to,
  onStreamClick,
}: StreamAnalyticsChartProps) {
  const [metric, setMetric] = useState<MetricKey>("totalDuration");
  const [grouping, setGrouping] = useState<GroupingKey>("none");
  const [hasInteracted, setHasInteracted] = useState(false);
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("metasync_graph_expanded") === "true";
  });
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const analyticsParams = useMemo(() => {
    // Use page filter if provided, otherwise default to last 24h
    const effectiveFrom = from ?? new Date(Date.now() - 86400000).toISOString();
    const effectiveTo = to ?? new Date().toISOString();
    return { from: effectiveFrom, to: effectiveTo };
  }, [from, to]);

  const { data, isPending, error, refetch } =
    useMetaSyncProxy<StreamAnalyticsResponse>(
      { path: "/stream/analytics", tenantSlug, queryParams: analyticsParams },
      { staleTime: 60_000 }
    );

  // Sparkline data: always totalDuration, no grouping — the collapsed preview
  const sparklineResult = useMemo(() => {
    if (!data?.dataPoints?.length) return null;
    const transformed = transformToChartData(
      data.dataPoints,
      "totalDuration",
      "none"
    );
    const { points } = downsampleIfNeeded(transformed.points);
    const smoothed = smoothToTimeBuckets(points, 40);
    return pivotForRecharts(smoothed, transformed.seriesKeys);
  }, [data]);

  // Full chart data: uses selected metric + grouping
  const chartResult = useMemo(() => {
    if (!data?.dataPoints?.length) return null;

    const transformed = transformToChartData(data.dataPoints, metric, grouping);
    const { points, downsampled, originalCount } = downsampleIfNeeded(
      transformed.points
    );

    // Compute global time range so all series share the same bucket grid
    const globalMin = points[0]?.timestamp ?? 0;
    const globalMax = points[points.length - 1]?.timestamp ?? 0;

    // Smooth each series on the shared time grid
    const byGroup = new Map<string, typeof points>();
    for (const p of points) {
      const arr = byGroup.get(p.groupKey);
      if (arr) arr.push(p);
      else byGroup.set(p.groupKey, [p]);
    }

    const smoothed: typeof points = [];
    for (const [, groupPoints] of byGroup) {
      smoothed.push(
        ...smoothToTimeBuckets(groupPoints, 60, globalMin, globalMax)
      );
    }
    smoothed.sort((a, b) => a.timestamp - b.timestamp);

    const rechartsData = pivotForRecharts(smoothed, transformed.seriesKeys);

    return {
      rechartsData,
      seriesKeys: transformed.seriesKeys,
      downsampled,
      originalCount,
      pointCount: points.length,
    };
  }, [data, metric, grouping]);

  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("metasync_graph_expanded", String(next));
      return next;
    });
  }, []);

  const handleLegendClick = useCallback((entry: LegendPayload) => {
    const key = entry.value as string;
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const formatXAxisTick = useCallback((value: number) => {
    const d = new Date(value);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, []);

  const hasData = !!sparklineResult?.length;

  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-card transition-all duration-300 ease-in-out"
      style={{
        height: expanded ? `clamp(420px, calc(100vh - 220px), 800px)` : "96px",
      }}
    >
      {/* ── Collapsed state ── */}
      {!expanded && (
        <button
          onClick={handleToggleExpand}
          className="absolute inset-0 w-full cursor-pointer group"
        >
          {/* Sparkline area */}
          {isPending ? (
            <div className="absolute inset-0 flex items-end px-6 pb-3">
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ) : !hasData ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
              <BarChart3 className="h-5 w-5 mr-2" />
              <span className="text-xs">No data</span>
            </div>
          ) : (
            <div className="absolute inset-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={sparklineResult}
                  margin={{ top: 20, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="sparklineGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--chart-1)"
                        stopOpacity={0.15}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--chart-1)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="all"
                    stroke="var(--chart-1)"
                    strokeWidth={1.5}
                    fill="url(#sparklineGradient)"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Collapsed overlay label */}
          <div className="absolute top-3 left-4 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground/70">
              Stream Analytics
            </span>
          </div>
          <div className="absolute top-2.5 right-3 flex items-center gap-1 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
            <span className="text-[11px]">Expand</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        </button>
      )}

      {/* ── Expanded state ── */}
      {expanded && (
        <div className="flex flex-col h-full">
          {/* Header bar */}
          <div className="flex items-center gap-2.5 px-4 py-3 shrink-0">
            <span className="text-sm font-medium text-foreground mr-1">
              Analytics
            </span>

            <div className="h-4 w-px bg-border" />

            <Select
              value={metric}
              onValueChange={(v) => {
                setHasInteracted(true);
                setMetric(v as MetricKey);
              }}
            >
              <SelectTrigger className="h-8 w-40 text-xs border-dashed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRIC_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.key} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={grouping}
              onValueChange={(v) => {
                setHasInteracted(true);
                setGrouping(v as GroupingKey);
                setHiddenSeries(new Set());
              }}
            >
              <SelectTrigger className="h-8 w-36 text-xs border-dashed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUPING_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.key} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex-1" />

            {chartResult?.downsampled && (
              <span className="text-[11px] text-muted-foreground/60">
                {chartResult.pointCount} / {chartResult.originalCount} sampled
              </span>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleExpand}
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Collapse
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Chart body */}
          <div className="flex-1 min-h-0 px-2 pb-3">
            {isPending ? (
              <Skeleton className="h-full w-full rounded-md" />
            ) : error ? (
              <div className="px-2">
                <MetaSyncError
                  error={(error as Error).message}
                  tenantSlug={tenantSlug}
                  onRetry={() => refetch()}
                />
              </div>
            ) : !chartResult ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60">
                <BarChart3 className="h-10 w-10 mb-3 stroke-[1.2]" />
                <p className="text-sm">No analytics data for this time range</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartResult.rechartsData}
                  margin={{ top: 8, right: 12, left: -8, bottom: 4 }}
                >
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={formatXAxisTick}
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    dy={8}
                    opacity={0.5}
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatMetricValue(v, metric)}
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    dx={-4}
                    opacity={0.5}
                    width={60}
                  />
                  <Tooltip
                    content={<ChartTooltip metric={metric} />}
                    cursor={{
                      stroke: "var(--muted-foreground)",
                      strokeWidth: 1,
                      strokeDasharray: "4 4",
                      opacity: 0.3,
                    }}
                  />
                  {chartResult.seriesKeys.length > 1 && (
                    <Legend
                      onClick={handleLegendClick}
                      wrapperStyle={{
                        cursor: "pointer",
                        paddingTop: 12,
                        fontSize: 12,
                      }}
                      iconType="circle"
                      iconSize={8}
                    />
                  )}
                  {chartResult.seriesKeys.map((key, i) =>
                    !hiddenSeries.has(key) ? (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={key === "all" ? "All streams" : key}
                        stroke={
                          key === "Other"
                            ? OTHER_COLOR
                            : (CHART_COLORS[i] ?? OTHER_COLOR)
                        }
                        dot={false}
                        activeDot={{
                          r: 4,
                          strokeWidth: 2,
                          stroke: "var(--background)",
                          cursor: "pointer",
                          onClick: (dotProps: any) => {
                            const row = dotProps?.payload as
                              | RechartsRow
                              | undefined;
                            const meta = row?.[`_meta_${key}`] as
                              | { streamId: string }
                              | undefined;
                            if (meta?.streamId) onStreamClick(meta.streamId);
                          },
                        }}
                        strokeWidth={1.5}
                        connectNulls
                        isAnimationActive={!hasInteracted}
                      />
                    ) : null
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
