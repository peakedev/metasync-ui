# Architecture

MetaSync UI is a multi-tenant single-page application that provides a management interface for [MetaSync](https://github.com/peakedev/metasync) LLM pipeline backends. The Supabase "Metasync UI" project is the sole backend -- there is no custom API server.

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) | Routing, SSR/CSR, middleware |
| Language | TypeScript | End-to-end type safety |
| UI library | shadcn/ui (Radix UI primitives) | Accessible component primitives |
| Styling | Tailwind CSS | Utility-first CSS |
| Server state | TanStack Query v5 | Caching, refetching, mutations |
| Auth | Supabase Auth | Email/password, Google OAuth |
| Database | Supabase Postgres + RLS | Tenant data, memberships, invitations |
| Secret storage | Supabase Vault | MetaSync API keys (encrypted at rest) |
| BFF / Proxy | Supabase Edge Functions (Deno) | Forward requests to MetaSync backends |
| Streaming | SSE via Edge Functions | Real-time chat token streaming |

## Layered Architecture

```
Browser (Next.js App)
  |
  |-- Supabase Postgres (direct reads via RLS)
  |     Tenant data, memberships, invitations, clients
  |
  |-- Supabase Edge Functions
  |     |-- proxy          --> MetaSync Backend (REST)
  |     |-- stream-proxy   --> MetaSync Backend (SSE)
  |     |-- invite         --> Supabase Auth (send invite email)
  |     |-- complete-signup --> Supabase Postgres (insert membership)
  |
  |-- Supabase Auth
        Session management, JWT issuance, Custom Access Token Hook
```

All frontend-to-Supabase communication uses the `@supabase/ssr` client, which automatically attaches the user's session JWT to every request. All frontend-to-MetaSync communication is routed through Edge Functions, which retrieve API keys from Vault at runtime.

## Key Design Rules

1. **MetaSync credentials never touch the browser.** All calls to tenant MetaSync backends go through Supabase Edge Functions. The Edge Function retrieves the relevant API key from Supabase Vault using the service role key, then forwards the request to the MetaSync backend with the key in the `api_key` header.

2. **All Supabase calls from the frontend carry a user JWT.** The `deny_anon` RLS policy on every application table blocks all unauthenticated queries. Edge Functions call `supabase.auth.getUser()` as step 1 and return 401 if the token is absent or invalid.

3. **Tenant isolation via RLS.** Every tenant-scoped table has `tenant_id` indexed and a `tenant_isolation` RLS policy that filters rows by `auth.jwt() -> 'app_metadata' ->> 'tenant_id'`. The owner role bypasses this filter.

4. **Custom Access Token Hook.** A PL/pgSQL function runs on every JWT issuance and refresh. It reads `tenant_memberships` and injects `user_role`, `tenant_id`, and `client_id` into `app_metadata`. This eliminates the need for subqueries in RLS policies.

## Database Schema

Four application tables in the `public` schema:

### `tenants`

One row per MetaSync tenant.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `name` | `text` NOT NULL | Display name |
| `slug` | `text` NOT NULL UNIQUE | URL-safe identifier used in `[tenantSlug]` routes |
| `backend_url` | `text` | MetaSync base URL; nullable until configured |
| `is_deleted` | `boolean` NOT NULL DEFAULT `false` | Soft delete flag |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

### `tenant_memberships`

Maps users to tenants with a role and an optional client assignment.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenant_id` | `uuid` NOT NULL FK -> `tenants(id)` CASCADE | |
| `user_id` | `uuid` NOT NULL FK -> `auth.users(id)` CASCADE | |
| `role` | `text` NOT NULL | `'tenant_admin'` or `'tenant_user'` |
| `client_id` | `uuid` FK -> `clients(id)` SET NULL | Nullable; user is unassigned if null |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Unique constraint on `(tenant_id, user_id)`.

### `clients`

MetaSync clients per tenant. Each client has an API key stored in Vault.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenant_id` | `uuid` NOT NULL FK -> `tenants(id)` CASCADE | |
| `metasync_client_id` | `text` NOT NULL | Client ID in the MetaSync backend |
| `name` | `text` NOT NULL | Display name |
| `enabled` | `boolean` NOT NULL DEFAULT `true` | |
| `vault_secret_id` | `uuid` | References `vault.secrets.id`; nullable until key stored |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

### `invitations`

Tracks pending, accepted, and expired invitations.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Also stored in `user_metadata` at invite time |
| `tenant_id` | `uuid` NOT NULL FK -> `tenants(id)` CASCADE | |
| `email` | `text` NOT NULL | |
| `role` | `text` NOT NULL | `'tenant_admin'` or `'tenant_user'` |
| `client_id` | `uuid` FK -> `clients(id)` SET NULL | Optional pre-assignment |
| `invited_by` | `uuid` NOT NULL FK -> `auth.users(id)` | |
| `status` | `text` NOT NULL DEFAULT `'pending'` | `'pending'`, `'accepted'`, `'expired'` |
| `expires_at` | `timestamptz` NOT NULL DEFAULT `now() + interval '7 days'` | |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

## Vault Secret Naming

API keys are stored in Supabase Vault (encrypted at rest via AEAD/libsodium). Naming convention:

| Secret name pattern | Contents |
|---|---|
| `tenant_{tenant_id}_admin_key` | MetaSync admin API key for the tenant |
| `client_{client_id}_api_key` | MetaSync client API key |

Vault is accessed exclusively by Edge Functions using the Supabase service role key. The browser client never queries Vault directly.

## Migrations

All database migrations live in `supabase/migrations/` as timestamped `.sql` files:

| Migration | Purpose |
|---|---|
| `20240101000001_create_tenants.sql` | `tenants` table |
| `20240101000002_create_clients.sql` | `clients` table |
| `20240101000003_create_tenant_memberships.sql` | `tenant_memberships` table |
| `20240101000004_create_invitations.sql` | `invitations` table |
| `20240101000005_enable_rls_policies.sql` | RLS policies on all tables |
| `20240101000006_custom_access_token_hook.sql` | Custom Access Token Hook function |

Convention: one migration per logical change. Never edit an existing migration; always create a new one.
