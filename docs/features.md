# Frontend Features

A page-by-page summary of the MetaSync UI feature set. All tenant-scoped pages live under `src/app/[tenantSlug]/` and are accessed via the tenant's URL slug. Navigation is role-aware: the `AppShell` sidebar dynamically renders menu items based on the user's `user_role` and `client_id` claims.

For the full feature specification, see [`../specs/baseline/requirements.md`](../specs/baseline/requirements.md).

---

## Authentication Pages

**Location:** `src/app/(auth)/`

### Login (`/login`)

Sign-in page supporting email/password and Google OAuth. On successful authentication, users are redirected based on their role: owners go to `/owner/tenants`, tenant members go to `/[tenantSlug]/dashboard`.

### Invite Accept (`/invite/accept`)

Processes invite acceptance. Calls `supabase.auth.verifyOtp()` with the token from the email link, then calls the `complete-signup` edge function to create the membership. After a session refresh (to populate JWT claims), redirects to the tenant dashboard.

---

## Owner Pages

**Location:** `src/app/owner/`

### Tenant Management (`/owner/tenants`)

Available only to the owner role. Lists all tenants with their configuration status (backend URL configured, admin key stored). Supports creating new tenants (name + slug), viewing tenant details, and soft-deleting tenants. Each tenant row links to its detail page.

---

## Tenant-Scoped Pages

**Location:** `src/app/[tenantSlug]/`

All pages below require an active session with a `tenant_id` that matches the URL slug. The `AppShell` component provides the sidebar navigation and user dropdown.

### Dashboard (`/[tenantSlug]/dashboard`)

Landing page for tenant members. Displays summary cards with counts for jobs, workers, streams, and runs fetched from the MetaSync backend via the proxy. Provides quick-navigation links to each section. If the backend is not configured, shows a `MetaSyncError` component prompting the admin to set up the configuration.

### Backend Configuration (`/[tenantSlug]/config`)

Available to tenant admins only. Two-step setup:

1. **Backend URL** -- Set the MetaSync backend base URL. The UI validates connectivity by calling the MetaSync `/health` endpoint through the proxy.
2. **Admin API Key** -- Submit the admin key. The proxy edge function stores it in Vault via the `store_admin_key` action. The key is never returned to the browser; the UI only shows a "configured" / "not configured" status.

### Client Management (`/[tenantSlug]/clients`)

Available to tenant admins. Lists MetaSync clients for the tenant. Operations:

- **Create client** -- Calls MetaSync `POST /clients` via proxy. The returned API key is stored in Vault and displayed once (copy-to-clipboard). Never retrievable in plaintext afterward.
- **Toggle enabled** -- Calls MetaSync `POST /clients/{id}/toggle` via proxy.
- **Rotate API key** -- Calls MetaSync `POST /clients/{id}/rotate-key` via proxy. Updates the Vault secret.
- **Delete client** -- Removes the client from both MetaSync and the local `clients` table.

### Model Management (`/[tenantSlug]/models`)

Available to tenant admins. Lists LLM models configured in the MetaSync backend. Supports viewing model configurations (provider, parameters, token limits) and is used as a reference when configuring prompts and streams.

### Prompt Management (`/[tenantSlug]/prompts`)

Lists and manages prompts with a status workflow:

- **DRAFT** -- Initial state; editable.
- **PUBLISHED** -- Active and available for use in flows and streams.
- **ARCHIVE** -- Retired; read-only.

Each prompt has a detail page with an editor for the prompt template content.

### Prompt Flow Builder (`/[tenantSlug]/prompt-flows`)

Visual flow builder for chaining prompts into multi-step pipelines. Each flow has a detail page with a builder interface for connecting prompt nodes. Flows reference published prompts and define the execution order.

### Job Management (`/[tenantSlug]/jobs`)

Lists batch processing jobs from the MetaSync backend. Job detail pages show status, configuration, and progress. Supports creating new jobs and managing their lifecycle (start, cancel). Jobs run asynchronously on the MetaSync backend.

### Worker Management (`/[tenantSlug]/workers`)

Lists and manages worker processes. Includes lifecycle controls:

- **Start** -- Launch a worker to process queued jobs.
- **Stop** -- Gracefully shut down a worker.

Worker status is polled from the MetaSync backend via the proxy.

### Stream / Chat Interface (`/[tenantSlug]/streams`)

Two sub-pages:

- **New Stream (`/streams/new`)** -- Chat interface for interactive LLM conversations. Uses SSE streaming via the `stream-proxy` edge function. The toolbar allows selecting a model and temperature before the first message. Characters stream into the assistant bubble in real time. Metrics (token count, cost, duration) are displayed after completion.
- **Stream Detail (`/streams/[id]`)** -- Read-only view of a completed stream in chat bubble format. Fetched from MetaSync via the proxy.

The `useStreamProxy` hook manages the full streaming lifecycle with states: `idle -> streaming -> done/error -> idle`.

**Analytics Chart** -- A collapsible time-series line chart between the summary card and the streams table. Visualizes per-stream processing metrics (tokens, durations, costs) over time using data from `GET /streams/analytics`. Supports metric selection (10 metrics), grouping by model/session/prompt, expand/collapse with sparkline preview, and click-to-detail interactions. Hidden below 768px viewport width. See [Streams & Analytics](./streams.md) for details.

### Run Management (`/[tenantSlug]/runs`)

Lists execution runs from the MetaSync backend. Each run detail page shows progress tracking, configuration, and results. Runs represent individual prompt or flow executions.

### User Management (`/[tenantSlug]/users`)

Available to tenant admins. Manages tenant members:

- **List users** -- Shows all members with their role and assigned client.
- **Invite user** -- Opens a dialog to send an invitation via the `invite` edge function. Role and optional client can be specified.
- **Assign/reassign client** -- Updates `tenant_memberships.client_id` for a user.
- **Remove user** -- Deletes the user's membership row.
- **View pending invitations** -- Lists invitations with `status = 'pending'`.
- **Revoke invitation** -- Sets invitation `status = 'expired'`.

---

## Shared Components

### `AppShell`

**Location:** `src/components/app-shell.tsx`

Wraps all authenticated pages. Provides a 264px-wide sidebar with role-aware navigation and a header with the user dropdown (email display + sign-out). Navigation items are computed from the user's `AppClaims`:

- **Owner** sees only "Tenants".
- **Tenant Admin** sees Dashboard, Config, Clients, Models, Users, and all operation pages.
- **Tenant User** with a client sees Dashboard and all operation pages. Without a client, only Dashboard is shown.

### `RoleGuard`

**Location:** `src/components/role-guard.tsx`

Conditionally renders children based on the current user's role. Accepts a single role string or an array. Shows a fallback (or nothing) when the role does not match.

```tsx
<RoleGuard role="tenant_admin">
  <ConfigPage />
</RoleGuard>
```

### `MetaSyncError`

**Location:** `src/components/metasync-error.tsx`

Renders contextual error states from MetaSync proxy calls:

- `credentials_not_configured` -- Shows a message with a link to the config page.
- `backend_unreachable` -- Shows a message with an optional retry button.
- Generic errors -- Shows the error message with an optional retry button.
