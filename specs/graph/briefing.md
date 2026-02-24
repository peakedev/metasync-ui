I want you to show at the top of the streams table a graph that summarizes what's being seen on the screen. So it should take the same from and to data as being currently selected. the graph appears between the table and the header which is composed of the filters and the summaries. The graph is by default shrinked. we should just seek some kind of like a very low height outline of the graph, but there is an expand button in it. When you click on it, the graph can expense. In uh vertical height and take almost of all the screen size. The graph shows a time series with each stream as data points. There's multiple things that we will want to graph. That's everything which is in within the processing metrics of the response, which includes input token, output token, total token, duration, LLM duration, total duration, overhead duration. Operation input cost output cost total cost. The default selected should be total duration.The final graph should then show all the different data points. as line graphs and it should show different lines based on different groupings. The groupings are selectable, you can group by model, you can group by client reference like session ID for example. You can group by prompt ID. 

Summary about the stream enpoint

## Stream Analytics Endpoint

**`GET /streams/analytics`** returns per-stream processing metrics for frontend charting. Only **completed** streams with metrics are included.

### Response Structure

- **`dataPoints`** -- One entry per stream: ID, timestamp, model, prompts, user prompt, and full processing metrics (tokens, durations, costs).
- **`groups`** -- Auto-aggregated by unique **(model, clientReference, promptIds)** combo, with summed tokens, duration, and cost.
- **`totalCount`** -- Number of data points.
- **`dateRange`** -- Echo of applied date filters.

### Date Filters

Two optional query params filter on `_metadata.createdAt`:

- **`from`** -- ISO datetime lower bound (`$gte`)
- **`to`** -- ISO datetime upper bound (`$lte`)

```
GET /streams/analytics?from=2026-01-01T00:00:00&to=2026-02-24T23:59:59
```

### Sample Response

```json
{
  "dataPoints": [
    {
      "streamId": "68d39fe8aac434df5f140c57",
      "createdAt": "2026-01-15T10:30:00",
      "model": "gpt-4",
      "clientReference": { "sessionId": "abc" },
      "promptIds": ["id1"],
      "userPrompt": "Summarize this...",
      "processingMetrics": {
        "inputTokens": 10,
        "outputTokens": 50,
        "totalTokens": 60,
        "duration": 1.45,
        "llmDuration": 1.23,
        "totalDuration": 1.45,
        "overheadDuration": 0.22,
        "inputCost": 0.0001,
        "outputCost": 0.0005,
        "totalCost": 0.0006,
        "currency": "USD"
      }
    }
  ],
  "groups": [
    {
      "model": "gpt-4",
      "clientReference": { "sessionId": "abc" },
      "promptIds": ["id1"],
      "count": 5,
      "aggregatedMetrics": {
        "inputTokens": 150,
        "outputTokens": 800,
        "totalTokens": 950,
        "totalDuration": 12.5,
        "totalCost": 0.023,
        "currency": "USD"
      }
    }
  ],
  "totalCount": 20,
  "dateRange": {
    "from": "2026-01-01T00:00:00",
    "to": "2026-02-24T23:59:59"
  }
}
```

### Auth

Client auth sees own streams only; admin auth sees all. Invalid ISO dates return `400`.