# Stream Analytics Graph — Tasks

**Spec folder:** `specs/graph/`
**Requirements:** `specs/graph/requirements.md`
**Design:** `specs/graph/design.md`

---

## Phase 1: Shared Foundation

**Goal:** Extract duplicated types and formatters into shared modules. Existing functionality unchanged.

**Verify:** Run `npm run type-check && npm run test` — all pass. Streams page and stream detail modal render identically.

### Task 1.1: Create shared ProcessingMetrics type

Create `src/types/processing-metrics.ts`:
- Export `ProcessingMetrics` interface (copy from `src/app/[tenantSlug]/streams/page.tsx:16-28`)
- Export `MetricKey` type: `keyof Omit<ProcessingMetrics, "currency">`

**Tests:** `src/types/__tests__/processing-metrics.test.ts`
- Verify `MetricKey` includes all 10 metric keys and excludes `"currency"`

### Task 1.2: Create shared formatters

Create `src/lib/formatters.ts`:
- Export `formatCost(cost: number, currency?: string): string` (copy from `src/app/[tenantSlug]/streams/page.tsx:82-88`)
- Export `formatDuration(seconds: number): string` (copy from `src/app/[tenantSlug]/streams/page.tsx:90-94`)
- Export `formatDate(iso: string): string` (copy from `src/components/stream-detail-modal.tsx:85-87`)
- Export `formatMetricValue(value: number, metric: MetricKey): string` — new function per design §8

**Tests:** `src/lib/__tests__/formatters.test.ts`
- `formatCost`: USD/EUR symbols, small costs (6 decimals), large costs (dots separator)
- `formatDuration`: <1s (ms), <60s (seconds), >=60s (minutes)
- `formatMetricValue`: delegates to correct formatter per metric type (token → locale string, duration → formatDuration, cost → formatCost)

### Task 1.3: Refactor streams page to use shared modules

Modify `src/app/[tenantSlug]/streams/page.tsx`:
- Replace local `ProcessingMetrics` interface with `import type { ProcessingMetrics } from "@/types/processing-metrics"`
- Replace local `formatCost` and `formatDuration` with `import { formatCost, formatDuration } from "@/lib/formatters"`
- Remove the local function definitions

**Tests:** Existing page behavior unchanged. Run `npm run type-check`.

### Task 1.4: Refactor stream detail modal to use shared modules

Modify `src/components/stream-detail-modal.tsx`:
- Replace local `ProcessingMetrics` interface with shared import
- Replace local `formatCost`, `formatDuration`, `formatDate` with shared imports
- Remove the local function definitions

**Tests:** Existing modal behavior unchanged. Run `npm run type-check`.

---

## Phase 2: Analytics Types & Chart Utilities

**Goal:** Create the analytics API types and all data transformation functions. No UI yet.

**Verify:** Run `npm run test` — all unit tests for chart-utils pass.

### Task 2.1: Create analytics API types

Create `src/types/stream-analytics.ts`:
- Export `StreamAnalyticsResponse`, `StreamAnalyticsDataPoint`, `StreamAnalyticsGroup` interfaces per design §4.1
- Import `ProcessingMetrics` from `@/types/processing-metrics`

No tests needed — pure type definitions.

### Task 2.2: Create chart-utils with data transformation

Create `src/lib/chart-utils.ts`:
- Export `GroupingKey` type: `"none" | "model" | "clientReference" | "promptId"`
- Export `ChartDataPoint` and `ChartData` interfaces per design §4.3
- Export `RechartsRow` interface per design §4.4
- Export `METRIC_OPTIONS` constant: array of `{ key: MetricKey, label: string }` for the 10 metrics
- Export `GROUPING_OPTIONS` constant: array of `{ key: GroupingKey, label: string }` for the 4 groupings
- Export `CHART_COLORS` constant: 8 CSS variable references per design §6.2
- Export `OTHER_COLOR` constant
- Export `transformToChartData(dataPoints, metric, grouping): ChartData` per design §5.1
- Export `downsampleIfNeeded(points, threshold?, target?): { points, downsampled, originalCount }` per design §5.2
- Export `pivotForRecharts(points, seriesKeys): RechartsRow[]` per design §5.3

**Tests:** `src/lib/__tests__/chart-utils.test.ts`

`transformToChartData`:
- Grouping `"none"` → single series key `"all"`, all points included
- Grouping `"model"` → one series per unique model
- Grouping `"clientReference"` → one series per unique clientReference
- Grouping `"promptId"` → one series per unique promptIds combo
- >8 unique groups → top 7 kept, rest merged to "Other"
- Points sorted by timestamp ascending
- Missing processingMetrics → point skipped

`downsampleIfNeeded`:
- Points below threshold → returned unchanged, `downsampled: false`
- Points above threshold → reduced to ≤target, `downsampled: true`
- Min and max values preserved per bucket

`pivotForRecharts`:
- Produces rows with timestamp + series key columns
- Metadata stored in `_meta_{key}` fields with `streamId` and `userPrompt`
- Rows sorted by timestamp

---

## Phase 3: CSS + Recharts Dependency

**Goal:** Install Recharts and extend the chart color palette. Build still passes.

**Verify:** Run `npm run build` — no errors. Verify `--chart-6/7/8` variables are defined in both light and dark themes.

### Task 3.1: Install Recharts

Run `npm install recharts`.

### Task 3.2: Extend chart CSS variables

Modify `src/app/globals.css`:

In `:root` block, after `--chart-5` (line 74), add:
```css
--chart-6: oklch(0.55 0.15 250);
--chart-7: oklch(0.60 0.20 330);
--chart-8: oklch(0.50 0.12 150);
```

In `.dark` block, after `--chart-5` (line 108), add:
```css
--chart-6: oklch(0.65 0.18 250);
--chart-7: oklch(0.70 0.22 330);
--chart-8: oklch(0.60 0.15 150);
```

In `@theme inline` block, after `--color-chart-1` (line 24), add:
```css
--color-chart-8: var(--chart-8);
--color-chart-7: var(--chart-7);
--color-chart-6: var(--chart-6);
```

---

## Phase 4: Chart Component — Core Rendering

**Goal:** Implement the `StreamAnalyticsChart` component with basic rendering (single series, expanded view, data fetching). Integrate into Streams page.

**Verify:** Navigate to Streams page. Chart appears between summary card and table. It fetches data from `/streams/analytics` and renders a line chart with `totalDuration` metric. Changing time filter updates the chart.

### Task 4.1: Create StreamAnalyticsChart component (basic)

Create `src/components/stream-analytics-chart.tsx`:

Props: `StreamAnalyticsChartProps` per design §3.3.

Implementation:
1. Data fetching via `useMetaSyncProxy<StreamAnalyticsResponse>` with path `/streams/analytics` and query params `{ from, to }`. `staleTime: 60_000`.
2. Data transform via `useMemo` calling `transformToChartData` + `downsampleIfNeeded` + `pivotForRecharts` keyed on `[data, metric, grouping]`.
3. States: `metric` (default `"totalDuration"`), `grouping` (default `"none"`), `expanded` (default from localStorage), `hiddenSeries` (default empty Set).
4. Chart header: metric selector (`Select`), grouping selector (`Select`), expand toggle (`Button` with `Maximize2`/`Minimize2` icons).
5. Chart area: `ResponsiveContainer` → `LineChart` with `XAxis`, `YAxis`, `CartesianGrid`, single `Line` (grouping=none initially).
6. Loading state: `Skeleton` at current height.
7. Error state: `MetaSyncError` inline.
8. Empty state: centered message with `BarChart3` icon.
9. Container: `Card` with animated height transition per design §7.5.

### Task 4.2: Integrate chart into Streams page

Modify `src/app/[tenantSlug]/streams/page.tsx`:

1. Import `StreamAnalyticsChart` from `@/components/stream-analytics-chart`
2. Between the summary card (after line 270) and the table (before line 272), add:
```tsx
<div className="hidden md:block">
  <StreamAnalyticsChart
    tenantSlug={tenantSlug}
    from={queryParams?.from}
    to={queryParams?.to}
    onStreamClick={(id) => setSelectedStreamId(id)}
  />
</div>
```

**Tests:** Manual — chart renders, fetches data, shows loading/empty/error states.

---

## Phase 5: Expanded/Collapsed States

**Goal:** Implement the collapse/expand toggle with sparkline rendering and localStorage persistence.

**Verify:** Click expand → chart grows with animation, shows axes/grid/legend. Click collapse → chart shrinks to sparkline, hides axes/legend. Refresh page → state preserved.

### Task 5.1: Implement collapsed sparkline rendering

In `src/components/stream-analytics-chart.tsx`:
- When `expanded === false`: render simplified LineChart per design §7.3 — no axes, grid, tooltip, or legend. `strokeWidth: 1.5`, `activeDot: false`.
- When `expanded === true`: render full chart per design §7.2.

### Task 5.2: Implement expand/collapse toggle with persistence

In `src/components/stream-analytics-chart.tsx`:
- Toggle button updates `expanded` state and writes to `localStorage` key `metasync_graph_expanded`.
- Card height uses CSS `transition-[height] duration-300 ease-in-out`.
- Collapsed height: `136px` (56px header + 80px sparkline).
- Expanded height: `clamp(400px, calc(100vh - 220px), 800px)`.

**Tests:** `src/components/__tests__/stream-analytics-chart.test.tsx`
- Default state: collapsed (expanded=false when localStorage empty)
- Toggle button click: switches between collapsed/expanded
- localStorage: written on toggle, read on mount

---

## Phase 6: Metric Selection & Axis Formatting

**Goal:** Metric dropdown changes the Y-axis metric and formatting without refetching.

**Verify:** Select each of the 10 metrics. Y-axis values change format (tokens=integers, durations=time strings, costs=currency). No network request on metric change.

### Task 6.1: Implement metric selector

In `src/components/stream-analytics-chart.tsx`:
- Wire the metric `Select` component to `setMetric` state.
- `METRIC_OPTIONS` from `chart-utils` populates the dropdown items.
- `useMemo` for chart data re-runs with new `metric` value.
- `YAxis tickFormatter` uses `formatMetricValue` from `@/lib/formatters`.

**Tests:** `src/components/__tests__/stream-analytics-chart.test.tsx`
- Metric change: re-renders chart with new Y-axis formatting
- No additional fetch triggered on metric change (assert queryClient not called)

---

## Phase 7: Grouping & Multi-Series

**Goal:** Grouping dropdown splits data into multiple colored lines with legend and toggle.

**Verify:** Select "By Model" → lines split by model name, each in a distinct color. Legend appears below chart in expanded state. Click legend entry → line hides. Select "No grouping" → single line.

### Task 7.1: Implement grouping selector and multi-line rendering

In `src/components/stream-analytics-chart.tsx`:
- Wire the grouping `Select` to `setGrouping` state.
- `useMemo` re-runs `transformToChartData` with new `grouping`.
- Render one `Line` per entry in `seriesKeys` with `CHART_COLORS[i]`.
- `Legend` component shown only when `expanded === true`.

### Task 7.2: Implement legend click to toggle series

In `src/components/stream-analytics-chart.tsx`:
- `handleLegendClick`: toggles entry in `hiddenSeries` Set.
- Hidden series' `Line` components are not rendered.

**Tests:** `src/components/__tests__/stream-analytics-chart.test.tsx`
- Grouping by model produces expected number of lines
- Legend click hides a series

---

## Phase 8: Tooltip & Data Point Interaction

**Goal:** Custom tooltip on hover. Click data point to open stream detail modal.

**Verify:** Hover over data point → tooltip shows metric value, group label, timestamp, truncated userPrompt. Click data point → `StreamDetailModal` opens with correct stream.

### Task 8.1: Implement custom tooltip

In `src/components/stream-analytics-chart.tsx`:
- Create `ChartTooltip` sub-component per design §7.4.
- Tooltip shown only in expanded state.
- Displays: series name, formatted metric value, timestamp, userPrompt (truncated to 80 chars).
- Styled with popover semantic classes (`bg-popover text-popover-foreground`).

### Task 8.2: Implement activeDot click handler

In `src/components/stream-analytics-chart.tsx`:
- `activeDot` on each `Line`: `{ r: 6, cursor: "pointer", onClick }`.
- `onClick` extracts `streamId` from `_meta_{key}` in the RechartsRow payload.
- Calls `onStreamClick(streamId)` prop.

**Tests:** `src/components/__tests__/stream-analytics-chart.test.tsx`
- `onStreamClick` called with correct `streamId` when activeDot clicked

---

## Phase 9: Downsampling Notice

**Goal:** Large datasets display a notice about sampled data.

**Verify:** With >2000 data points, chart renders smoothly and shows "Showing sampled data (500 of N streams)" notice below the chart area.

### Task 9.1: Implement downsampling notice

In `src/components/stream-analytics-chart.tsx`:
- When `chartData.downsampled === true`, render a small text notice below the chart area:
  `"Showing sampled data ({points.length} of {originalCount} streams)"`
- Styled: `text-xs text-muted-foreground` centered below the chart.

No additional tests beyond the existing `downsampleIfNeeded` unit tests in Phase 2.

---

## Phase 10: Final Polish & Verification

**Goal:** All requirements met. Type-check, lint, and tests pass.

**Verify:**
1. `npm run type-check` — passes
2. `npm run lint` — passes
3. `npm run test` — all unit tests pass
4. Manual verification checklist from design §10.3:
   - Each time filter preset → chart updates
   - Each metric → Y-axis format changes
   - Each grouping → lines split/merge
   - Expand/collapse with animation
   - Click data point → modal opens
   - Legend toggle → line hides/shows
   - Dark mode → colors adapt
   - 768px viewport → chart hidden
   - 0 data points → empty state
   - Error state → MetaSyncError inline

### Task 10.1: Run full validation

Run:
```bash
npm run type-check
npm run lint
npm run test
```

Fix any issues.

### Task 10.2: Update documentation

Create or update `docs/streams.md` with a section on the analytics chart:
- Feature description
- Supported metrics and groupings
- Data flow overview

Update `docs/index.md` if new doc file was created.
