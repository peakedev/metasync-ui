# MetaSync UI

A multi-tenant web application providing a complete management interface for [MetaSync](https://github.com/peakedev/metasync), an (a)synchronous LLM processing pipeline. Built on Next.js with Supabase as the sole backend.

## Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)
- Docker (required by Supabase local stack)

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file at the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start output>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For the remote Supabase "Metasync UI" project, replace these values with the Project URL and anon key from the [Supabase dashboard](https://supabase.com/dashboard) → Project Settings → API.

### 3. Start the local Supabase stack

```bash
npx supabase start
```

This starts Auth, Postgres, Vault, Edge Functions, and Supabase Studio locally. The anon key is printed in the output.

### 4. Apply migrations

```bash
npx supabase db reset
```

### 5. Start the app

```bash
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000). Supabase Studio runs at [http://localhost:54323](http://localhost:54323).

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key | Yes |
| `NEXT_PUBLIC_APP_URL` | This app's base URL (used in invitation redirect links) | Yes |

## Project Structure

```
/
├── app/                    # Next.js App Router pages
│   ├── (auth)/             # Login, invite accept
│   ├── owner/              # Owner-only pages (tenant management)
│   └── [tenantSlug]/       # Tenant-scoped pages
├── components/             # Shared UI components (shadcn/ui)
├── hooks/                  # Custom React hooks
├── lib/
│   └── supabase.ts         # Supabase browser client
├── supabase/
│   ├── functions/          # Edge Functions (Deno/TypeScript)
│   └── migrations/         # Postgres migrations
├── tests/
│   ├── db/                 # pgTAP database tests (RLS, token hook)
│   └── e2e/                # Playwright E2E tests
├── docs/                   # Living documentation (see docs/index.md)
├── specs/                  # Spec-driven development documents
└── src/types/supabase.ts   # Auto-generated Supabase types
```

## Feature List

See [`./specs/baseline/requirements.md`](./specs/baseline/requirements.md) for the full feature list.

## Architecture

See [`./specs/baseline/design.md`](./specs/baseline/design.md) for the full architecture and design document, and [`./docs/`](./docs/) for living technical documentation.
