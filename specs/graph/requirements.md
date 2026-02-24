# Stream Analytics Graph — Requirements

**Spec folder:** `specs/graph/`
**Depends on:** `specs/baseline/` (FR-STREAM-1 Browse Streams, FR-STREAM-2 Stream Details)

---

## 1. Introduction

This feature adds a collapsible time-series analytics chart to the Streams page (`/[tenantSlug]/streams`). The chart visualizes per-stream processing metrics (tokens, durations, costs) over time, using data from the MetaSync `GET /streams/analytics` endpoint. It sits between the existing filter/summary section and the streams table, giving users an at-a-glance visual of stream performance trends.

---

## 2. Alignment with Product Vision

Stream analytics closes the observability gap between raw stream data (table) and aggregate summaries (summary card). Users can:

- Spot performance regressions (duration spikes) across time
- Compare cost and token usage across models, sessions, or prompts
- Correlate patterns without exporting data to external tools

This extends the Streams section without changing existing functionality.

---

## 3. Functional Requirements

### FR-GRAPH-1: Stream Analytics Chart Component

**As a** tenant admin or tenant user, **I want** to see a time-series chart of stream processing metrics on the Streams page, **so that** I can visually identify performance trends without inspecting individual streams.

Acceptance Criteria:
- The chart renders between the summary card and the streams table
- Line graph with time (`createdAt`) on X-axis, selected metric value on Y-axis
- Each data point represents one completed stream from the analytics endpoint
- Only completed streams are shown (filtered server-side by the analytics endpoint)
- Empty state when no data: "No analytics data for the selected time range"
- Loading state: skeleton placeholder matching the chart's current height

---

### FR-GRAPH-2: Collapsed and Expanded States

**As a** user, **I want** the chart to default to a compact collapsed state and expand on demand, **so that** the streams table remains the primary focus.

Acceptance Criteria:
- Default: collapsed at fixed low height (~80px) showing a simplified sparkline outline of the data
- Collapsed state hides axis labels, legends, and tooltips
- Expand/collapse toggle button in the top-right corner of the chart container (`Maximize2` / `Minimize2` from `lucide-react`)
- Expanded: chart grows to `calc(100vh - 220px)`, min 400px, max 800px
- Expanded state shows full axis labels, grid lines, legend, and interactive tooltips
- Height transition is animated (CSS transition, 200–300ms)
- Collapsed/expanded state persists in `localStorage` key `metasync_graph_expanded`
- Toggling does not trigger a data refetch

---

### FR-GRAPH-3: Metric Selection

**As a** user, **I want** to choose which processing metric the chart displays, **so that** I can analyze the specific dimension I care about.

Acceptance Criteria:
- Metric selector (dropdown) in the chart header area
- Available metrics from `processingMetrics`:
  | Key | Label |
  |-----|-------|
  | `inputTokens` | Input Tokens |
  | `outputTokens` | Output Tokens |
  | `totalTokens` | Total Tokens |
  | `duration` | Duration |
  | `llmDuration` | LLM Duration |
  | `totalDuration` | Total Duration |
  | `overheadDuration` | Overhead Duration |
  | `inputCost` | Input Cost |
  | `outputCost` | Output Cost |
  | `totalCost` | Total Cost |
- Default: `totalDuration`
- Changing the metric updates Y-axis and all series immediately (no new API call — data already fetched)
- Y-axis formatting adapts to metric type:
  - Tokens: integer with thousands separator (e.g. "1,234")
  - Durations: seconds formatting (e.g. "1.23s", "450ms")
  - Costs: currency formatting using existing `formatCost` pattern (e.g. "$0.0006")
- Selected metric resets to `totalDuration` on page reload (component state only)

---

### FR-GRAPH-4: Grouping / Multi-Series Lines

**As a** user, **I want** to group data points into separate lines by model, session, or prompt, **so that** I can compare performance across different configurations.

Acceptance Criteria:
- Grouping selector next to the metric selector in the chart header
- Available groupings:
  | Value | Label |
  |-------|-------|
  | `none` | No grouping |
  | `model` | By Model |
  | `clientReference` | By Session |
  | `promptId` | By Prompt |
- Default: `none` (single line)
- Each group renders as a separate line with a distinct color (minimum 8 distinguishable colors, colorblind-safe palette)
- Legend displayed below the chart in expanded state, hidden in collapsed state
- When >8 groups, legend is scrollable; least-frequent groups share a muted "Other" color
- Tooltip on hover shows: metric value, group label, stream timestamp, `userPrompt` (truncated to 80 chars)
- Clicking a legend entry toggles that series' visibility
- Changing grouping does not trigger a new API call

---

### FR-GRAPH-5: Integration with Existing Filters

**As a** user, **I want** the analytics chart to reflect the same time range as the streams table, **so that** chart and table show consistent data.

Acceptance Criteria:
- Chart uses the same `from`/`to` parameters from the time filter selector (1h, 6h, 24h, 7d, 30d, all time)
- Time filter change triggers a chart data refetch with updated `from`/`to`
- "All time" selection omits both `from` and `to` parameters
- Chart data is fetched independently from streams table data (separate TanStack Query cache entry)
- Status and model filters do NOT affect the analytics chart (endpoint returns only completed streams, no status/model filter support)

---

### FR-GRAPH-6: Analytics Data Fetching

**As a** user, **I want** analytics data fetched efficiently through the existing proxy, **so that** it respects authentication and tenant isolation.

Acceptance Criteria:
- Fetch via `useMetaSyncProxy` hook with path `/streams/analytics`
- Query params: `from` and `to` as ISO datetime strings
- TanStack Query cache key includes: `tenantSlug`, `/streams/analytics`, `from`, `to`, `selectedClientId`
- `staleTime`: 60 seconds
- Tenant user: proxy sends client API key → sees own streams only
- Admin/owner: proxy sends admin API key → sees all streams
- Error: display `MetaSyncError` component inline within chart container
- Response typed with `StreamAnalyticsResponse` interface (see §6)

---

### FR-GRAPH-7: Data Point Click Interaction

**As a** user, **I want** to click a data point in the chart to view the stream's full details, **so that** I can investigate outliers quickly.

Acceptance Criteria:
- Clicking a data point opens `StreamDetailModal` with that stream's `streamId`
- Click target uses Recharts `activeDot` with radius ≥ 6
- Cursor changes to pointer on data point hover

---

## 4. Non-Functional Requirements

### 4.1 Architecture

- **NFR-GRAPH-ARCH-1**: `StreamAnalyticsChart` is a self-contained `"use client"` component receiving props (`from`, `to`, `tenantSlug`, `onStreamClick`) and managing its own internal state (metric, grouping, expanded). No direct dependency on parent page state beyond props.
- **NFR-GRAPH-ARCH-2**: Install `recharts` v2.x as production dependency. No other charting library.
- **NFR-GRAPH-ARCH-3**: Define `StreamAnalyticsResponse`, `StreamAnalyticsDataPoint`, `StreamAnalyticsGroup`, and `MetricKey` TypeScript interfaces matching the endpoint contract (see §6). Metric keys typed as a union, not bare strings.

### 4.2 Performance

- **NFR-GRAPH-PERF-1**: Chart renders smoothly with up to 2,000 data points. Above 2,000: apply client-side downsampling (time-bucket averaging) to ≤500 points, preserving min/max outliers per bucket. Display notice: "Showing sampled data (N of M streams)".
- **NFR-GRAPH-PERF-2**: Recharts bundle impact ≤50 KB gzip. Import selectively: `LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `ResponsiveContainer`.
- **NFR-GRAPH-PERF-3**: Analytics fetch does not block or delay existing `/stream` and `/stream/summary` fetches. All three run in parallel.

### 4.3 Usability

- **NFR-GRAPH-UX-1**: Desktop (1280px+): full width. Tablet (768–1279px): full width, legend wraps. Below 768px: chart hidden entirely.
- **NFR-GRAPH-UX-2**: Loading → skeleton at current height. Empty → centered "No analytics data" message. Error → inline `MetaSyncError`.
- **NFR-GRAPH-UX-3**: Line colors have ≥3:1 contrast against chart background in both light and dark themes. Use a colorblind-safe palette (avoid relying solely on red/green).
- **NFR-GRAPH-UX-4**: Expand/collapse toggle, metric selector, and grouping selector are keyboard-accessible (Tab + Enter/Space).

### 4.4 Security

- **NFR-GRAPH-SEC-1**: Analytics endpoint follows the same auth model as all MetaSync proxy calls. `useMetaSyncProxy` handles JWT and client ID injection. No additional auth logic needed.

---

## 5. Out of Scope

- Custom date range picker (chart uses existing time filter presets)
- Data export (CSV, image)
- Real-time auto-refresh / WebSocket / SSE for live chart updates
- Server-side aggregation for chart (aggregation is client-side)
- Zoom and pan on chart (time range changed via filter selector)
- Independent status/model filters on the chart

---

## 6. Interface Contracts

### 6.1 Request

```
GET /streams/analytics?from={ISO datetime}&to={ISO datetime}
```

Proxied via `POST /functions/v1/proxy` with `{ tenantId, path: "/streams/analytics?from=...&to=...", method: "GET" }`.

### 6.2 Response Types

```typescript
interface StreamAnalyticsResponse {
  dataPoints: StreamAnalyticsDataPoint[];
  groups: StreamAnalyticsGroup[];
  totalCount: number;
  dateRange: {
    from: string;
    to: string;
  };
}

interface StreamAnalyticsDataPoint {
  streamId: string;
  createdAt: string;
  model: string;
  clientReference: Record<string, unknown> | null;
  promptIds: string[];
  userPrompt: string;
  processingMetrics: ProcessingMetrics;
}

interface StreamAnalyticsGroup {
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

type MetricKey =
  | "inputTokens"
  | "outputTokens"
  | "totalTokens"
  | "duration"
  | "llmDuration"
  | "totalDuration"
  | "overheadDuration"
  | "inputCost"
  | "outputCost"
  | "totalCost";
```

`ProcessingMetrics` reuses the existing interface from `streams/page.tsx`.
