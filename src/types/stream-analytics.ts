import type { ProcessingMetrics } from "./processing-metrics";

export interface StreamAnalyticsResponse {
  dataPoints: StreamAnalyticsDataPoint[];
  groups: StreamAnalyticsGroup[];
  totalCount: number;
  dateRange: { from: string; to: string };
}

export interface StreamAnalyticsDataPoint {
  streamId: string;
  createdAt: string;
  model: string;
  clientReference: Record<string, unknown> | null;
  promptIds: string[];
  userPrompt: string;
  processingMetrics: ProcessingMetrics;
}

export interface StreamAnalyticsGroup {
  model: string;
  clientReference: Record<string, unknown> | null;
  promptIds: string[];
  count: number;
  aggregatedMetrics: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalDuration: number;
    totalCost: number;
    currency: string;
  };
}
