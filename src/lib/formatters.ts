import type { MetricKey } from "@/types/processing-metrics";

export function formatCost(cost: number, currency?: string): string {
  const sym = currency === "EUR" ? "\u20ac" : "$";
  const decimals = cost !== 0 && Math.abs(cost) < 0.01 ? 6 : 2;
  const [intPart, decPart] = cost.toFixed(decimals).split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sym}${withDots},${decPart}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function formatMetricValue(value: number, metric: MetricKey): string {
  if (metric.endsWith("Cost")) return formatCost(value);
  if (metric.endsWith("Duration") || metric === "duration") return formatDuration(value);
  return value.toLocaleString();
}
