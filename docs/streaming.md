# Streaming (Chat Interface)

The stream feature (FR-STREAM-3) is presented as a **chat interface**, not a form. Characters stream into the model response bubble in real-time as they are received from the MetaSync backend via Server-Sent Events (SSE).

> Sequence diagram: [`./diagrams/proxy-flow.drawio`](./diagrams/proxy-flow.drawio)

## Architecture

```
Browser (chat UI)
  → GET /functions/v1/stream-proxy   (Authorization: Bearer JWT)
      → Validates JWT
      → Retrieves API key from Vault
      → POST {backend_url}/stream   (api_key header)
          → MetaSync backend returns SSE stream
      → Pipes raw SSE chunks to browser
          (Content-Type: text/event-stream)
  → ReadableStream reader appends tokens to chat bubble
```

The `stream-proxy` edge function acts as a transparent pipe — it does not buffer or modify SSE chunks.

## `stream-proxy` Edge Function

**Path**: `GET /functions/v1/stream-proxy`
**Auth**: JWT required

### Query parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `tenantId` | `string` | Yes | Target tenant UUID |
| `model` | `string` | Yes | Model name (from tenant's configured models) |
| `temperature` | `number` | Yes | Sampling temperature |
| `userPrompt` | `string` | Yes | The user's message |
| `additionalPrompts` | `string` | No | JSON-encoded array of additional prompt IDs |

### Response

`Content-Type: text/event-stream` — raw SSE stream from MetaSync, piped verbatim.

MetaSync emits:
- `data: <token>` — one or more characters per chunk
- `data: [DONE]` — signals stream completion
- `event: error\ndata: <message>` — error during generation

## `useStreamProxy` Hook

Manages the full lifecycle of a streaming chat session.

```ts
const {
  messages,     // ChatMessage[] — full conversation history
  isStreaming,  // boolean — true while model is generating
  error,        // string | null — last error message
  send,         // (userPrompt: string) => void — send a message
  reset,        // () => void — clear conversation
} = useStreamProxy({ tenantId, model, temperature })
```

### Internal state machine

```
idle
  → send() called
  → streaming   (fetch with ReadableStream reader; appends to last message bubble)
  → done        (on [DONE] event; metrics rendered; input re-enabled)
  → error       (on SSE error event or fetch failure; error bubble rendered; input re-enabled)
  → idle        (ready for next message)
```

### Implementation sketch

```ts
async function send(userPrompt: string) {
  setState('streaming')
  appendUserBubble(userPrompt)
  appendModelBubble('')  // empty bubble that will fill up

  const params = new URLSearchParams({ tenantId, model, temperature, userPrompt })
  const res = await fetch(`${SUPABASE_URL}/functions/v1/stream-proxy?${params}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: [DONE]')) {
        setState('done')
        return
      }
      if (line.startsWith('event: error')) {
        setState('error')
        return
      }
      if (line.startsWith('data: ')) {
        appendToLastBubble(line.slice(6))  // append token text
      }
    }
  }
}
```

## Chat UI

**Layout** (`app/[tenantSlug]/streams/new/`):

```
┌─────────────────────────────────────┐
│  Model: [dropdown]  Temp: [slider]  │  ← toolbar (disabled after first message)
├─────────────────────────────────────┤
│                                     │
│        User message          [you]  │  ← right-aligned bubble
│                                     │
│  [GPT-4o]                           │  ← left-aligned bubble, labelled with model name
│  Model response streams here...     │
│  ─────────────────────────────────  │
│  Tokens: 142  Cost: $0.0003  42ms   │  ← metrics shown after [DONE]
│                                     │
├─────────────────────────────────────┤
│  [Type a message...        ] [Send] │  ← disabled while streaming
└─────────────────────────────────────┘
```

- **User bubble**: right-aligned, neutral background
- **Model bubble**: left-aligned, labelled with the model name (e.g. `[GPT-4o]`)
- **Error bubble**: left-aligned, red border, inline error message — does not block further messages
- **Input**: disabled (`disabled` attribute) while `isStreaming === true`; re-enabled on `done` or `error`
- **Metrics**: token count, cost, and duration rendered below the model bubble once complete

## Past Stream Detail (`app/[tenantSlug]/streams/[id]/`)

Renders a completed stream session in the same chat bubble format (read-only). Data fetched from MetaSync via `GET /stream/{id}` through the proxy. No live streaming — the full response is already stored.
