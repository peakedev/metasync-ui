# Authentication

MetaSync UI uses **Supabase Auth** for all user authentication. Authorization is enforced via JWT custom claims injected by a Custom Access Token Hook.

## Providers

- Email / password (Supabase built-in)
- Google OAuth (configured in Supabase dashboard → Authentication → Providers)

## Environment setup

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |

## Supabase Client

Initialised once using `@supabase/ssr`, which automatically attaches the active user session JWT to every Supabase request:

```ts
// lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

The anon key identifies the project. Actual data access is controlled by the user JWT + RLS — the anon key alone provides no access to application tables.

## Custom Access Token Hook

A PL/pgSQL function runs on every token issuance and refresh. It reads `tenant_memberships` and injects three custom claims into `app_metadata`:

```json
{
  "app_metadata": {
    "user_role": "owner | tenant_admin | tenant_user",
    "tenant_id": "<uuid> | null",
    "client_id": "<uuid> | null"
  }
}
```

- `user_role = 'owner'` is set via the admin API on `raw_app_meta_data` at account creation; the hook passes it through unchanged.
- `tenant_id` and `client_id` are `null` for the owner.
- `client_id` is `null` for tenant users with no client assignment.
- Claims live in `app_metadata` (server-set); users cannot modify them via the client SDK.

Hook is registered in Supabase dashboard → Authentication → Hooks → Custom Access Token.

## JWT Claims Access

```ts
const { data: { session } } = await supabase.auth.getSession()
const claims = session?.user?.app_metadata
// claims.user_role, claims.tenant_id, claims.client_id
```

## Session Lifecycle

1. User signs in → Supabase Auth validates credentials → Hook fires → JWT with custom claims issued
2. `supabase-js` stores the session (localStorage by default with `@supabase/ssr`)
3. `supabase-js` auto-refreshes the token before expiry; hook re-runs on each refresh, keeping claims in sync with DB state
4. On sign-out: `supabase.auth.signOut()` clears session from storage

## Route Guards

Implemented in Next.js middleware (`middleware.ts`):

| Route | Requirement |
|---|---|
| Any route except `(auth)/*` | Valid session required; redirect to `/login` if absent |
| `/owner/*` | `app_metadata.user_role === 'owner'` |
| `/[tenantSlug]/*` | `app_metadata.tenant_id` resolves to the slug |
| Tenant user on MetaSync operation routes | `app_metadata.client_id !== null` |

## Password Reset

Supabase built-in reset flow:
1. `supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_URL/login/reset })`
2. User clicks email link → app receives session → `supabase.auth.updateUser({ password })`

## Google OAuth

Configured in Supabase dashboard. The redirect URL must be added to the allowlist: `{APP_URL}/auth/callback`. The Next.js route at `app/auth/callback/route.ts` exchanges the code for a session using `supabase.auth.exchangeCodeForSession()`.

## Owner Account Provisioning

Owner accounts are bootstrapped via the `invite-owner` + `complete-owner-signup` edge functions.

### Flow

1. **Existing owner sends invite:** `POST /functions/v1/invite-owner { email }` → creates `owner_invitations` row → calls `supabase.auth.admin.inviteUserByEmail()` with `redirectTo: /invite/accept-owner` and `owner_invitation_id` in `user_metadata`.

2. **New owner accepts:** User clicks email link → lands on `/invite/accept-owner` → Supabase auto-authenticates → page calls `POST /functions/v1/complete-owner-signup`.

3. **Edge function completes setup:**
   - Reads `owner_invitation_id` from `user.user_metadata`
   - Validates `owner_invitations` record: status = pending, not expired
   - Calls `supabase.auth.admin.updateUserById(userId, { app_metadata: { user_role: 'owner' } })`
   - Marks invitation as accepted

4. **Session refresh:** Page calls `supabase.auth.refreshSession()` → Custom Token Hook sees `user_role = 'owner'` in `app_metadata` → passes through → JWT now has owner claims → redirect to `/owner/tenants`.

### Security

- `owner_invitation_id` in `user_metadata` is a lookup key only — role is not trusted from metadata
- The edge function validates the DB record before setting `user_role`
- Only the `invite-owner` function can create `owner_invitations` rows (via service role)
- A modified `owner_invitation_id` simply fails the DB lookup
