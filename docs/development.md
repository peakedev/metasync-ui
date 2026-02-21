# Development Guide

## Prerequisites

- **Node.js** 20+ and npm
- **Supabase CLI** (`npm install -g supabase`)
- **Docker** (required by the Supabase local stack)

## Environment Variables

Create a `.env.local` file at the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start output>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For the remote Supabase project, replace these values with the Project URL and anon key from the Supabase dashboard (Project Settings -> API).

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key | Yes |
| `NEXT_PUBLIC_APP_URL` | This app's base URL (used in invitation redirect links) | Yes |

## Running Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start the local Supabase stack

```bash
npx supabase start
```

This starts Auth, Postgres, Vault, Edge Functions, and Supabase Studio locally. The anon key is printed in the output -- copy it into `.env.local`.

### 3. Apply migrations and seed data

```bash
npx supabase db reset
```

This drops and re-applies all migrations from `supabase/migrations/`.

### 4. Start the Next.js dev server

```bash
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000). Supabase Studio runs at [http://localhost:54323](http://localhost:54323).

### 5. Serve edge functions (optional, for hot-reload)

```bash
npx supabase functions serve
```

Functions are available at `http://localhost:54321/functions/v1/<name>`.

## Available Scripts

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `next dev` | Start Next.js dev server (http://localhost:3000) |
| `npm run build` | `next build` | Production build |
| `npm run start` | `next start` | Start production server |
| `npm run lint` | `eslint` | Run ESLint |
| `npm run type-check` | `tsc --noEmit` | TypeScript type checking |
| `npm run test` | `vitest` | Run Vitest unit tests (components, hooks) |
| `npm run test:e2e` | `playwright test` | Run Playwright E2E tests (requires local Supabase) |

## Supabase CLI Commands

| Command | Description |
|---|---|
| `npx supabase start` | Start local Supabase stack |
| `npx supabase stop` | Stop local stack |
| `npx supabase db reset` | Drop and re-apply all migrations + seed |
| `npx supabase db push` | Push local migrations to remote project |
| `npx supabase migration new <name>` | Create a new migration file |
| `npx supabase gen types typescript --local > src/types/supabase.ts` | Regenerate DB types |
| `npx supabase functions serve` | Serve edge functions locally (hot-reload) |
| `npx supabase functions deploy` | Deploy all edge functions to remote project |
| `npx supabase secrets set KEY=value` | Set edge function secret (remote) |

## Testing

### Unit tests (Vitest)

```bash
npm run test
```

Tests for components and hooks using Vitest with React Testing Library and jsdom.

### End-to-end tests (Playwright)

```bash
npm run test:e2e
```

Requires the local Supabase stack to be running. Tests the full application flow including authentication, navigation, and MetaSync proxy interactions.

### Database tests (pgTAP)

```bash
npx pg_prove -r tests/db/
```

Tests RLS policies and the Custom Access Token Hook directly against the Postgres database.

## Building for Production

```bash
npm run build
```

This produces a production-optimized Next.js build. Before building, ensure:

1. All environment variables are set (they are embedded at build time for `NEXT_PUBLIC_*` variables).
2. TypeScript compiles without errors: `npm run type-check`.
3. ESLint passes: `npm run lint`.

## Regenerating Database Types

After every migration that changes the public schema, regenerate the TypeScript types:

```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

This keeps the `Tables<"...">` type helper in sync with the actual database schema.

## Project Structure

```
/
├── src/
│   ├── app/                         # Next.js App Router
│   │   ├── (auth)/                  # Login, invite accept pages
│   │   │   ├── login/
│   │   │   └── invite/
│   │   ├── auth/                    # OAuth callback route
│   │   ├── owner/                   # Owner-only pages
│   │   │   └── tenants/
│   │   └── [tenantSlug]/            # Tenant-scoped pages
│   │       ├── dashboard/
│   │       ├── config/
│   │       ├── clients/
│   │       ├── models/
│   │       ├── prompts/
│   │       ├── prompt-flows/
│   │       ├── jobs/
│   │       ├── workers/
│   │       ├── streams/
│   │       ├── runs/
│   │       └── users/
│   ├── components/                  # Shared UI components
│   │   ├── app-shell.tsx            # Sidebar + header layout
│   │   ├── role-guard.tsx           # Role-based conditional rendering
│   │   ├── metasync-error.tsx       # MetaSync error display
│   │   └── ui/                      # shadcn/ui components
│   ├── hooks/                       # Custom React hooks
│   │   ├── use-session.ts           # Auth session + claims
│   │   ├── use-tenant.ts            # Tenant resolution from slug
│   │   ├── use-metasync-proxy.ts    # TanStack Query wrapper for proxy
│   │   ├── use-metasync-mutation.ts # Mutation wrapper for proxy
│   │   └── use-stream-proxy.ts      # SSE streaming hook
│   ├── lib/
│   │   └── supabase.ts              # Supabase browser client
│   └── types/
│       └── supabase.ts              # Auto-generated DB types
├── supabase/
│   ├── functions/                   # Edge Functions (Deno/TypeScript)
│   │   ├── _shared/                 # Shared utilities (CORS config)
│   │   ├── proxy/                   # MetaSync REST proxy
│   │   ├── stream-proxy/            # MetaSync SSE proxy
│   │   ├── invite/                  # Invitation creation
│   │   ├── complete-signup/         # Invitation acceptance
│   │   └── store-secret/            # Vault secret storage
│   └── migrations/                  # Postgres migrations
├── tests/
│   ├── db/                          # pgTAP database tests
│   └── e2e/                         # Playwright E2E tests
├── docs/                            # Living technical documentation
├── specs/                           # Spec-driven development documents
│   └── baseline/
│       ├── requirements.md
│       └── design.md
└── package.json
```
