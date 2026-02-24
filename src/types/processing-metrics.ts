export interface ProcessingMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  duration: number;
  llmDuration: number;
  totalDuration: number;
  overheadDuration: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

export type MetricKey = keyof Omit<ProcessingMetrics, "currency">;
