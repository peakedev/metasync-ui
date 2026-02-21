# Supabase Row Level Security (RLS) Reference

> **Last updated:** 2026-02-21
>
> This document must be updated whenever migrations add, modify, or remove tables or RLS policies. Failure to keep it in sync is a security risk -- stale documentation can mask missing policies.

---

## Quick Checklist

Before merging any migration that touches tables or policies, verify:

- [ ] Every new table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- [ ] Every new table has the `deny_anon` policy
- [ ] Every new table has the `tenant_isolation` policy (or an equivalent scoped policy)
- [ ] `tenant_id` (or equivalent FK) is indexed on the new table
- [ ] The Custom Access Token Hook does not need changes for the new table
- [ ] This document has been updated to reflect the new table/policy

---

## Tables and Their Policies

### `tenants`

| Policy | Target | Operation | Rule |
|---|---|---|---|
| `deny_anon` | `anon` | ALL | `USING (false)` |
| `tenant_isolation` | `authenticated` | ALL | `USING (id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner')` |

Note: Uses `id` (not `tenant_id`) because this is the root tenant table.

### `tenant_memberships`

| Policy | Target | Operation | Rule |
|---|---|---|---|
| `deny_anon` | `anon` | ALL | `USING (false)` |
| `tenant_isolation` | `authenticated` | ALL | `USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner')` |

### `clients`

| Policy | Target | Operation | Rule |
|---|---|---|---|
| `deny_anon` | `anon` | ALL | `USING (false)` |
| `tenant_isolation` | `authenticated` | ALL | `USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner')` |

### `invitations`

| Policy | Target | Operation | Rule |
|---|---|---|---|
| `deny_anon` | `anon` | ALL | `USING (false)` |
| `tenant_isolation` | `authenticated` | ALL | `USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner')` |

---

## Policy Templates

Every new application table **must** apply both policies. Copy-paste and adjust:

```sql
-- 1. Enable RLS
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;

-- 2. Block all anonymous access
CREATE POLICY deny_anon ON public.<table_name>
  FOR ALL TO anon
  USING (false);

-- 3. Tenant isolation with owner bypass
CREATE POLICY tenant_isolation ON public.<table_name>
  FOR ALL TO authenticated
  USING (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
  );
```

If the table uses a different column for tenant scoping (e.g., `id` on the `tenants` table), replace `tenant_id` with that column.

---

## How Tenant Isolation Works

### JWT Claims (injected by Custom Access Token Hook)

```json
{
  "app_metadata": {
    "user_role": "owner | tenant_admin | tenant_user",
    "tenant_id": "<uuid> | null",
    "client_id": "<uuid> | null"
  }
}
```

- Claims live in `app_metadata` -- **server-set only**; users cannot modify via the client SDK.
- The hook (`public.custom_access_token_hook`) runs on every token issuance and refresh.
- RLS policies read claims directly from the JWT via `auth.jwt()` -- no DB subqueries, O(1) evaluation.

### Access Matrix

| Role | `tenant_id` in JWT | Sees rows where... |
|---|---|---|
| Owner | `null` | All rows (owner bypass in policy) |
| Tenant Admin | `<uuid>` | `row.tenant_id = jwt.tenant_id` |
| Tenant User | `<uuid>` | `row.tenant_id = jwt.tenant_id` |
| Anonymous | n/a | Nothing (`deny_anon` blocks all) |

### Layered Enforcement

RLS is **one of three layers**. A request must pass all three:

1. **Next.js middleware** -- route-level guards (owner routes, tenant slug matching, client assignment check)
2. **Edge Function auth** -- JWT validation + tenant/role assertions before proxying
3. **RLS policies** -- database-level row filtering (this document)

---

## Custom Access Token Hook

**Migration:** `20240101000006_custom_access_token_hook.sql`

**Function:** `public.custom_access_token_hook(event jsonb) RETURNS jsonb`

### Behavior

1. If `app_metadata.user_role` is already `'owner'`, pass through unchanged.
2. Otherwise, query `tenant_memberships` for the user's row.
3. If found, inject `user_role`, `tenant_id`, `client_id` into `app_metadata`.
4. Return the enriched claims.

### Permissions

```sql
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon;
GRANT ALL ON TABLE public.tenant_memberships TO supabase_auth_admin;
```

### Registration

The hook must be registered in the Supabase dashboard: **Authentication > Hooks > Custom Access Token** pointing to `public.custom_access_token_hook`.

---

## Vault Integration

API keys are stored encrypted in Supabase Vault. They are **never exposed to the browser**.

### Secret Naming Convention

| Secret name | Purpose | Who can decrypt |
|---|---|---|
| `tenant_{tenant_id}_admin_key` | MetaSync admin API key for a tenant | Edge Functions (service role) |
| `client_{client_id}_api_key` | MetaSync client API key | Edge Functions (service role) |

### Credential Selection in Edge Functions

```
if role is owner or tenant_admin:
    use tenant_{tenantId}_admin_key
else if role is tenant_user AND client_id is not null:
    use client_{client_id}_api_key
else:
    reject with 403 (no_client)
```

---

## Applying RLS to a New Supabase Project

When migrating to a new Supabase project, apply in this order:

### Step 1 -- Run all migrations

```bash
npx supabase db push --project-ref <new-project-ref>
```

Or reset locally and push:

```bash
npx supabase db reset
npx supabase db push
```

Migrations are in `supabase/migrations/` and numbered sequentially:

| Migration | Purpose |
|---|---|
| `20240101000001_create_tenants.sql` | `tenants` table |
| `20240101000002_create_tenant_memberships.sql` | `tenant_memberships` table |
| `20240101000003_create_clients.sql` | `clients` table |
| `20240101000004_create_invitations.sql` | `invitations` table |
| `20240101000005_enable_rls_policies.sql` | All RLS policies (`deny_anon` + `tenant_isolation` on all 4 tables) |
| `20240101000006_custom_access_token_hook.sql` | Custom Access Token Hook function + grants |

### Step 2 -- Register the Custom Access Token Hook

In the Supabase dashboard for the **new** project:

1. Go to **Authentication > Hooks**
2. Enable **Custom Access Token**
3. Select function: `public.custom_access_token_hook`
4. Save

### Step 3 -- Enable Vault extension

```sql
CREATE EXTENSION IF NOT EXISTS supabase_vault;
```

### Step 4 -- Create the owner user

Using the Supabase admin API or dashboard, create the owner user and set:

```json
{ "app_metadata": { "user_role": "owner" } }
```

### Step 5 -- Deploy Edge Functions

```bash
npx supabase functions deploy --project-ref <new-project-ref>
```

### Step 6 -- Set environment variables

Ensure these are set for the frontend:

```
NEXT_PUBLIC_SUPABASE_URL=<new project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<new anon key>
NEXT_PUBLIC_APP_URL=<app base URL>
```

### Step 7 -- Verify

Run the verification queries below to confirm everything is in place.

---

## Verification Queries

Run these against the target database to confirm RLS is correctly applied.

### Check RLS is enabled on all application tables

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('tenants', 'tenant_memberships', 'clients', 'invitations')
ORDER BY tablename;
```

Expected: all rows show `rowsecurity = true`.

### List all RLS policies

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('tenants', 'tenant_memberships', 'clients', 'invitations')
ORDER BY tablename, policyname;
```

Expected: 2 policies per table (`deny_anon` + `tenant_isolation`), 8 total.

### Verify the Custom Access Token Hook exists

```sql
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'custom_access_token_hook';
```

Expected: 1 row with `prosecdef = true` (SECURITY DEFINER).

### Verify hook permissions

```sql
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'custom_access_token_hook'
  AND routine_schema = 'public';
```

Expected: `supabase_auth_admin` has EXECUTE; `authenticated` and `anon` do not.

### Verify tenant_id indexes exist

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexdef LIKE '%tenant_id%'
ORDER BY tablename;
```

Expected: indexes on `tenant_memberships`, `clients`, `invitations`.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| User sees no data after login | Hook not registered in dashboard | Register hook under Authentication > Hooks |
| User sees all tenants' data | `tenant_isolation` policy missing or wrong column | Check `pg_policies`; re-run migration 5 |
| Anonymous requests succeed | `deny_anon` policy missing | Re-run migration 5 |
| Owner can't see any data | `user_role` not set to `'owner'` in `app_metadata` | Set via admin API: `auth.admin.updateUserById(id, { app_metadata: { user_role: 'owner' } })` |
| Tenant user gets 403 on proxy | `client_id` is null | Assign a client to the user in `tenant_memberships` |
| Claims stale after role change | JWT not refreshed | Call `supabase.auth.refreshSession()` to re-trigger hook |

---

## Update Log

| Date | Change | Migration |
|---|---|---|
| 2026-02-21 | Initial document -- 4 tables, 8 policies, 1 hook | `000001` through `000006` |
