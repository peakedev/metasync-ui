# Stream Analytics Graph — Design

**Spec folder:** `specs/graph/`
**Requirements:** `specs/graph/requirements.md`

---

## 1. Overview

Add a collapsible time-series line chart to the Streams page that visualizes per-stream processing metrics. The chart fetches data from `GET /streams/analytics` via the existing proxy, transforms the response into Recharts-compatible series, and supports metric selection, grouping, and click-to-detail interactions.

**Key decisions:**
- **Recharts v2** as charting library — SVG-based, composable React components, tree-shakeable
- **CSS variables** (`--chart-1` through `--chart-8`) for theme-aware line colors — extends existing shadcn chart tokens
- **Self-contained component** — `StreamAnalyticsChart` manages its own state and data fetching
- **Shared types and formatters** — extract duplicated `ProcessingMetrics` and formatting functions to shared modules

---

## 2. Architecture

See diagram: `docs/diagrams/stream-analytics-chart.drawio`

### Component Hierarchy

```
StreamsPage (streams/page.tsx)
├── Filters (time, status, model)
├── Summary Card
├── StreamAnalyticsChart                    ← NEW
│   ├── Chart Header (metric selector, grouping selector, expand toggle)
│   ├── Recharts LineChart
│   │   ├── ResponsiveContainer
│   │   ├── XAxis (time)
│   │   ├── YAxis (metric value)
│   │   ├── CartesianGrid
│   │   ├── Tooltip (custom)
│   │   ├── Legend (expanded only)
│   │   └── Line × N (one per group)
│   └── Downsampling Notice (conditional)
├── Streams Table
└── StreamDetailModal
```

### Data Flow

```
Time Filter (from/to)
  ↓
useMetaSyncProxy("/streams/analytics", { from, to })
  ↓
StreamAnalyticsResponse (raw API data)
  ↓
transformToChartData(response, grouping, metric)
  ↓
{ chartData: ChartDataPoint[], seriesKeys: string[] }
  ↓
downsampleIfNeeded(chartData, threshold=2000, target=500)
  ↓
Recharts LineChart renders chartData with one Line per seriesKey
```

---

## 3. Components and Interfaces

### 3.1 New Files

| File | Purpose |
|------|---------|
| `src/components/stream-analytics-chart.tsx` | Main chart component |
| `src/lib/chart-utils.ts` | Data transformation, downsampling, formatting helpers |
| `src/types/stream-analytics.ts` | TypeScript interfaces for analytics API |
| `src/types/processing-metrics.ts` | Shared `ProcessingMetrics` interface + `MetricKey` type |
| `src/lib/formatters.ts` | Shared `formatCost`, `formatDuration`, `formatDate` |

### 3.2 Modified Files

| File | Change |
|------|--------|
| `src/app/[tenantSlug]/streams/page.tsx` | Import and render `StreamAnalyticsChart` between summary and table; pass `from`, `to`, `tenantSlug`, `onStreamClick` |
| `src/app/globals.css` | Add `--chart-6`, `--chart-7`, `--chart-8` CSS variables (light + dark) |
| `src/components/stream-detail-modal.tsx` | Replace local `ProcessingMetrics` and formatters with shared imports |
| `package.json` | Add `recharts` dependency |

### 3.3 StreamAnalyticsChart Props

```typescript
interface StreamAnalyticsChartProps {
  tenantSlug: string;
  from?: string;        // ISO datetime, undefined = all time
  to?: string;          // ISO datetime, undefined = all time
  onStreamClick: (streamId: string) => void;
}
```

### 3.4 StreamAnalyticsChart Internal State

```typescript
const [metric, setMetric] = useState<MetricKey>("totalDuration");
const [grouping, setGrouping] = useState<GroupingKey>("none");
const [expanded, setExpanded] = useState<boolean>(() => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("metasync_graph_expanded") === "true";
});
const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
```

### 3.5 Chart Header Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [Metric ▾ Total Duration]  [Group by ▾ No grouping]   [⛶]  │
│                                                              │
│              ───── Chart Area (line graph) ─────             │
│                                                              │
│  ● Model A   ● Model B   ● Model C          (legend row)    │
│  Showing sampled data (500 of 3,412 streams) (notice row)   │
└──────────────────────────────────────────────────────────────┘
```

- Metric selector: shadcn `Select` component
- Grouping selector: shadcn `Select` component
- Expand toggle: shadcn `Button` variant="ghost" size="icon"
- Legend: Recharts `Legend` with `onClick` handler for toggle
- Container: shadcn `Card` with `overflow-hidden` and CSS transition on `height`

---

## 4. Data Models

### 4.1 API Response Types (`src/types/stream-analytics.ts`)

```typescript
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
```

### 4.2 Shared Processing Metrics (`src/types/processing-metrics.ts`)

Extracted from the duplicate definitions in `streams/page.tsx` and `stream-detail-modal.tsx`:

```typescript
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
```

### 4.3 Chart Data Types (`src/lib/chart-utils.ts`)

```typescript
export type GroupingKey = "none" | "model" | "clientReference" | "promptId";

/** One data point in the Recharts-compatible format */
export interface ChartDataPoint {
  timestamp: number;             // Unix ms (for XAxis)
  displayTime: string;           // Formatted time label
  streamId: string;
  userPrompt: string;
  groupKey: string;              // The group this point belongs to
  value: number;                 // The selected metric value
}

/** Result of the transform function */
export interface ChartData {
  points: ChartDataPoint[];      // All data points, sorted by timestamp
  seriesKeys: string[];          // Unique group keys, frequency-sorted
  downsampled: boolean;          // Whether downsampling was applied
  originalCount: number;         // Original count before downsampling
}
```

### 4.4 Recharts Data Shape

Recharts `LineChart` expects a flat array where each entry has the X-axis key plus one key per series. The transform function pivots the data:

```typescript
// Input: ChartDataPoint[] with groupKey per point
// Output: array of { timestamp, [seriesKey]: value, _meta_[seriesKey]: { streamId, userPrompt } }

interface RechartsRow {
  timestamp: number;
  displayTime: string;
  [seriesKey: string]: number | string | object | undefined;
}
```

For `grouping = "none"`, all points map to a single series key `"all"`.
For `grouping = "model"`, series keys are model names like `"gpt-4"`, `"claude-3"`.

---

## 5. Key Algorithms

### 5.1 Data Transformation (`transformToChartData`)

```
Input: StreamAnalyticsDataPoint[], MetricKey, GroupingKey
Output: ChartData

1. For each dataPoint:
   a. Extract groupKey based on GroupingKey:
      - "none" → "all"
      - "model" → dataPoint.model
      - "clientReference" → JSON.stringify(dataPoint.clientReference) or "unknown"
      - "promptId" → dataPoint.promptIds.join(", ") or "none"
   b. Extract metric value: dataPoint.processingMetrics[metricKey]
   c. Create ChartDataPoint { timestamp: Date.parse(createdAt), ... }

2. Sort by timestamp ascending

3. Collect unique seriesKeys, sorted by frequency (most data points first)

4. If seriesKeys.length > 8:
   - Keep top 7 by frequency
   - Merge remaining into "Other" series

5. Return { points, seriesKeys, downsampled: false, originalCount }
```

### 5.2 Downsampling (`downsampleIfNeeded`)

Applied when `points.length > 2000`. Uses time-bucket averaging:

```
Input: ChartDataPoint[], threshold=2000, target=500
Output: ChartDataPoint[] (reduced)

1. If points.length <= threshold: return as-is

2. Calculate bucketSize = points.length / target

3. For each bucket of bucketSize consecutive points:
   a. Compute average value
   b. Keep the point closest to the average (preserves real streamId)
   c. Also keep min and max value points if they differ significantly

4. Return reduced array + set downsampled=true
```

### 5.3 Pivot to Recharts Format (`pivotForRecharts`)

```
Input: ChartDataPoint[], seriesKeys: string[]
Output: RechartsRow[]

1. Group points by timestamp (same second → same row)
2. For each timestamp group:
   a. Create row: { timestamp, displayTime }
   b. For each series key, set row[seriesKey] = value (if a point exists for this group at this time)
   c. Store metadata: row[`_meta_${seriesKey}`] = { streamId, userPrompt }
3. Return rows sorted by timestamp
```

Note: Since each data point is a unique stream at a unique timestamp, most rows will only have one series populated. The chart renders this as discontinuous dots connected by lines within each series.

---

## 6. Chart Color System

### 6.1 Extending CSS Variables

Add 3 new chart colors to `globals.css` alongside existing `--chart-1` through `--chart-5`:

```css
/* :root (light) */
--chart-6: oklch(0.55 0.15 250);   /* teal-blue */
--chart-7: oklch(0.60 0.20 330);   /* magenta */
--chart-8: oklch(0.50 0.12 150);   /* forest green */

/* .dark */
--chart-6: oklch(0.65 0.18 250);
--chart-7: oklch(0.70 0.22 330);
--chart-8: oklch(0.60 0.15 150);
```

### 6.2 Color Mapping

```typescript
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

const OTHER_COLOR = "var(--muted-foreground)";
```

Each series is assigned a color by index: `seriesKeys[i] → CHART_COLORS[i]`. The "Other" bucket uses `--muted-foreground`.

### 6.3 Accessibility

The existing `--chart-*` colors in globals.css use oklch values with varied hue angles (41°, 184°, 227°, 84°, 70°). The 3 new colors add hues at 250°, 330°, 150° — together spanning the full hue wheel. This ensures perceptual distinguishability regardless of color vision.

---

## 7. Component Implementation Details

### 7.1 Data Fetching

```typescript
// Inside StreamAnalyticsChart
const analyticsParams = useMemo(() => {
  const p: Record<string, string> = {};
  if (from) p.from = from;
  if (to) p.to = to;
  return Object.keys(p).length > 0 ? p : undefined;
}, [from, to]);

const { data, isPending, error } = useMetaSyncProxy<StreamAnalyticsResponse>(
  { path: "/streams/analytics", tenantSlug, queryParams: analyticsParams },
  { staleTime: 60_000 }
);
```

### 7.2 Chart Rendering (Expanded)

```tsx
<ResponsiveContainer width="100%" height="100%">
  <LineChart data={rechartsData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
    <XAxis
      dataKey="timestamp"
      type="number"
      domain={["dataMin", "dataMax"]}
      tickFormatter={formatXAxisTick}
      stroke="var(--muted-foreground)"
      fontSize={12}
    />
    <YAxis
      tickFormatter={(v) => formatMetricValue(v, metric)}
      stroke="var(--muted-foreground)"
      fontSize={12}
      width={64}
    />
    <Tooltip content={<ChartTooltip metric={metric} />} />
    <Legend onClick={handleLegendClick} />
    {seriesKeys.map((key, i) =>
      !hiddenSeries.has(key) && (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          name={key}
          stroke={CHART_COLORS[i] ?? OTHER_COLOR}
          dot={false}
          activeDot={{
            r: 6,
            cursor: "pointer",
            onClick: (_: unknown, payload: { payload: RechartsRow }) => {
              const meta = payload.payload[`_meta_${key}`];
              if (meta?.streamId) onStreamClick(meta.streamId);
            },
          }}
          strokeWidth={2}
          connectNulls={false}
          isAnimationActive={rechartsData.length < 500}
        />
      )
    )}
  </LineChart>
</ResponsiveContainer>
```

### 7.3 Chart Rendering (Collapsed / Sparkline)

In collapsed state, render the same chart with reduced config:

```tsx
<ResponsiveContainer width="100%" height="100%">
  <LineChart data={rechartsData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
    {seriesKeys.map((key, i) =>
      !hiddenSeries.has(key) && (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          stroke={CHART_COLORS[i] ?? OTHER_COLOR}
          dot={false}
          activeDot={false}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      )
    )}
  </LineChart>
</ResponsiveContainer>
```

No axes, grid, tooltip, or legend. Just the line shapes as a visual outline.

### 7.4 Custom Tooltip

```tsx
function ChartTooltip({ active, payload, metric }: TooltipProps & { metric: MetricKey }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const meta = entry.payload[`_meta_${entry.dataKey}`];

  return (
    <div className="rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
      <p className="text-sm font-medium">{entry.name}</p>
      <p className="text-lg font-semibold">{formatMetricValue(entry.value, metric)}</p>
      <p className="text-xs text-muted-foreground">
        {new Date(entry.payload.timestamp).toLocaleString()}
      </p>
      {meta?.userPrompt && (
        <p className="mt-1 text-xs text-muted-foreground truncate max-w-[300px]">
          {meta.userPrompt.slice(0, 80)}{meta.userPrompt.length > 80 ? "…" : ""}
        </p>
      )}
    </div>
  );
}
```

### 7.5 Expand/Collapse Animation

```tsx
<Card
  className="overflow-hidden transition-[height] duration-300 ease-in-out"
  style={{
    height: expanded
      ? `clamp(400px, calc(100vh - 220px), 800px)`
      : "136px",  // 80px chart + 56px header
  }}
>
```

### 7.6 Responsive Breakpoint

Hide chart entirely below 768px:

```tsx
<div className="hidden md:block">
  <StreamAnalyticsChart ... />
</div>
```

Applied in `streams/page.tsx`, not inside the component itself.

---

## 8. Shared Formatters (`src/lib/formatters.ts`)

Extract from `streams/page.tsx` and `stream-detail-modal.tsx`:

```typescript
export function formatCost(cost: number, currency?: string): string {
  const sym = currency === "EUR" ? "€" : "$";
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

export function formatMetricValue(value: number, metric: MetricKey): string {
  if (metric.endsWith("Cost")) return formatCost(value);
  if (metric.endsWith("Duration") || metric === "duration") return formatDuration(value);
  return value.toLocaleString();  // Tokens: integer with separators
}
```

---

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| Analytics endpoint returns error | Render `MetaSyncError` inline within the chart Card, at current height. Show retry button via `onRetry` prop. |
| Analytics endpoint returns 0 dataPoints | Render empty state: centered `BarChart3` icon (lucide) + "No analytics data for the selected time range" text inside chart area. |
| Network timeout | Standard TanStack Query error handling. `MetaSyncError` displays the message. |
| Malformed response | TypeScript parse will succeed but empty/null fields handled: missing `processingMetrics` → skip data point in transform. |
| Backend unreachable | Proxy returns `"backend_unreachable"` → `MetaSyncError` shows configuration link. |

Error state renders inside the Card at whatever height it currently is (collapsed or expanded).

---

## 10. Testing Strategy

### 10.1 Unit Tests (`vitest`)

| Test | File |
|------|------|
| `transformToChartData` produces correct series for each grouping | `src/lib/__tests__/chart-utils.test.ts` |
| `downsampleIfNeeded` reduces points correctly, preserves min/max | `src/lib/__tests__/chart-utils.test.ts` |
| `pivotForRecharts` creates correct row structure | `src/lib/__tests__/chart-utils.test.ts` |
| `formatMetricValue` returns correct format per metric type | `src/lib/__tests__/formatters.test.ts` |
| Metric selector changes Y-axis without refetch | `src/components/__tests__/stream-analytics-chart.test.tsx` |
| Grouping selector changes series without refetch | `src/components/__tests__/stream-analytics-chart.test.tsx` |
| Expand/collapse toggles height and persists to localStorage | `src/components/__tests__/stream-analytics-chart.test.tsx` |
| `activeDot` click calls `onStreamClick` with streamId | `src/components/__tests__/stream-analytics-chart.test.tsx` |

### 10.2 Integration Tests

| Test | Scope |
|------|-------|
| Changing time filter on Streams page triggers analytics refetch | Streams page + chart integration |
| Chart renders alongside table and summary without layout issues | Visual regression |

### 10.3 Manual Verification

1. Select each time filter preset → chart updates
2. Select each metric → Y-axis label and values change
3. Select each grouping → lines split/merge correctly
4. Click expand → chart grows with animation
5. Click collapse → chart shrinks, legend disappears
6. Click a data point → StreamDetailModal opens with correct stream
7. Click legend entry → line toggles visibility
8. Toggle dark mode → chart colors adapt
9. Verify on 768px viewport → chart hidden
10. Test with 0 data points → empty state displays
11. Test with >2000 data points → downsampling notice appears

---

## 11. Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Large dataset rendering (>2000 points) | Client-side downsampling to 500 points via time-bucket averaging |
| Animation overhead on large data | Disable animation when `dataPoints.length >= 500` |
| Dot rendering overhead | `dot={false}` always; only `activeDot` on hover |
| Bundle size | Selective imports from recharts (`LineChart`, `Line`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `ResponsiveContainer`). Estimated ~40KB gzip. |
| Parallel fetching | Analytics query runs independently from `/stream` and `/stream/summary` queries (separate query keys, separate `useMetaSyncProxy` calls) |
| Re-renders on metric/grouping change | Data transform uses `useMemo` keyed on `[data, metric, grouping]`. Chart component memoized. No refetch needed. |
| SSR hydration | Component is `"use client"` and uses `ResponsiveContainer`. No SSR mismatch since the parent page is already `"use client"`. |

---

## 12. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Data isolation | Handled by existing proxy. Tenant users see only their client's streams. Admin/owner see all. No change needed. |
| Credential exposure | Analytics data passes through same proxy pattern. MetaSync API keys never touch the browser. |
| XSS via userPrompt in tooltip | React escapes all text content by default. `userPrompt` is rendered as text node, not `dangerouslySetInnerHTML`. |
| localStorage tampering | Only stores boolean `expanded` state. No security impact. |

---

## 13. Monitoring and Observability

| Signal | Implementation |
|--------|---------------|
| Analytics endpoint latency | TanStack Query's built-in `isFetching` state. Slow fetches show extended skeleton. |
| Data point count | Logged to console in development when downsampling triggers. |
| Error rate | Standard `MetaSyncError` rendering. Errors are visible to the user and can be retried. |
| Chart render performance | React DevTools profiler during development. No production instrumentation needed for this component. |
