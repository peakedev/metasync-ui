# Database

MetaSync UI uses **Supabase Postgres** with Row Level Security (RLS) on all application tables.

> ER diagram: [`./diagrams/database-schema.drawio`](./diagrams/database-schema.drawio)

## Migrations

Migrations live in `supabase/migrations/`. Each migration is a `.sql` file prefixed with a timestamp.

```bash
npx supabase migration new <name>   # Create a new migration file
npx supabase db reset               # Drop and re-apply all migrations + seed locally
npx supabase db push                # Push migrations to remote project
npx supabase gen types typescript --local > src/types/supabase.ts  # Regenerate types
```

Convention: one migration per logical change. Never edit an existing migration — create a new one.

---

## Schema

### `tenants`

One row per MetaSync tenant.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `name` | `text` NOT NULL | Display name |
| `slug` | `text` NOT NULL UNIQUE | URL-safe identifier; used in route `[tenantSlug]` |
| `backend_url` | `text` | MetaSync base URL; nullable until configured by tenant admin |
| `is_deleted` | `boolean` NOT NULL DEFAULT `false` | Soft delete |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Index: `idx_tenants_slug ON tenants(slug)`

---

### `tenant_memberships`

Maps users to tenants with a role and an optional client assignment.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenant_id` | `uuid` NOT NULL FK → `tenants(id)` CASCADE | |
| `user_id` | `uuid` NOT NULL FK → `auth.users(id)` CASCADE | |
| `role` | `text` NOT NULL | `'tenant_admin'` or `'tenant_user'` |
| `client_id` | `uuid` FK → `clients(id)` SET NULL | Nullable — user is unassigned if null |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Unique constraint: `(tenant_id, user_id)`
Indexes: `idx_memberships_tenant_id`, `idx_memberships_user_id`

---

### `clients`

MetaSync clients per tenant. Each client has an API key stored in Supabase Vault.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenant_id` | `uuid` NOT NULL FK → `tenants(id)` CASCADE | |
| `metasync_client_id` | `text` NOT NULL | Client ID in the MetaSync backend |
| `name` | `text` NOT NULL | Display name |
| `enabled` | `boolean` NOT NULL DEFAULT `true` | |
| `vault_secret_id` | `uuid` | References `vault.secrets.id`; nullable until key is stored |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Index: `idx_clients_tenant_id ON clients(tenant_id)`

---

### `invitations`

Tracks pending, accepted, and expired invitations.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Also stored in `user_metadata` at invite time |
| `tenant_id` | `uuid` NOT NULL FK → `tenants(id)` CASCADE | |
| `email` | `text` NOT NULL | |
| `role` | `text` NOT NULL | `'tenant_admin'` or `'tenant_user'` |
| `client_id` | `uuid` FK → `clients(id)` SET NULL | Optional; null = no client pre-assigned |
| `invited_by` | `uuid` NOT NULL FK → `auth.users(id)` | |
| `status` | `text` NOT NULL DEFAULT `'pending'` | `'pending'`, `'accepted'`, `'expired'` |
| `expires_at` | `timestamptz` NOT NULL DEFAULT `now() + interval '7 days'` | |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Indexes: `idx_invitations_tenant_id`, `idx_invitations_email`

---

## Row Level Security

**Principle: no anon access.** Every application table has RLS enabled and a `deny_anon` policy that blocks all unauthenticated queries. Data access requires an active user JWT session.

### Policy template (applied to all tenant-scoped tables)

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

-- Block all unauthenticated access
CREATE POLICY deny_anon ON <table>
  FOR ALL TO anon
  USING (false);

-- Authenticated users: tenant isolation; owner bypasses
CREATE POLICY tenant_isolation ON <table>
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
  );
```

JWT claims are injected by the Custom Access Token Hook — see [authentication.md](./authentication.md).

### Performance

All columns referenced in RLS policies are indexed. Claims in the JWT (`app_metadata`) avoid subqueries in policies, keeping them O(1).

---

## Custom Access Token Hook

Defined as a PL/pgSQL function and registered in Supabase Auth settings. Injects `user_role`, `tenant_id`, `client_id` into `app_metadata` on every token issuance and refresh.

Full implementation in [authentication.md](./authentication.md).

---

## `owner_invitations`

Tracks owner account invitations. Separate from `invitations` to avoid `tenant_id = null` handling.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `email` | `text` NOT NULL | |
| `invited_by` | `uuid` NOT NULL FK → `auth.users(id)` | |
| `status` | `text` NOT NULL DEFAULT `'pending'` | `'pending'`, `'accepted'`, `'expired'` |
| `expires_at` | `timestamptz` NOT NULL DEFAULT `now() + interval '7 days'` | |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Index: `idx_owner_invitations_email ON owner_invitations(email)`
RLS: `deny_anon` (all anon blocked). Accessed only via service role in edge functions.

---

## `invitations.updated_at` Column

Added to support resend idempotency. A trigger (`invitations_updated_at`) automatically sets `updated_at = now()` on every UPDATE. The `resend-invite` edge function checks `updated_at > now() - interval '60 seconds'` to debounce rapid resends.

---

## Last-Admin Guard Trigger

A `BEFORE DELETE OR UPDATE` trigger on `tenant_memberships` (`last_admin_guard`) prevents:
- **Deleting** the last `tenant_admin` from a tenant (raises `last_admin_removal`)
- **Demoting** the last `tenant_admin` to `tenant_user` (raises `last_admin_demotion`)

This provides a database-level backstop against race conditions that a UI-only check cannot prevent.

---

## Vault

API keys are not stored as plain-text columns. See [vault.md](./vault.md).
