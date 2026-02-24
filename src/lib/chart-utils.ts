import type { MetricKey } from "@/types/processing-metrics";
import type { StreamAnalyticsDataPoint } from "@/types/stream-analytics";

export type GroupingKey = "none" | "model" | "clientReference" | "promptId";

export interface ChartDataPoint {
  timestamp: number;
  displayTime: string;
  streamId: string;
  userPrompt: string;
  groupKey: string;
  value: number;
}

export interface ChartData {
  points: ChartDataPoint[];
  seriesKeys: string[];
  downsampled: boolean;
  originalCount: number;
}

export interface RechartsRow {
  timestamp: number;
  displayTime: string;
  [key: string]: number | string | object | undefined;
}

export const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: "totalDuration", label: "Total Duration" },
  { key: "duration", label: "Duration" },
  { key: "llmDuration", label: "LLM Duration" },
  { key: "overheadDuration", label: "Overhead Duration" },
  { key: "totalTokens", label: "Total Tokens" },
  { key: "inputTokens", label: "Input Tokens" },
  { key: "outputTokens", label: "Output Tokens" },
  { key: "totalCost", label: "Total Cost" },
  { key: "inputCost", label: "Input Cost" },
  { key: "outputCost", label: "Output Cost" },
];

export const GROUPING_OPTIONS: { key: GroupingKey; label: string }[] = [
  { key: "none", label: "No grouping" },
  { key: "model", label: "By Model" },
  { key: "clientReference", label: "By Session" },
  { key: "promptId", label: "By Prompt" },
];

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

export const OTHER_COLOR = "var(--muted-foreground)";

function getGroupKey(dataPoint: StreamAnalyticsDataPoint, grouping: GroupingKey): string {
  switch (grouping) {
    case "none":
      return "all";
    case "model":
      return dataPoint.model;
    case "clientReference":
      return dataPoint.clientReference
        ? JSON.stringify(dataPoint.clientReference)
        : "unknown";
    case "promptId":
      return dataPoint.promptIds?.length > 0
        ? dataPoint.promptIds.join(", ")
        : "none";
  }
}

export function transformToChartData(
  dataPoints: StreamAnalyticsDataPoint[],
  metric: MetricKey,
  grouping: GroupingKey
): ChartData {
  const points: ChartDataPoint[] = [];

  for (const dp of dataPoints) {
    if (!dp.processingMetrics) continue;
    const value = dp.processingMetrics[metric];
    if (value == null) continue;

    points.push({
      timestamp: Date.parse(dp.createdAt),
      displayTime: new Date(dp.createdAt).toLocaleString(),
      streamId: dp.streamId,
      userPrompt: dp.userPrompt,
      groupKey: getGroupKey(dp, grouping),
      value: value as number,
    });
  }

  points.sort((a, b) => a.timestamp - b.timestamp);

  // Count frequency per group key
  const freq = new Map<string, number>();
  for (const p of points) {
    freq.set(p.groupKey, (freq.get(p.groupKey) ?? 0) + 1);
  }

  // Sort by frequency descending
  let seriesKeys = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  // Cap at 8 groups, merge rest into "Other"
  if (seriesKeys.length > 8) {
    const topKeys = new Set(seriesKeys.slice(0, 7));
    seriesKeys = [...seriesKeys.slice(0, 7), "Other"];
    for (const p of points) {
      if (!topKeys.has(p.groupKey)) {
        p.groupKey = "Other";
      }
    }
  }

  return {
    points,
    seriesKeys,
    downsampled: false,
    originalCount: points.length,
  };
}

export function downsampleIfNeeded(
  points: ChartDataPoint[],
  threshold = 2000,
  target = 500
): { points: ChartDataPoint[]; downsampled: boolean; originalCount: number } {
  const originalCount = points.length;
  if (points.length <= threshold) {
    return { points, downsampled: false, originalCount };
  }

  const bucketSize = Math.ceil(points.length / target);
  const result: ChartDataPoint[] = [];

  for (let i = 0; i < points.length; i += bucketSize) {
    const bucket = points.slice(i, i + bucketSize);
    if (bucket.length === 0) continue;

    // Compute average value
    const avg = bucket.reduce((sum, p) => sum + p.value, 0) / bucket.length;

    // Find point closest to average
    let closestIdx = 0;
    let closestDist = Math.abs(bucket[0].value - avg);
    let minIdx = 0;
    let maxIdx = 0;

    for (let j = 1; j < bucket.length; j++) {
      const dist = Math.abs(bucket[j].value - avg);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = j;
      }
      if (bucket[j].value < bucket[minIdx].value) minIdx = j;
      if (bucket[j].value > bucket[maxIdx].value) maxIdx = j;
    }

    // Always include the closest-to-average point
    const selected = new Set([closestIdx]);

    // Include min and max if they differ significantly from average (>20%)
    const range = bucket[maxIdx].value - bucket[minIdx].value;
    if (range > 0) {
      const threshold = avg * 0.2;
      if (Math.abs(bucket[minIdx].value - avg) > threshold) {
        selected.add(minIdx);
      }
      if (Math.abs(bucket[maxIdx].value - avg) > threshold) {
        selected.add(maxIdx);
      }
    }

    // Add selected points in timestamp order
    const indices = [...selected].sort((a, b) => a - b);
    for (const idx of indices) {
      result.push(bucket[idx]);
    }
  }

  return { points: result, downsampled: true, originalCount };
}

/**
 * Buckets points into evenly-spaced time intervals and averages values.
 * Produces a smooth line proportional to the time scale.
 * Each bucket keeps the metadata of the point closest to the bucket average
 * so click-to-detail still works.
 */
export function smoothToTimeBuckets(
  points: ChartDataPoint[],
  bucketCount = 60
): ChartDataPoint[] {
  if (points.length <= 2) return points;

  const minTs = points[0].timestamp;
  const maxTs = points[points.length - 1].timestamp;
  const range = maxTs - minTs;
  if (range === 0) return points;

  const bucketWidth = range / bucketCount;
  const buckets = new Map<
    number,
    { sum: number; count: number; points: ChartDataPoint[] }
  >();

  for (const p of points) {
    const bucketIdx = Math.min(
      Math.floor((p.timestamp - minTs) / bucketWidth),
      bucketCount - 1
    );
    const bucketTs = minTs + (bucketIdx + 0.5) * bucketWidth;

    const existing = buckets.get(bucketTs);
    if (existing) {
      existing.sum += p.value;
      existing.count++;
      existing.points.push(p);
    } else {
      buckets.set(bucketTs, { sum: p.value, count: 1, points: [p] });
    }
  }

  const result: ChartDataPoint[] = [];
  const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);

  for (const ts of sortedKeys) {
    const bucket = buckets.get(ts)!;
    const avg = bucket.sum / bucket.count;

    // Pick the point closest to the average to preserve its metadata
    let best = bucket.points[0];
    let bestDist = Math.abs(best.value - avg);
    for (let i = 1; i < bucket.points.length; i++) {
      const dist = Math.abs(bucket.points[i].value - avg);
      if (dist < bestDist) {
        best = bucket.points[i];
        bestDist = dist;
      }
    }

    result.push({
      timestamp: Math.round(ts),
      displayTime: new Date(Math.round(ts)).toLocaleString(),
      streamId: best.streamId,
      userPrompt: best.userPrompt,
      groupKey: best.groupKey,
      value: avg,
    });
  }

  return result;
}

export function pivotForRecharts(
  points: ChartDataPoint[],
  seriesKeys: string[]
): RechartsRow[] {
  // Group points by timestamp
  const byTimestamp = new Map<number, ChartDataPoint[]>();
  for (const p of points) {
    const existing = byTimestamp.get(p.timestamp);
    if (existing) {
      existing.push(p);
    } else {
      byTimestamp.set(p.timestamp, [p]);
    }
  }

  const rows: RechartsRow[] = [];
  const sortedTimestamps = [...byTimestamp.keys()].sort((a, b) => a - b);

  for (const ts of sortedTimestamps) {
    const group = byTimestamp.get(ts)!;
    const row: RechartsRow = {
      timestamp: ts,
      displayTime: group[0].displayTime,
    };

    for (const p of group) {
      if (seriesKeys.includes(p.groupKey)) {
        row[p.groupKey] = p.value;
        row[`_meta_${p.groupKey}`] = {
          streamId: p.streamId,
          userPrompt: p.userPrompt,
        };
      }
    }

    rows.push(row);
  }

  return rows;
}
