# MetaSync UI

A multi-tenant web app providing a complete management interface for [MetaSync](https://github.com/peakedev/metasync), an (a)synchronous LLM processing pipeline. Built on Next.js with Supabase as the sole backend.

MetaSync UI supports three user roles (Owner, Tenant Admin, Tenant User) with full tenant isolation via Row Level Security, secure credential management through Supabase Vault, and real-time SSE streaming for interactive LLM chat sessions.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the local Supabase stack (requires Docker)
npx supabase start

# 3. Create .env.local (see Environment Variables below)

# 4. Apply migrations
npx supabase db reset

# 5. Start the dev server
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000). Supabase Studio runs at [http://localhost:54323](http://localhost:54323).

## Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)
- Docker (required by Supabase local stack)

## Environment Variables

Create a `.env.local` file at the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start output>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For the remote Supabase "Metasync UI" project, replace these values with the Project URL and anon key from the [Supabase dashboard](https://supabase.com/dashboard) (Project Settings -> API).

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key | Yes |
| `NEXT_PUBLIC_APP_URL` | This app's base URL (used in invitation redirect links) | Yes |

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Next.js dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript type checking (`tsc --noEmit`) |
| `npm run test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests (requires local Supabase) |

## Project Structure

```
/
├── src/
│   ├── app/                         # Next.js App Router
│   │   ├── (auth)/                  # Login, invite accept pages
│   │   ├── owner/                   # Owner-only pages (tenant management)
│   │   └── [tenantSlug]/            # Tenant-scoped pages
│   ├── components/                  # Shared UI components (shadcn/ui)
│   ├── hooks/                       # Custom React hooks
│   ├── lib/                         # Supabase browser client
│   └── types/                       # Auto-generated Supabase types
├── supabase/
│   ├── functions/                   # Edge Functions (Deno/TypeScript)
│   └── migrations/                  # Postgres migrations
├── tests/
│   ├── db/                          # pgTAP database tests (RLS, token hook)
│   └── e2e/                         # Playwright E2E tests
├── docs/                            # Living documentation (see docs/index.md)
└── specs/                           # Spec-driven development documents
```

## Documentation

Detailed technical documentation is available in [`./docs/`](./docs/index.md):

- [Architecture](./docs/architecture.md) -- System architecture, tech stack, and data flow
- [Authentication & Authorization](./docs/auth.md) -- Auth flows, roles, RLS, custom token hook
- [Edge Functions](./docs/edge-functions.md) -- Proxy, stream-proxy, invite, complete-signup
- [Frontend Features](./docs/features.md) -- Page-by-page feature summary
- [Development Guide](./docs/development.md) -- Setup, running, testing, and deployment

## Feature List

See [`./specs/baseline/requirements.md`](./specs/baseline/requirements.md) for the full feature specification.

## Architecture

See [`./specs/baseline/design.md`](./specs/baseline/design.md) for the full architecture and design document.
