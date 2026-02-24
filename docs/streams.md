# Streams & Analytics

## Stream Analytics Chart

**Location:** `src/components/stream-analytics-chart.tsx`

The Streams page includes a collapsible time-series chart that visualizes per-stream processing metrics. It sits between the summary card and the streams table.

### Supported Metrics

| Key | Label | Format |
|-----|-------|--------|
| `totalDuration` | Total Duration | Time (s/ms) |
| `duration` | Duration | Time (s/ms) |
| `llmDuration` | LLM Duration | Time (s/ms) |
| `overheadDuration` | Overhead Duration | Time (s/ms) |
| `totalTokens` | Total Tokens | Integer |
| `inputTokens` | Input Tokens | Integer |
| `outputTokens` | Output Tokens | Integer |
| `totalCost` | Total Cost | Currency |
| `inputCost` | Input Cost | Currency |
| `outputCost` | Output Cost | Currency |

### Grouping Options

| Key | Label | Description |
|-----|-------|-------------|
| `none` | No grouping | Single line showing all data points |
| `model` | By Model | One line per LLM model |
| `clientReference` | By Session | One line per unique client reference |
| `promptId` | By Prompt | One line per prompt ID combination |

### Data Flow

1. Chart fetches from `GET /streams/analytics` via `useMetaSyncProxy`
2. Query params: `from`/`to` from the page's time filter
3. Response transformed client-side into Recharts-compatible format
4. Metric and grouping changes are instant (no refetch)
5. Datasets >2000 points are downsampled to ~500 points

### States

- **Collapsed** (default): 136px sparkline outline, no axes/legend/tooltip
- **Expanded**: Full chart with axes, grid, legend, tooltip, and click interaction
- **Loading**: Skeleton placeholder
- **Empty**: "No analytics data" message with icon
- **Error**: Inline `MetaSyncError` with retry

### Interactions

- **Metric selector**: Changes Y-axis metric and formatting
- **Grouping selector**: Splits data into colored multi-series lines
- **Legend click**: Toggles series visibility
- **Data point click**: Opens `StreamDetailModal` for that stream
- **Expand/collapse**: Persisted to `localStorage` key `metasync_graph_expanded`

### Key Files

| File | Purpose |
|------|---------|
| `src/components/stream-analytics-chart.tsx` | Main chart component |
| `src/lib/chart-utils.ts` | Data transformation, downsampling, pivot |
| `src/lib/formatters.ts` | Shared format functions (cost, duration, metric) |
| `src/types/stream-analytics.ts` | Analytics API response types |
| `src/types/processing-metrics.ts` | Shared `ProcessingMetrics` interface |
