# Authentication & Authorization

MetaSync UI uses Supabase Auth for all user authentication. Authorization is enforced through three layers: JWT custom claims (injected by a Custom Access Token Hook), Row Level Security policies on every table, and Next.js middleware route guards.

## Roles

| Role | MetaSync credential used | Scope | How assigned |
|---|---|---|---|
| Owner | Admin API key (from Vault) | All tenants | `raw_app_meta_data.user_role = 'owner'` set via Supabase admin API |
| Tenant Admin | Admin API key (from Vault) | Own tenant only | Invited via `invite` edge function with `role = 'tenant_admin'` |
| Tenant User | Client API key (from Vault) | Own assigned client only; blocked if unassigned | Invited via `invite` edge function with `role = 'tenant_user'` |

## Auth Methods

### Email / Password

Standard Supabase email/password authentication. Users sign in on the `/login` page using `supabase.auth.signInWithPassword()`.

### Google OAuth

Configured in the Supabase dashboard under Authentication -> Providers. The redirect URL `{APP_URL}/auth/callback` must be in the allowlist. The Next.js route at `src/app/auth/callback/route.ts` exchanges the authorization code for a session using `supabase.auth.exchangeCodeForSession()`.

### Password Reset

Uses the built-in Supabase reset flow:

1. `supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_URL/login/reset })`
2. User clicks the email link and is redirected to the app with a session
3. `supabase.auth.updateUser({ password })` sets the new password

## Custom Access Token Hook

Defined in migration `20240101000006_custom_access_token_hook.sql`. This PL/pgSQL function runs on every token issuance and refresh, injecting three custom claims into `app_metadata`:

```json
{
  "app_metadata": {
    "user_role": "owner | tenant_admin | tenant_user",
    "tenant_id": "<uuid> | null",
    "client_id": "<uuid> | null"
  }
}
```

### How it works

1. The hook receives the JWT event payload containing the user ID and existing claims.
2. If `app_metadata.user_role` is already `'owner'`, the hook passes through unchanged (owner status is set via the admin API on account creation).
3. Otherwise, the hook queries `tenant_memberships` for the user's membership record.
4. If a membership is found, it sets `user_role`, `tenant_id`, and `client_id` from the membership row.
5. The enriched claims are returned, and Supabase Auth embeds them in the issued JWT.

### Key behaviors

- `tenant_id` and `client_id` are `null` for the owner.
- `client_id` is `null` for tenant users with no client assignment.
- Claims live in `app_metadata` (server-set); users cannot modify them via the client SDK.
- On every `supabase.auth.refreshSession()`, the hook re-runs, keeping claims in sync with the current database state.

### Registration

The hook is registered in the Supabase dashboard under Authentication -> Hooks -> Custom Access Token. The function `public.custom_access_token_hook` is granted execute permission to `supabase_auth_admin` and revoked from `authenticated` and `anon` roles.

## Row Level Security (RLS)

Every application table has RLS enabled with two policies:

### `deny_anon` policy

Blocks all unauthenticated access:

```sql
CREATE POLICY deny_anon ON <table>
  FOR ALL TO anon
  USING (false);
```

### `tenant_isolation` policy

Restricts authenticated users to their own tenant's data. The owner role bypasses the tenant filter:

```sql
CREATE POLICY tenant_isolation ON <table>
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
  );
```

For the `tenants` table, the policy uses `id` instead of `tenant_id`:

```sql
USING (
  id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
);
```

All columns referenced in RLS policies are indexed. Because the claims are embedded directly in the JWT (via the Custom Access Token Hook), no subqueries are needed, keeping policy evaluation O(1).

## Middleware Route Guards

Next.js middleware (`middleware.ts`) enforces route-level access control:

| Route pattern | Requirement |
|---|---|
| `(auth)/*` (login, invite) | Public -- no session required |
| All other routes | Active session required; redirect to `/login` if absent |
| `/owner/*` | `app_metadata.user_role === 'owner'` |
| `/[tenantSlug]/*` | `app_metadata.tenant_id` resolves to the tenant with the given slug |
| Tenant user on operation routes | `app_metadata.client_id !== null`; shows "no client assigned" screen if null |

## Invitation Flow

The invitation flow spans two edge functions and multiple auth state transitions.

### Phase 1 -- Admin sends invite

1. Tenant admin (or owner) calls `POST /functions/v1/invite` with `{ email, role, tenantId, clientId? }`.
2. The edge function validates the JWT and checks that the caller is `tenant_admin` or `owner`.
3. It checks for duplicate pending invitations for the same email + tenant.
4. It inserts a row in `invitations` with `status = 'pending'`.
5. It calls `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: APP_URL/invite/accept, data: { invitation_id } })`.
6. Supabase sends the invite email. The `invitation_id` is stored in the new user's `user_metadata`.

### Phase 2 -- User accepts invite

1. User clicks the email link and is redirected to `/invite/accept?token=<otp>`.
2. The app calls `supabase.auth.verifyOtp({ email, token, type: 'invite' })` to authenticate the user.
3. The app calls `POST /functions/v1/complete-signup` with the user's JWT.
4. The edge function reads `invitation_id` from `user.user_metadata`.
5. It validates the invitation: `status = 'pending'` AND `expires_at > now()`.
6. It inserts a `tenant_memberships` row with the role and optional client from the invitation.
7. It marks the invitation as `status = 'accepted'`.
8. The app calls `supabase.auth.refreshSession()`, which triggers the Custom Access Token Hook. The JWT is now enriched with `user_role`, `tenant_id`, and `client_id`.
9. The user is redirected to `/[tenantSlug]/dashboard`.

### Invitation expiry

Invitations expire after 7 days (`expires_at = now() + interval '7 days'`). If an expired invitation is presented to `complete-signup`, it returns HTTP 410. The UI shows an expiry screen prompting the admin to re-invite.

## Session Lifecycle

1. User signs in -> Supabase Auth validates credentials -> Hook fires -> JWT with custom claims issued.
2. `@supabase/ssr` stores the session (localStorage by default).
3. `supabase-js` auto-refreshes the token before expiry; the hook re-runs on each refresh, keeping claims in sync with the database.
4. On sign-out: `supabase.auth.signOut()` clears the session from storage.

## Frontend Claims Access

The `useSession()` hook wraps `supabase.auth.getSession()` with a realtime listener on auth state changes:

```ts
const { user, session, claims, loading } = useSession();
// claims.user_role, claims.tenant_id, claims.client_id
```

Claims are typed as `AppClaims`:

```ts
interface AppClaims {
  user_role?: "owner" | "tenant_admin" | "tenant_user";
  tenant_id?: string | null;
  client_id?: string | null;
}
```
