# Frontend Architecture

MetaSync UI is a **Next.js 14 App Router** single-page application written in TypeScript. All backend interaction goes through Supabase (direct Postgres reads via RLS, or Supabase Edge Functions for MetaSync proxy calls).

## Supabase Client

```ts
// lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

`@supabase/ssr` automatically attaches the active session JWT to every request. No unauthenticated queries reach the database — the `deny_anon` RLS policy blocks them regardless.

See [authentication.md](./authentication.md) for session lifecycle and JWT claims.

## Route Structure

```
app/
├── (auth)/
│   ├── login/               # Sign in (email/password + Google OAuth)
│   └── invite/accept/       # OTP verification + complete-signup call
├── owner/
│   └── tenants/             # Tenant list, detail, admin management
│       └── [id]/
└── [tenantSlug]/
    ├── dashboard/           # Summary counts (jobs, workers, streams, runs)
    ├── config/              # MetaSync backend URL + admin API key
    ├── clients/             # Client CRUD + API key display
    │   └── [id]/
    ├── models/              # LLM model configuration
    ├── users/               # Tenant user list + client assignment
    ├── prompts/             # Prompt CRUD + editor
    │   └── [id]/
    ├── prompt-flows/        # Flow CRUD + drag-and-drop builder
    │   └── [id]/
    ├── jobs/                # Job list, detail, status management
    │   └── [id]/
    ├── workers/             # Worker CRUD + start/stop controls
    ├── streams/
    │   ├── new/             # Chat interface (SSE streaming — see streaming.md)
    │   └── [id]/            # Past stream detail (read-only, chat bubble format)
    └── runs/                # Run CRUD + progress visualisation
        └── [id]/
```

## Middleware (Route Guards)

`middleware.ts` runs on every request and enforces:

| Route | Requirement |
|---|---|
| Any route except `(auth)/*` | Active session; redirect to `/login` if missing |
| `/owner/*` | `app_metadata.user_role === 'owner'` |
| `/[tenantSlug]/*` | `app_metadata.tenant_id` resolves to the tenant slug |
| Tenant user on operation routes (jobs, workers, streams, etc.) | `app_metadata.client_id !== null`; show "no client assigned" screen if null |

## Key Hooks

### `useSession()`

Wraps `supabase.auth.getSession()` with a realtime listener on auth state changes. Exposes `user`, `session`, and the parsed `claims` (`app_metadata`).

```ts
const { user, claims } = useSession()
// claims.user_role, claims.tenant_id, claims.client_id
```

### `useTenant()`

Resolves the current tenant from the URL slug and the user's JWT. Provides tenant metadata (name, backend_url, config status).

```ts
const { tenant, isLoading } = useTenant()
```

### `useMetaSyncProxy(path, options)`

TanStack Query wrapper that calls the `proxy` edge function. Handles the `Authorization` header automatically.

```ts
const { data, isLoading, error } = useMetaSyncProxy('/jobs', {
  method: 'GET',
  queryParams: { status: 'PENDING', limit: 100 },
})
```

Mutations (POST/PATCH/DELETE) use a `useMetaSyncMutation` companion hook that calls `proxy` and invalidates the relevant TanStack Query cache keys on success.

### `useStreamProxy(params)`

Fetch-based SSE hook for the chat interface. See [streaming.md](./streaming.md).

## `<RoleGuard role={...}>`

Renders children only when the current user's `user_role` matches. Shows a fallback (or nothing) otherwise. Used to hide navigation items and page sections that are role-restricted.

```tsx
<RoleGuard role="tenant_admin">
  <ConfigPage />
</RoleGuard>
```

Accepts a single role string or an array for multi-role gates.

## UI Components

Built on **shadcn/ui** (Radix UI primitives) + **Tailwind CSS**. Component source lives in `components/ui/`. Custom domain components (e.g. `JobStatusBadge`, `WorkerControls`, `ChatBubble`) live in `components/`.

Responsive breakpoints: desktop (1280px+), tablet (768px+). Mobile is not a supported target.

## State Management

- **Server state**: TanStack Query — all MetaSync API data; Supabase Postgres reads
- **Local UI state**: React `useState` / `useReducer` — form state, modals, selection
- **No global client state store** (Redux / Zustand) — not needed given the above split

## Generated Types

Supabase DB types are auto-generated and committed to `src/types/supabase.ts`:

```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

Regenerate after every migration that changes the public schema.
