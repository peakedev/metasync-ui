# MetaSync UI — Baseline Design

## 1. Overview

MetaSync UI is a multi-tenant SPA that provides a management interface for MetaSync LLM processing pipeline backends. The **Supabase "Metasync UI" project** is the sole backend: Auth, Postgres (with RLS), Vault, and Edge Functions.

Core principle: the browser never receives MetaSync credentials. All calls to tenant-specific MetaSync backends are proxied through Supabase Edge Functions, which retrieve API keys from Vault and forward requests server-side.

Three roles determine feature access and credential scope:

| Role | Credential used | Scope |
|---|---|---|
| Owner | Tenant admin API key (via Vault) | All tenants |
| Tenant Admin | Tenant admin API key (via Vault) | Own tenant |
| Tenant User | Client API key (via Vault) | Own client; blocked if unassigned |

---

## 2. Architecture

> Diagram: [`docs/diagrams/system-architecture.drawio`](../../docs/diagrams/system-architecture.drawio)

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) · TypeScript |
| UI | shadcn/ui · Tailwind CSS |
| Server state | TanStack Query |
| Auth | Supabase Auth (email/password · Google OAuth) |
| Database | Supabase Postgres + RLS |
| Secret storage | Supabase Vault |
| BFF / Proxy | Supabase Edge Functions (Deno/TypeScript) |
| Streaming | SSE via Edge Functions |
| Hosting | Vercel (frontend) · Supabase (all backend) |

### Deployment topology

```
Browser (Vercel)
  ↕ HTTPS
Supabase "Metasync UI" Project
  ├─ Auth        (session management, JWT issuance, invitations)
  ├─ Postgres    (tenant data, memberships, clients, invitations)
  ├─ Vault       (admin API keys, client API keys — encrypted)
  └─ Edge Fns    (proxy, stream-proxy, invite, complete-signup)
        ↕ HTTPS (with api_key header from Vault)
MetaSync Backends (one per tenant, external)
```

### Frontend Environment Variables

The Next.js application requires these environment variables at build and runtime:

| Variable | Value source | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project dashboard → API Settings → Project URL | Supabase project endpoint; used by `@supabase/supabase-js` to route all Auth, DB, and Edge Function calls |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project dashboard → API Settings → anon public key | Public key that identifies the project; safe to expose in the browser. Authorization is enforced by the user JWT + RLS, not this key |
| `NEXT_PUBLIC_APP_URL` | Deployment URL (e.g. `https://metasync-ui.vercel.app`) | Base URL used when constructing invitation `redirectTo` links |

The Supabase client is initialised once at app startup:
```ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```
`@supabase/ssr` automatically attaches the active user session JWT to every request (Postgres queries and Edge Function calls). The anon key alone never provides access to application data — all tables require the `authenticated` role via RLS.

---

## 3. Components and Interfaces

### 3.1 Frontend Route Structure

```
app/
├── (auth)/
│   ├── login/               # FR-AUTH-1: email/password + Google
│   └── invite/accept/       # FR-AUTH-2: verify OTP, complete signup
├── owner/
│   └── tenants/             # FR-TENANT-1,2,3
│       └── [id]/
└── [tenantSlug]/
    ├── dashboard/           # FR-DASH-1,2
    ├── config/              # FR-CONFIG-1,2
    ├── clients/             # FR-CLIENT-1,2,3,4
    │   └── [id]/
    ├── models/              # FR-MODEL-1
    ├── users/               # FR-USER-1
    ├── prompts/             # FR-PROMPT-1,2
    │   └── [id]/
    ├── prompt-flows/        # FR-FLOW-1,2
    │   └── [id]/
    ├── jobs/                # FR-JOB-1,2,3,4
    │   └── [id]/
    ├── workers/             # FR-WORKER-1,2,3
    ├── streams/             # FR-STREAM-1
    │   ├── new/             # FR-STREAM-3: chat interface
    │   └── [id]/            # FR-STREAM-2: chat detail (read-only)
    └── runs/                # FR-RUN-1,2,3
        └── [id]/
```

**Route guard rules (middleware):**

| Route prefix | Required JWT claim |
|---|---|
| `/owner/*` | `app_metadata.user_role === 'owner'` |
| `/[tenantSlug]/*` | `app_metadata.tenant_id` matches slug |
| `/[tenantSlug]/jobs\|workers\|streams\|runs\|prompts\|prompt-flows/*` (tenant_user) | `app_metadata.client_id !== null` |

### 3.2 Edge Functions

| Function | Path | Method | Purpose |
|---|---|---|---|
| `proxy` | `/functions/v1/proxy` | ANY | Routes `{ tenantId, path, method, body }` to the tenant MetaSync backend using the correct Vault credential |
| `stream-proxy` | `/functions/v1/stream-proxy` | GET | SSE-specific proxy; pipes MetaSync SSE stream to browser |
| `invite` | `/functions/v1/invite` | POST | Creates `invitations` record; calls `supabase.auth.admin.inviteUserByEmail` |
| `complete-signup` | `/functions/v1/complete-signup` | POST | Reads invitation record; inserts `tenant_memberships` row; marks invitation accepted |

All functions validate the caller's JWT via `supabase.auth.getUser(token)` before any action.

### 3.3 Supabase Auth Configuration

- **Providers**: Email/Password, Google OAuth
- **Custom Access Token Hook**: PL/pgSQL function that queries `tenant_memberships` on token issuance and injects `user_role`, `tenant_id`, `client_id` into `app_metadata`
- **Redirect URLs allowlist**: `{APP_URL}/**`
- **Custom invite email template**: includes tenant name; redirects to `{APP_URL}/invite/accept`

### 3.4 Frontend Abstractions

| Hook / Component | Purpose |
|---|---|
| `useSession()` | Wraps Supabase session; exposes `user` and JWT `app_metadata` claims |
| `useTenant()` | Resolves current tenant from URL slug + JWT; provides tenant metadata |
| `useMetaSyncProxy(path, options)` | TanStack Query wrapper; POSTs to `proxy` edge function with Bearer JWT |
| `useStreamProxy(params)` | Fetch-based SSE hook; yields token chunks; manages streaming state |
| `<RoleGuard role={...}>` | Renders children only for matching roles; shows fallback otherwise |

---

## 4. Data Models

> Diagram: [`docs/diagrams/database-schema.drawio`](../../docs/diagrams/database-schema.drawio)

### 4.1 Postgres Schema

#### `tenants`
```sql
CREATE TABLE tenants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,
  backend_url text,                          -- MetaSync base URL; nullable until configured
  is_deleted  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenants_slug ON tenants(slug);
```

#### `tenant_memberships`
```sql
CREATE TABLE tenant_memberships (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('tenant_admin', 'tenant_user')),
  client_id  uuid        REFERENCES clients(id) ON DELETE SET NULL, -- nullable: unassigned state
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX idx_memberships_tenant_id ON tenant_memberships(tenant_id);
CREATE INDEX idx_memberships_user_id   ON tenant_memberships(user_id);
```

#### `clients`
```sql
CREATE TABLE clients (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metasync_client_id  text        NOT NULL,  -- client ID in MetaSync backend
  name                text        NOT NULL,
  enabled             boolean     NOT NULL DEFAULT true,
  vault_secret_id     uuid,                  -- vault.secrets.id for client API key
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_tenant_id ON clients(tenant_id);
```

#### `invitations`
```sql
CREATE TABLE invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('tenant_admin', 'tenant_user')),
  client_id   uuid        REFERENCES clients(id) ON DELETE SET NULL, -- nullable
  invited_by  uuid        NOT NULL REFERENCES auth.users(id),
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invitations_tenant_id ON invitations(tenant_id);
CREATE INDEX idx_invitations_email     ON invitations(email);
```

### 4.2 Vault Secret Naming

| Secret name | Contents |
|---|---|
| `tenant_{tenant_id}_admin_key` | MetaSync admin API key for the tenant |
| `client_{client_id}_api_key` | MetaSync client API key |

Operations (Edge Functions only, via service role key):
```sql
-- Store
SELECT vault.create_secret(key_value, 'tenant_{id}_admin_key', 'MetaSync admin key');

-- Update (on rotation)
SELECT vault.update_secret(existing_vault_secret_id, new_key_value);

-- Read (proxy edge function)
SELECT secret FROM vault.decrypted_secrets WHERE name = 'tenant_{id}_admin_key';
```

### 4.3 JWT Custom Claims

The Custom Access Token Hook injects into `app_metadata` (server-set; not user-modifiable):

```json
{
  "sub": "<user-uuid>",
  "email": "user@example.com",
  "role": "authenticated",
  "app_metadata": {
    "user_role": "owner | tenant_admin | tenant_user",
    "tenant_id": "<tenant-uuid> | null",
    "client_id": "<client-uuid> | null"
  }
}
```

Owner accounts: `user_role = 'owner'` set via admin API on `raw_app_meta_data` at account creation. `tenant_id` and `client_id` are null for owner.

### 4.4 Custom Access Token Hook (PL/pgSQL)

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claims     jsonb;
  v_user_id    uuid;
  v_membership record;
BEGIN
  v_claims  := event -> 'claims';
  v_user_id := (event ->> 'user_id')::uuid;

  -- Owner: claims already set in app_metadata via admin API; pass through
  IF (v_claims -> 'app_metadata' ->> 'user_role') = 'owner' THEN
    RETURN event;
  END IF;

  SELECT role, tenant_id, client_id
    INTO v_membership
    FROM tenant_memberships
   WHERE user_id = v_user_id
   LIMIT 1;

  IF FOUND THEN
    v_claims := jsonb_set(v_claims, '{app_metadata,user_role}', to_jsonb(v_membership.role));
    v_claims := jsonb_set(v_claims, '{app_metadata,tenant_id}', to_jsonb(v_membership.tenant_id));
    v_claims := jsonb_set(v_claims, '{app_metadata,client_id}', to_jsonb(v_membership.client_id));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;
```

### 4.5 RLS Policies

**Principle: no anon access.** Every application table requires the `authenticated` role. The anon role is explicitly denied. The Supabase client always carries the user's session JWT (see §2 Frontend Environment Variables); unauthenticated queries are rejected by RLS before reaching any row.

Template applied to all tenant-scoped tables:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

-- Block all anon (unauthenticated) access explicitly
CREATE POLICY deny_anon ON <table>
  FOR ALL
  TO anon
  USING (false);

-- Authenticated users: tenant isolation (owner bypasses)
CREATE POLICY tenant_isolation ON <table>
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
  );
```

All Edge Function calls also carry `Authorization: Bearer <JWT>` in the request header. Functions call `supabase.auth.getUser(token)` as the first step and return 401 immediately if the token is absent or invalid.

`vault.decrypted_secrets` is accessible only via the service role key. The frontend client never queries Vault directly.

---

## 5. Key Flows

> Diagrams:
> - [`docs/diagrams/auth-flow.drawio`](../../docs/diagrams/auth-flow.drawio)
> - [`docs/diagrams/proxy-flow.drawio`](../../docs/diagrams/proxy-flow.drawio)
> - [`docs/diagrams/invitation-flow.drawio`](../../docs/diagrams/invitation-flow.drawio)

### 5.1 Authentication & JWT Claims

```
User submits credentials
  → Supabase Auth validates (email/password or Google OAuth)
  → Custom Access Token Hook fires
      → Queries tenant_memberships WHERE user_id = auth.uid()
      → Injects user_role, tenant_id, client_id into app_metadata
  → JWT issued; stored by supabase-js (localStorage or cookie)
  → All Postgres reads use JWT claims via RLS (auth.jwt() -> 'app_metadata')
  → supabase-js auto-refreshes token before expiry; hook re-runs on refresh
```

### 5.2 Invitation Flow

```
Admin → POST /functions/v1/invite
  Body: { email, role, client_id? }
  → Validate JWT: caller must be tenant_admin (own tenant) or owner
  → INSERT INTO invitations (tenant_id, email, role, client_id, invited_by)
  → supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: '{APP_URL}/invite/accept',
      data: { invitation_id: '<uuid>' }         -- stored in user_metadata
    })
  → Supabase sends invite email

User clicks email link → /invite/accept?token=<otp>
  → supabase.auth.verifyOtp({ email, token, type: 'invite' })
  → User authenticated; JWT issued (no custom claims yet: no membership row)
  → App calls POST /functions/v1/complete-signup
      → Read invitation_id from user.user_metadata
      → SELECT * FROM invitations WHERE id = invitation_id
          AND status = 'pending' AND expires_at > now()
      → INSERT INTO tenant_memberships (tenant_id, user_id, role, client_id)
      → UPDATE invitations SET status = 'accepted'
  → supabase.auth.refreshSession()
      → Custom Token Hook re-runs → claims populated
  → Redirect to /[tenantSlug]/dashboard
```

### 5.3 MetaSync Proxy

```
Browser → POST /functions/v1/proxy
  Headers: Authorization: Bearer <JWT>
  Body: { tenantId, path, method, body? }

Edge Function:
  1. supabase.auth.getUser(token)          → validate JWT; get user + claims
  2. Assert: claims.tenant_id === tenantId  (owner skips)
  3. Determine secret name:
       tenant_admin / owner → 'tenant_{tenantId}_admin_key'
       tenant_user          → 'client_{client_id}_api_key'
  4. SELECT backend_url FROM tenants WHERE id = tenantId
  5. SELECT secret FROM vault.decrypted_secrets WHERE name = <secret_name>
  6. fetch(backend_url + path, { method, body, headers: { api_key: secret } })
  7. Return MetaSync response (status + body) verbatim to browser
```

### 5.4 SSE Streaming (Chat Interface)

```
Browser → GET /functions/v1/stream-proxy
  Params: tenantId, model, temperature, userPrompt, additionalPrompts
  Headers: Authorization: Bearer <JWT>

Edge Function:
  1. Validate JWT
  2. Retrieve client API key from Vault (tenant_user) or admin key (tenant_admin/owner)
  3. POST {backend_url}/stream → MetaSync backend
     Headers: api_key: <secret>; Accept: text/event-stream
  4. Return new Response(metasyncStream, {
       headers: { 'Content-Type': 'text/event-stream' }
     })                                    -- pipe raw SSE chunks

Browser (useStreamProxy hook):
  - fetch() with ReadableStream reader
  - Each chunk → append text to model response bubble (character streaming)
  - [DONE] event → mark complete; render metrics; re-enable input
  - error event → render inline error bubble; re-enable input
```

---

## 6. Error Handling

| Scenario | Edge Function response | UI behaviour |
|---|---|---|
| Invalid / expired JWT | 401 | supabase-js auto-refreshes; on failure → redirect `/login` |
| User has no membership | 403 `no_membership` | "Awaiting tenant assignment" screen |
| Tenant user, no client assigned | 403 `no_client` | "No client assigned" placeholder; MetaSync nav hidden |
| Tenant disabled (`is_deleted`) | 403 `tenant_disabled` | "Tenant disabled" screen |
| MetaSync backend unreachable | 503 `backend_unreachable` | Error banner; retry button |
| MetaSync API error (4xx/5xx) | Forward status + body unchanged | Inline error: status code + message |
| Vault secret not found | 503 `credentials_not_configured` | Prompt to configure API key on config page |
| Invitation expired | 410 from `complete-signup` | Expiry message; "Ask admin to re-invite" |
| SSE stream error | SSE `event: error` chunk | Inline error bubble in chat; input re-enabled |
| Cross-tenant proxy attempt | 403 `tenant_mismatch` | Generic error; logged server-side |

---

## 7. Testing Strategy

| Layer | Tool | What to test |
|---|---|---|
| RLS policies | pgTAP | Tenant isolation: user sees only own rows; owner sees all; cross-tenant read blocked |
| Custom Token Hook | pgTAP | Correct claims injected from memberships; owner passthrough; missing membership returns empty claims |
| Edge Functions | Deno.test | JWT validation, Vault retrieval (mocked), proxy path routing, 401/403 error paths, SSE pipe |
| Frontend components | Vitest + React Testing Library | Role-based rendering (`RoleGuard`), chat bubble display, streaming state machine, form validation |
| Auth flows | Supabase local dev + Playwright | Login, Google OAuth callback, invite accept, password reset |
| Proxy E2E | Playwright + Supabase local + mock MetaSync | Full chain: JWT → Vault → MetaSync; assert api_key never in browser network tab |
| SSE streaming E2E | Playwright | Characters appear incrementally; input disabled during stream; error bubble on failure |

---

## 8. Performance Considerations

| Concern | Approach |
|---|---|
| Edge Function cold start | Minimal imports (`@supabase/supabase-js` only); Supabase connection pooler (transaction mode) |
| Vault lookup per request | Single `SELECT` per edge function invocation; Deno isolates are per-request so no stale cache risk |
| RLS query cost | All `tenant_id` columns indexed; claims in JWT avoid subqueries in policies |
| MetaSync list pagination | Pass `limit`/`skip` from query params through proxy; TanStack Query for client-side cache + deduplication |
| Dashboard summaries | Use MetaSync `/summary` endpoints (server-side aggregation); no client-side counting |
| SSE first token latency | Edge function pipes raw chunks without buffering; target < 200ms (NFR-PERF-2) |
| Invitation lookup | Index on `invitations.email` and `invitations.tenant_id` |

---

## 9. Security Considerations

| Concern | Approach |
|---|---|
| API key exposure | Keys only in Vault; accessed via service role key in Edge Functions; never returned to browser |
| Tenant data leakage | RLS on all tables; verified with pgTAP cross-tenant assertions |
| JWT claims tampering | Custom claims in `app_metadata` (injected server-side by hook); users cannot modify `app_metadata` via client SDK |
| Invitation metadata abuse | `invitation_id` in `user_metadata` is used only as a DB lookup key; role/tenant not trusted from metadata |
| Cross-tenant proxy calls | Edge function asserts `JWT.tenant_id === requested tenantId`; owner is the only bypass |
| Vault access from browser | Frontend uses anon key (RLS-enforced); Vault queries require service role key (Edge Functions only) |
| Invitation expiry bypass | `complete-signup` checks `expires_at > now()` server-side before inserting membership |
| CSRF | Supabase sessions use `HttpOnly` cookies + PKCE for OAuth; Edge Functions validate `Authorization: Bearer` header |
| Unauthenticated DB access | `deny_anon` RLS policy blocks all anon-role queries on every table; `@supabase/ssr` client always attaches session JWT; no code path reaches Supabase without an active user session |

---

## 10. Documentation

The repository must be fully documented as the codebase grows. Documentation lives in `./docs/` alongside the code and must be updated as part of every task that adds or modifies a feature — not as an afterthought.

### `./docs/index.md`

Single entry point. Must list every documentation file with a one-line description. Always update this file when adding a new doc.

### Domain files (one per area)

| File | Covers |
|---|---|
| `./docs/authentication.md` | Supabase Auth setup, Custom Access Token Hook, JWT claims shape, session lifecycle |
| `./docs/tenant-management.md` | Tenant CRUD, memberships, invitation flow end-to-end |
| `./docs/edge-functions.md` | Each edge function: purpose, request/response shape, auth contract, error codes |
| `./docs/database.md` | Schema reference (all tables, columns, indexes), RLS policies, migration conventions |
| `./docs/vault.md` | Vault secret naming convention, how to read/write/rotate secrets |
| `./docs/frontend-architecture.md` | Route structure, key hooks (`useSession`, `useTenant`, `useMetaSyncProxy`, `useStreamProxy`), `RoleGuard` usage |
| `./docs/streaming.md` | SSE chat interface: how `stream-proxy` works, `useStreamProxy` API, error handling |

### `./docs/diagrams/`

draw.io source files for all architecture and flow diagrams (already seeded — see §2). Update diagrams when the architecture they depict changes.

### `README.md`

Must remain generic and always accurate. Required sections:
- Project title and description
- Local setup: prerequisites, `npm install`, env vars (all three `NEXT_PUBLIC_*` variables), `supabase start`, `npm run dev`
- Project structure overview (top-level directories)
- Link to `./specs/baseline/requirements.md` for the full feature list

---

## 11. Monitoring and Observability

| Signal | Source | What to capture |
|---|---|---|
| Auth events | Supabase Auth logs | Login, logout, failed attempts, invite sent/accepted |
| Edge Function requests | `proxy` / `stream-proxy` logs | `tenant_id`, `path`, HTTP method, response status, duration |
| MetaSync errors | `proxy` edge function | Forwarded status, error body, `tenant_id` |
| Vault lookup failures | `proxy` / `stream-proxy` logs | Secret name (not value), failure reason |
| SSE errors | `stream-proxy` logs | `stream_id`, error type, `tenant_id` |
| Slow proxy calls | `proxy` function | Flag requests with duration > 2000ms |
| Invitation lifecycle | `invite` / `complete-signup` logs | Created, accepted, expired events |
