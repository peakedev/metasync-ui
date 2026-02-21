# MetaSync UI — Baseline Implementation Plan

Specs: [`requirements.md`](./requirements.md) · [`design.md`](./design.md)

---

## Phase 1 — Project Scaffolding

**Goal:** Running Next.js app connected to local Supabase. All tooling installed and configured.

**Verification:** `npm run dev` serves the app at `localhost:3000`; `supabase start` brings up local stack; Supabase Studio accessible at `localhost:54323`; `npm run type-check` passes with zero errors.

### Tasks

- [ ] **Scaffold Next.js 14 App Router project**
  ```bash
  npx create-next-app@latest metasync-ui --ts --app --tailwind --eslint
  ```
  Confirm: TypeScript, App Router, Tailwind enabled.

- [ ] **Install Supabase SSR client and init CLI**
  ```bash
  npm install @supabase/supabase-js @supabase/ssr
  supabase init
  ```
  Creates `supabase/config.toml`.

- [ ] **Install shadcn/ui**
  ```bash
  npx shadcn-ui@latest init
  ```
  Select: New York style, CSS variables. Add core components used across the app:
  ```bash
  npx shadcn-ui@latest add button card dialog form input label select table badge separator skeleton toast
  ```

- [ ] **Install TanStack Query**
  ```bash
  npm install @tanstack/react-query @tanstack/react-query-devtools
  ```
  Create `app/providers.tsx` with `QueryClientProvider`; wrap root layout.

- [ ] **Create Supabase browser client**
  `lib/supabase.ts` — `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`.

- [ ] **Create Next.js middleware for session refresh**
  `middleware.ts` — uses `createServerClient` from `@supabase/ssr`; refreshes expired Auth tokens on every request. Matches all routes except `_next/static`, `_next/image`, `favicon.ico`.

- [ ] **Configure environment variables**
  `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`. Add `.env.local` to `.gitignore`. Commit `.env.example` with placeholder values.

- [ ] **Install and configure Playwright**
  ```bash
  npm install -D @playwright/test && npx playwright install
  ```
  `playwright.config.ts`: `testDir: ./tests/e2e`, `baseURL: http://localhost:3000`, `webServer: npm run dev`.

- [ ] **Configure Vitest for unit tests**
  ```bash
  npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
  ```
  `vitest.config.ts` with jsdom environment. Add `npm run test` script.

- [ ] **Add `npm run type-check` script**
  `"type-check": "tsc --noEmit"` in `package.json`.

---

## Phase 2 — Database Schema & RLS

**Goal:** All four tables exist in local Postgres with correct constraints, indexes, RLS policies (deny anon + tenant isolation), and a passing pgTAP test suite.

**Verification:** `supabase test db` passes all pgTAP tests; cross-tenant reads return empty; anon queries are blocked.

### Tasks

- [ ] **Migration: `tenants` table**
  `supabase migration new create_tenants`
  Columns: `id`, `name`, `slug UNIQUE`, `backend_url`, `is_deleted DEFAULT false`, `created_at`. Index on `slug`.

- [ ] **Migration: `clients` table**
  `supabase migration new create_clients`
  Columns: `id`, `tenant_id FK tenants`, `metasync_client_id`, `name`, `enabled DEFAULT true`, `vault_secret_id`, `created_at`. Index on `tenant_id`.

- [ ] **Migration: `tenant_memberships` table**
  `supabase migration new create_tenant_memberships`
  Columns: `id`, `tenant_id FK tenants`, `user_id FK auth.users`, `role CHECK('tenant_admin','tenant_user')`, `client_id FK clients ON DELETE SET NULL` (nullable), `created_at`. UNIQUE `(tenant_id, user_id)`. Indexes on both FKs.

- [ ] **Migration: `invitations` table**
  `supabase migration new create_invitations`
  Columns: `id`, `tenant_id FK tenants`, `email`, `role`, `client_id FK clients` (nullable), `invited_by FK auth.users`, `status CHECK('pending','accepted','expired') DEFAULT 'pending'`, `expires_at DEFAULT now()+7d`, `created_at`. Indexes on `tenant_id`, `email`.

- [ ] **Migration: RLS policies**
  `supabase migration new enable_rls_policies`
  For each table: enable RLS, add `deny_anon` policy (`TO anon USING (false)`), add `tenant_isolation` policy (`TO authenticated USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid OR user_role = 'owner')`).

- [ ] **Migration: Custom Access Token Hook**
  `supabase migration new custom_access_token_hook`
  PL/pgSQL function `public.custom_access_token_hook(event jsonb)` — queries `tenant_memberships`, injects `user_role`, `tenant_id`, `client_id` into `app_metadata`. Register in Supabase Auth settings (local: `config.toml` `[auth.hook.custom_access_token]`).

- [ ] **Generate TypeScript types**
  ```bash
  supabase gen types typescript --local > src/types/supabase.ts
  ```

- [ ] **pgTAP tests: RLS policies**
  `supabase/tests/rls_policies_test.sql`
  - Anon is blocked on all four tables
  - User A cannot read User B's tenant rows (cross-tenant isolation)
  - Owner can read all tenant rows
  - Token hook injects correct claims for a tenant_user
  - Token hook injects `null` client_id for unassigned user
  - Owner passthrough: claims unchanged

---

## Phase 3 — Authentication

**Goal:** Users can sign in (email/password + Google OAuth), sign out, and reset passwords. JWT custom claims are populated. Unauthenticated routes redirect to `/login`.

**Verification:** Sign in with a test account; inspect session JWT (`app_metadata` has `user_role`); visit a protected route unauthenticated → redirected to `/login`.

### Tasks

- [ ] **Login page** (`app/(auth)/login/page.tsx`)
  Email/password form using Supabase `signInWithPassword`. Inline error on invalid credentials. "Sign in with Google" button calls `signInWithOAuth({ provider: 'google' })`.

- [ ] **Google OAuth callback route** (`app/auth/callback/route.ts`)
  Exchanges code for session via `supabase.auth.exchangeCodeForSession(code)`. Redirects to `[tenantSlug]/dashboard` or `/owner/tenants` based on `user_role`. Configure callback URL in Supabase Auth settings: `{APP_URL}/auth/callback`.

- [ ] **Password reset — request page** (`app/(auth)/login/reset/page.tsx`)
  Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_URL/login/update-password })`.

- [ ] **Password reset — update page** (`app/(auth)/login/update-password/page.tsx`)
  Calls `supabase.auth.updateUser({ password })`. Requires active session (OTP auto-signs the user in).

- [ ] **`useSession()` hook** (`hooks/use-session.ts`)
  Wraps `supabase.auth.getSession()` + `onAuthStateChange` listener. Returns `{ user, session, claims }` where `claims = user?.app_metadata`.
  Unit test: returns null when no session; returns populated claims when session present.

- [ ] **Middleware route guards** (extend `middleware.ts`)
  - No session → redirect to `/login` (preserve intended URL in `?redirectTo`)
  - `/owner/*` → `claims.user_role !== 'owner'` → 403 page
  - `/[tenantSlug]/*` → resolve slug → assert `claims.tenant_id` matches
  Unit test: middleware redirects with correct conditions.

- [ ] **Sign-out** — `supabase.auth.signOut()` button in app shell; clears session and redirects to `/login`.

- [ ] **Playwright E2E: auth flows**
  - Sign in with email/password → lands on dashboard
  - Invalid credentials → error shown (no redirect)
  - Unauthenticated visit to protected route → redirected to `/login`
  - Sign out → session cleared → protected route redirects again

---

## Phase 4 — Invitation Flow

**Goal:** Owner/admin can invite users by email. Invited user clicks link, accepts, and lands on their dashboard with correct JWT claims and tenant membership.

**Verification:** Invite a user via the UI; user receives email (check Supabase Inbucket at `localhost:54324`); click link; complete sign-up; verify `tenant_memberships` row created; verify JWT claims populated on next request.

### Tasks

- [ ] **`invite` edge function** (`supabase/functions/invite/index.ts`)
  - Validate JWT (`supabase.auth.getUser`); assert `tenant_admin` or `owner`
  - `INSERT INTO invitations`
  - `supabase.auth.admin.inviteUserByEmail(email, { redirectTo, data: { invitation_id } })`
  - Return 201 or error codes (401, 403, 409)
  Deno unit test: 403 for non-admin caller; 409 if duplicate pending invitation; 201 happy path (mock admin client).

- [ ] **`complete-signup` edge function** (`supabase/functions/complete-signup/index.ts`)
  - Validate JWT
  - Read `invitation_id` from `user.user_metadata`
  - Query `invitations` — assert `status='pending'` and `expires_at > now()`
  - `INSERT INTO tenant_memberships`
  - `UPDATE invitations SET status='accepted'`
  - Return 200 or 410 (expired) / 404 (not found) / 409 (already member)
  Deno unit test: 410 for expired invitation; 200 happy path; membership row created.

- [ ] **`/invite/accept` page** (`app/(auth)/invite/accept/page.tsx`)
  - Reads `token` from URL params
  - Calls `supabase.auth.verifyOtp({ email, token, type: 'invite' })`
  - Calls `POST /functions/v1/complete-signup`
  - Calls `supabase.auth.refreshSession()`
  - Redirects to `[tenantSlug]/dashboard` (tenant from refreshed claims) or shows expiry/error screen

- [ ] **Playwright E2E: invitation flow**
  - Admin POSTs to `invite` function → 201
  - Fetch invite link from Inbucket (`localhost:54324`)
  - Navigate to link → `/invite/accept`
  - Verify redirect to tenant dashboard
  - Verify `tenant_memberships` row in DB

---

## Phase 5 — Owner: Tenant Management

**Goal:** Owner can create, view, edit, and soft-delete tenants. Owner can invite and remove tenant admins.

**Verification:** Sign in as owner; create a tenant with name + slug; edit the name; view config status (no URL/key yet); invite a tenant admin.

### Tasks

- [ ] **`RoleGuard` component** (`components/role-guard.tsx`)
  Accepts `role: string | string[]`. Renders children only if `claims.user_role` matches; renders `fallback` prop otherwise.
  Unit test: renders children for matching role; renders fallback for mismatch.

- [ ] **`useTenant()` hook** (`hooks/use-tenant.ts`)
  Resolves current tenant from URL slug via `supabase.from('tenants').select().eq('slug', slug)`. Returns tenant row + loading/error state. Cached by TanStack Query.
  Unit test: returns `null` for unknown slug; returns tenant for valid slug.

- [ ] **Tenant list page** (`app/owner/tenants/page.tsx`)
  `SELECT * FROM tenants ORDER BY created_at DESC`. Table with name, slug, status (backend_url configured, admin key configured), created date. "New Tenant" button.

- [ ] **Tenant create/edit dialog**
  Form: `name` (required), `slug` (required, auto-generated from name, validated unique). On submit: `INSERT INTO tenants` or `UPDATE tenants SET name`. Slug is immutable after creation.
  Unit test: slug auto-generation from name; slug uniqueness validation error shown.

- [ ] **Tenant soft-delete**
  Confirmation dialog: "Disable tenant?" → `UPDATE tenants SET is_deleted = true`. Disabled tenants shown greyed-out in list with a restore option.

- [ ] **Tenant detail page** (`app/owner/tenants/[id]/page.tsx`)
  - Config status: MetaSync URL (configured / not configured), admin API key (configured / not configured)
  - List of tenant admins (from `tenant_memberships WHERE role='tenant_admin'`)
  - "Invite Tenant Admin" button → calls `invite` edge function with `role='tenant_admin'`
  - "Remove admin" → `DELETE FROM tenant_memberships WHERE user_id=... AND tenant_id=...`

- [ ] **Playwright E2E: owner tenant management**
  - Create tenant → appears in list
  - Edit tenant name → list reflects update
  - Invite tenant admin → invitation record created

---

## Phase 6 — MetaSync Proxy Infrastructure

**Goal:** All MetaSync API calls route through the `proxy` edge function. The api_key is never visible in the browser. `useMetaSyncProxy` and `useMetaSyncMutation` hooks are usable by all feature pages.

**Verification:** Open browser DevTools Network tab; make any MetaSync API call; confirm no `api_key` or MetaSync credential in the request from the browser. Playwright assertion: no network request to the MetaSync backend URL from the browser.

### Tasks

- [ ] **`proxy` edge function** (`supabase/functions/proxy/index.ts`)
  Full implementation per design §5.3:
  - JWT validation
  - Tenant access assertion
  - Credential selection (admin vs client key)
  - `SELECT backend_url FROM tenants`
  - `SELECT secret FROM vault.decrypted_secrets`
  - `fetch(backend_url + path, { api_key })`
  - Return MetaSync response verbatim
  Deno unit test: 401 no JWT; 403 tenant_mismatch; 503 credentials_not_configured; 200 happy path (mock Vault + mock MetaSync).

- [ ] **`useMetaSyncProxy` hook** (`hooks/use-metasync-proxy.ts`)
  TanStack Query wrapper. Accepts `path`, `queryParams`, optional `enabled` flag. Automatically includes `Authorization: Bearer <session.access_token>` and `tenantId` from `useTenant()`. Returns `{ data, isLoading, error }`.
  Unit test: calls proxy with correct headers; surfaces 503 as error state.

- [ ] **`useMetaSyncMutation` hook** (`hooks/use-metasync-mutation.ts`)
  TanStack Mutation wrapper for POST/PATCH/DELETE. Accepts `path`, `method`. On success: invalidates specified TanStack Query cache keys. Returns `{ mutate, isPending, error }`.
  Unit test: invalidates correct cache key on success; surfaces error on failure.

- [ ] **Shared error handling**
  `components/metasync-error.tsx` — renders inline error with MetaSync status code + message. Covers `backend_unreachable` (retry button) and `credentials_not_configured` (link to config page).

- [ ] **Playwright E2E: proxy security**
  Assert no request with the MetaSync `backend_url` domain appears in browser network traffic (all requests go to Supabase functions URL only).

---

## Phase 7 — Tenant Backend Configuration

**Goal:** Tenant admin can set the MetaSync backend URL (with health check) and store the admin API key in Vault.

**Verification:** Set a valid backend URL → status shows "connected". Set an invalid URL → status shows "unreachable". Set admin API key → status shows "configured"; key is not retrievable in plaintext.

### Tasks

- [ ] **Config page** (`app/[tenantSlug]/config/page.tsx`)
  Two sections: Backend URL and Admin API Key. Read current config from `tenants` row.

- [ ] **Backend URL form**
  Input + "Save & Validate" button.
  - Save: `UPDATE tenants SET backend_url = ...`
  - Validate: call `proxy` with `path=/health`; show "connected" or "unreachable" badge.
  Unit test: "connected" rendered on 200 from health; "unreachable" rendered on 503.

- [ ] **Admin API key form**
  Password input (masked) + "Save" button. On submit: calls a dedicated edge function or `proxy` action that stores the key in Vault (`vault.create_secret` or `vault.update_secret`). Key field clears after save; status badge shows "configured" or "not configured".
  Unit test: form clears after successful save; "configured" badge shown; input is `type=password` (masked).

- [ ] **Vault write in proxy/invite functions**
  Extend `proxy` (or create a thin `store-secret` edge function) to accept an `action: 'store_admin_key'` payload, storing the key in Vault using the service role. The frontend never sends the key directly to Postgres.

---

## Phase 8 — Client Management

**Goal:** Tenant admin can create, list, edit, toggle, delete, and rotate API keys for MetaSync clients. Client API keys are stored in Vault. Users can be assigned to clients.

**Verification:** Create a client → API key shown once with copy button → key not shown again. Assign a user → user's `client_id` in DB updated → user's next JWT refresh includes `client_id`.

### Tasks

- [ ] **Client list page** (`app/[tenantSlug]/clients/page.tsx`)
  Calls `GET /clients` via proxy. Table: name, enabled status, key stored (boolean from `vault_secret_id`), creation date. "New Client" button.

- [ ] **Client create flow**
  - Call `POST /clients` via proxy → receives `{ id, api_key }` from MetaSync
  - Store `api_key` in Vault → get `vault_secret_id`
  - `INSERT INTO clients (tenant_id, metasync_client_id, name, vault_secret_id)`
  - Display `api_key` once in a modal with copy-to-clipboard; dismiss closes modal permanently
  Unit test: "key shown once" — modal not re-openable; copy button copies to clipboard.

- [ ] **Client detail page** (`app/[tenantSlug]/clients/[id]/page.tsx`)
  Details from `GET /clients/{id}` via proxy. Edit name/enabled. Delete (soft via MetaSync + DB row). Toggle enabled. Rotate key (modal shows new key once; updates Vault entry).

- [ ] **User → client assignment** (`app/[tenantSlug]/clients/[id]/users.tsx`)
  List users assigned to this client (from `tenant_memberships`). Assign: `UPDATE tenant_memberships SET client_id = ... WHERE user_id = ...`. Unassign: set `client_id = null`.
  Unit test: assignment updates correct membership row.

- [ ] **Playwright E2E: client management**
  Create client → key shown once → navigate away → navigate back → key not shown → "configured" badge present.

---

## Phase 9 — Model Management

**Goal:** Tenant admin can create, list, edit, and delete LLM model configurations via the MetaSync API.

**Verification:** Create a model (all required fields) → appears in list without the API key field → edit name → delete with confirmation.

### Tasks

- [ ] **Model list page** (`app/[tenantSlug]/models/page.tsx`)
  `GET /models` via proxy. Table: name, SDK type, endpoint, enabled status. "New Model" button.

- [ ] **Model create form**
  Fields: `name`, `sdk` (select: ChatCompletionsClient, AzureOpenAI, Anthropic, Gemini, test), `endpoint`, `apiType`, `apiVersion`, `deployment`, `service`, `key` (password input), `maxToken`, `minTemperature`, `maxTemperature`, cost config object.
  On success: display `key` once in modal with copy-to-clipboard. `POST /models` via proxy.
  Unit test: SDK selector shows correct options; key field is masked; form validates required fields.

- [ ] **Model detail/edit page** (`app/[tenantSlug]/models/[id]/page.tsx`)
  `GET /models/{id}` via proxy. Edit all non-key fields via `PATCH /models/{id}`. Soft-delete via `DELETE /models/{id}` with confirmation dialog.

---

## Phase 10 — Prompt & Prompt Flow Management

**Goal:** Tenant admins and tenant users can create and manage prompts with status transitions and version history. Users can build ordered prompt flows with drag-and-drop.

**Verification:** Admin creates a public prompt (DRAFT → PUBLISHED); user sees it in list; user creates a private prompt; admin does not see the private prompt; user builds a flow from two prompts; reorders via drag-and-drop.

### Tasks

- [ ] **Prompt list page** (`app/[tenantSlug]/prompts/page.tsx`)
  `GET /prompts` with filters (name, type, status, version) via proxy. Tenant users see public + own private; admins see all. Pagination.

- [ ] **Prompt editor page** (`app/[tenantSlug]/prompts/[id]/page.tsx` + `new`)
  Multi-line textarea for prompt content. Status selector with enforced transitions: DRAFT → PUBLISHED → ARCHIVE. Version display (read-only, from MetaSync). Save via `POST /prompts` or `PATCH /prompts/{id}`.
  Unit test: invalid status transitions blocked in UI; version field is read-only.

- [ ] **Ownership rules enforcement**
  `PATCH` and `DELETE` disabled in UI for prompts the current user doesn't own. Tenant users cannot edit admin (public) prompts.
  Unit test: edit/delete buttons hidden for non-owned prompts.

- [ ] **Prompt flow list page** (`app/[tenantSlug]/prompt-flows/page.tsx`)
  `GET /prompt-flows` via proxy. Table: name, prompt count, owner.

- [ ] **Flow builder page** (`app/[tenantSlug]/prompt-flows/[id]/page.tsx` + `new`)
  Select prompts from available list (public + own private). Drag-and-drop reordering (use `@dnd-kit/sortable`). Preview prompt content inline. Save via `POST /prompt-flows` or `PATCH /prompt-flows/{id}`.
  Unit test: drag-and-drop reorder updates ordered list correctly; selected prompts reflect ownership rules.

---

## Phase 11 — Job Management

**Goal:** Users can browse, filter, and manage jobs. Tenant users can create single and batch jobs. Valid status transitions are enforced.

**Verification:** Create a job; view it in the list; update status PENDING → CANCELED; create a batch of 3 jobs; select all 3 and batch delete with confirmation.

### Tasks

- [ ] **Job list page** (`app/[tenantSlug]/jobs/page.tsx`)
  `GET /jobs` with filters (status, operation, model, priority, clientReference) + `GET /jobs/summary` for counts. Paginated, sortable. Tenant admins see all; tenant users see client-scoped.

- [ ] **Job detail page** (`app/[tenantSlug]/jobs/[id]/page.tsx`)
  All fields from `GET /jobs/{id}`. JSON viewer component (`components/json-viewer.tsx`) for `requestData`/`responseData`. Status transition history. Status update controls.

- [ ] **Status transition controls**
  Only valid transitions shown: PENDING → CANCELED, PROCESSED → CONSUMED, PROCESSED → ERROR_CONSUMING. Confirmation dialog before transition. `PATCH /jobs/{id}` via proxy.
  Unit test: buttons rendered only for valid next states; absent for invalid transitions.

- [ ] **Job create form** (`app/[tenantSlug]/jobs/new/page.tsx`)
  Fields: operation, model (select from tenant models), temperature, priority, prompts/workingPrompts (multi-select), requestData (JSON editor), clientReference, evalPrompt, evalModel, metaPrompt, metaModel. `POST /jobs` via proxy.

- [ ] **Batch job create**
  Toggle to switch create form to batch mode. Adds array wrapper. `POST /jobs/batch` via proxy.

- [ ] **Batch select + actions**
  Checkbox column in job list. "Batch update" (status change) and "Batch delete" with item count confirmation dialog. `PATCH /jobs/batch` and `DELETE /jobs/batch` via proxy.
  Unit test: checkbox selects row; batch toolbar appears; confirmation shows correct count.

---

## Phase 12 — Worker Management

**Goal:** Tenant users can create, configure, start, stop, and delete workers. Bulk operations work across selections.

**Verification:** Create a worker; start it → edit/delete buttons disabled; stop it → edit/delete re-enabled; select 3 workers and bulk start them.

### Tasks

- [ ] **Worker list page** (`app/[tenantSlug]/workers/page.tsx`)
  `GET /workers` + `GET /workers/summary`. Status indicator: STOPPED (grey), RUNNING (green), ERROR (red). Checkbox selection for bulk ops.

- [ ] **Worker create form**
  Fields: `workerId`, `pollInterval`, `maxItemsPerBatch`, `modelFilter` (multi-select), `operationFilter` (multi-select), `clientReferenceFilters`. `POST /workers` via proxy.

- [ ] **Worker detail/edit page** (`app/[tenantSlug]/workers/[id]/page.tsx`)
  `GET /workers/{id}`. Edit config (disabled while RUNNING). Start (`POST /workers/{id}/start`) and stop (`POST /workers/{id}/stop`) buttons. Delete (disabled while RUNNING) with confirmation.
  Unit test: edit form disabled when `status === 'RUNNING'`; start button hidden when already running.

- [ ] **Bulk operations**
  Bulk start, stop, delete (stopped only), config update. Confirmation: "Start 3 workers?". `POST` and `DELETE` calls via proxy.
  Unit test: bulk delete disabled if any selected worker is RUNNING.

---

## Phase 13 — Stream / Chat Interface

**Goal:** Real-time streaming chat with character-level display. Past sessions viewable in read-only bubble format.

**Verification:** Open `/streams/new`; select model and temperature; send a message; characters stream into the model bubble; metrics appear after completion; input was disabled during streaming and re-enabled after.

### Tasks

- [ ] **`stream-proxy` edge function** (`supabase/functions/stream-proxy/index.ts`)
  Full implementation per design §5.4. Validates JWT, retrieves API key from Vault, opens SSE connection to MetaSync, pipes chunks verbatim.
  Deno unit test: 401 no JWT; 503 credentials_not_configured; SSE chunks piped correctly (mock MetaSync SSE server).

- [ ] **`useStreamProxy` hook** (`hooks/use-stream-proxy.ts`)
  State machine: `idle → streaming → done | error`. `send(userPrompt)` triggers fetch with ReadableStream reader. Appends tokens to `messages` state. Re-enables input on `[DONE]` or error event.
  Unit test: state transitions (idle → streaming → done); error state on SSE error event; input flag correctly toggled.

- [ ] **Chat UI** (`app/[tenantSlug]/streams/new/page.tsx`)
  - Toolbar: model dropdown + temperature slider (disabled after first send)
  - Chat bubble list: user messages right-aligned, model responses left-aligned with model name label
  - Metrics row (tokens, cost, duration) below model bubble post-completion
  - Fixed bottom input + send button (disabled during streaming)
  - Inline error bubble on SSE error
  Unit test: user bubble renders right-aligned; model bubble labelled with model name; input has `disabled` attribute while streaming.

- [ ] **Stream list page** (`app/[tenantSlug]/streams/page.tsx`)
  `GET /stream` with filters (model, status, limit) + `GET /stream/summary` via proxy. Table: streamId, model, status, date, token counts.

- [ ] **Stream detail page** (`app/[tenantSlug]/streams/[id]/page.tsx`)
  `GET /stream/{id}` via proxy. Renders completed conversation in same chat bubble layout (read-only). Metrics below response bubble.

- [ ] **Playwright E2E: streaming**
  - Navigate to `/streams/new`; select model; type message; click send
  - Assert input becomes disabled
  - Assert model bubble appears and has text content after a timeout
  - Assert input re-enables
  - Assert metrics row visible

---

## Phase 14 — Run Management

**Goal:** Tenant users can create metaprompting optimization runs, control their lifecycle, and visualise iteration progress.

**Verification:** Create a run; status shows PENDING; cancel it; status shows CANCELLED. Create another; view iteration progress table; link to job from `currentJobId` works.

### Tasks

- [ ] **Run list page** (`app/[tenantSlug]/runs/page.tsx`)
  `GET /runs` with status filter. Table: run ID, status badge, iteration progress (`currentIteration/maxIterations`), models, created date.

- [ ] **Run create form** (`app/[tenantSlug]/runs/new/page.tsx`)
  Fields: `initialWorkingPromptIds` (multi-select prompts), `evalPromptId`, `evalModel`, `metaPromptId`, `metaModel`, `workingModels` (multi-select), `maxIterations`, `temperature`, `priority`, `requestData` (JSON editor). `POST /runs` via proxy.

- [ ] **Run detail page** (`app/[tenantSlug]/runs/[id]/page.tsx`)
  - Status badge + progress bar (`currentIteration / maxIterations`, `currentModelIndex`)
  - Lifecycle controls: Pause (RUNNING only), Resume (PAUSED only), Cancel
  - Iteration results table per model: iteration number, status, eval result, suggested prompt
  - Aggregated metrics per model run
  - Overall run metrics
  - Link to current job (`currentJobId` → `/jobs/{id}`)
  Unit test: Pause button rendered only for RUNNING status; Resume only for PAUSED; Cancel for RUNNING/PAUSED.

---

## Phase 15 — Dashboards

**Goal:** Tenant admin sees tenant-wide summary counts; tenant user sees client-scoped counts.

**Verification:** Tenant admin dashboard shows correct job/worker/stream/run counts matching list pages. Tenant user dashboard shows only their client's counts.

### Tasks

- [ ] **Tenant admin dashboard** (`app/[tenantSlug]/dashboard/page.tsx`)
  Parallel fetches: `GET /jobs/summary`, `GET /workers/summary`, `GET /stream/summary`, `GET /runs` (count active). Also fetch models count and clients count from Supabase directly.
  Summary cards, each linking to the respective list page.
  Unit test: card counts rendered from summary responses; loading skeleton shown while fetching.

- [ ] **Tenant user dashboard**
  Same structure; proxy calls automatically scope to `client_id` API key. Renders only job, worker, stream, run cards (no models/clients cards).
  Unit test: models and clients cards not rendered for `user_role === 'tenant_user'`.

---

## Phase 16 — User Management (Tenant Admin)

**Goal:** Tenant admin can view all users, manage client assignments, and manage invitations.

**Verification:** List shows all tenant users including unassigned; assign an unassigned user to a client; user's next JWT refresh includes `client_id`; revoke a pending invitation.

### Tasks

- [ ] **User management page** (`app/[tenantSlug]/users/page.tsx`)
  Query `tenant_memberships JOIN auth.users` for the tenant. Table: email, role, client assignment (or "Unassigned" badge). Pending invitations section below.

- [ ] **Client assignment controls**
  Inline select on each user row to assign/reassign client. "Unassign" option sets `client_id = null`. Confirmation on reassign. `UPDATE tenant_memberships SET client_id = ...` via Supabase client.
  Unit test: "Unassigned" badge for null `client_id`; confirmation shown on reassign.

- [ ] **Pending invitations section**
  List: email, role, target client (if any), expiry date, status. "Revoke" button → `UPDATE invitations SET status='expired'`. "Re-invite" button → calls `invite` edge function again.

- [ ] **Remove user from tenant**
  Confirmation dialog: "Remove {email} from this tenant?". `DELETE FROM tenant_memberships WHERE user_id = ... AND tenant_id = ...`. Revokes all their pending invitations.

---

## Phase 17 — Full E2E Suite & Documentation

**Goal:** Complete Playwright E2E coverage for all critical flows. All `docs/` files accurate and up to date.

**Verification:** `npx playwright test` passes; `docs/index.md` links all docs; `README.md` setup steps work from scratch on a clean clone.

### Tasks

- [ ] **E2E: full invitation lifecycle**
  Owner creates tenant → invites tenant admin → admin accepts → admin invites tenant user with client → user accepts → user sees client-scoped dashboard.

- [ ] **E2E: proxy security assertion**
  On any MetaSync API call, assert no outgoing browser request to the MetaSync `backend_url` domain (only to Supabase functions URL).

- [ ] **E2E: role-based navigation**
  Assert owner sees `/owner/tenants`; tenant admin sees config/clients/models/users; tenant user does not see those nav items; unassigned tenant user blocked from job/worker pages.

- [ ] **E2E: streaming chat**
  Full streaming scenario (Phase 13 E2E task).

- [ ] **E2E: client API key shown once**
  Create client → key modal visible → dismiss → navigate away → navigate back → key not visible.

- [ ] **Update all `docs/` files** to reflect any implementation deviations from the design.

- [ ] **Verify `README.md` setup**
  Follow README steps on a clean repo clone; confirm `supabase start` + `npm run dev` results in working app.

- [ ] **pgTAP final run**
  `supabase test db` — all tests pass against final schema.
