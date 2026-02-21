# Owner IAM Management — Design

**Requirements:** [`requirements.md`](./requirements.md)
**Depends on:** [`specs/baseline/design.md`](../baseline/design.md)

---

## 1. Overview

The IAM feature adds an owner-only console at `/owner/iam/` for full cross-tenant user lifecycle management. It extends the baseline without modifying existing flows (invitation, complete-signup for tenant members, RLS policies).

Key design decisions:
- **Separate `owner_invitations` table** for owner account bootstrapping — keeps the existing `invitations` table scoped to tenant membership, avoiding `tenant_id = null` null-handling.
- **New edge functions for reads** that require `auth.users` access (not available via anon key + RLS); direct Supabase calls (RLS owner bypass) for writes on `tenant_memberships` and `invitations`.
- **DB-level last-admin guard** via a `BEFORE DELETE OR UPDATE` trigger — prevents race conditions that a UI-only check cannot.
- **`invitations.updated_at`** column added to enable idempotency check on `resend-invite`.

---

## 2. Architecture

> Diagram: [`docs/diagrams/iam-architecture.drawio`](../../docs/diagrams/iam-architecture.drawio)

```
Browser (/owner/iam/*)
  ├─ useIAMUsers           → GET /functions/v1/iam-users          (service role read)
  ├─ useUserDetail         → GET /functions/v1/iam-user-detail     (service role read)
  ├─ useOwnerList          → GET /functions/v1/list-owners         (service role read)
  ├─ useIAMMutations
  │   ├─ role change       → supabase.from('tenant_memberships').update()   (direct, owner RLS bypass)
  │   ├─ client reassign   → supabase.from('tenant_memberships').update()   (direct, owner RLS bypass)
  │   ├─ remove membership → supabase.from('tenant_memberships').delete()   (direct, owner RLS bypass)
  │   ├─ revoke invitation  → supabase.from('invitations').update()          (direct, owner RLS bypass)
  │   ├─ resend invite      → POST /functions/v1/resend-invite
  │   └─ invite member      → POST /functions/v1/invite   [existing]
  └─ useInviteOwner        → POST /functions/v1/invite-owner
```

---

## 3. Components and Interfaces

### 3.1 New Routes

```
app/
└── owner/
    ├── tenants/            [existing]
    └── iam/
        ├── page.tsx              # redirect to /owner/iam/users
        ├── users/
        │   ├── page.tsx          # FR-IAM-1: UserDirectoryPage
        │   └── [userId]/
        │       └── page.tsx      # FR-IAM-2: UserDetailPage
        ├── invitations/
        │   └── page.tsx          # FR-IAM-9: InvitationsPage
        └── owners/
            └── page.tsx          # FR-IAM-10: OwnersPage
```

Middleware already guards `/owner/*` — no changes needed.

### 3.2 New Edge Functions

| Function | Method | Auth | Purpose |
|---|---|---|---|
| `iam-users` | GET | owner JWT | Lists all `tenant_memberships` joined with user emails (from Auth Admin API) + tenant/client names. Supports `?tenantId=`, `?role=`, `?assigned=true/false`, `?search=email`, `?limit=`, `?offset=` |
| `iam-user-detail` | GET | owner JWT | Returns single user: auth info (email, provider, created_at) + all memberships + all invitations by email |
| `list-owners` | GET | owner JWT | Returns all `auth.users` where `raw_app_meta_data.user_role = 'owner'` |
| `resend-invite` | POST | owner or tenant_admin JWT | Validates pending invitation, calls `inviteUserByEmail`, updates `expires_at = now() + 7d` and `updated_at`. Idempotency: skips if `updated_at > now() - 60s` |
| `invite-owner` | POST | owner JWT | Inserts `owner_invitations` row; calls `inviteUserByEmail` with `redirectTo: /invite/accept-owner` and `owner_invitation_id` in user_metadata |
| `complete-owner-signup` | POST | newly-invited user JWT | Validates `owner_invitations` row; calls `supabase.auth.admin.updateUserById` to set `raw_app_meta_data.user_role = 'owner'`; marks invitation accepted |

`invite` [existing] — already supports owner JWT; no changes needed.

### 3.3 New Frontend Hooks

```ts
// Paginated cross-tenant member list
const { data, isLoading, error } = useIAMUsers({
  tenantId?: string,
  role?: 'tenant_admin' | 'tenant_user',
  assigned?: boolean,
  search?: string,
  page?: number,       // default 0
  pageSize?: number,   // default 100
})
// data: { items: IAMMember[], total: number }

// Full detail for one user
const { data } = useUserDetail(userId: string)
// data: { user: AuthUser, memberships: MembershipDetail[], invitations: InvitationDetail[] }

// Owner list
const { data } = useOwnerList()
// data: { owners: AuthUser[] }

// All write mutations
const { changeRole, reassignClient, removeMembership, revokeInvitation, resendInvitation, inviteOwner } = useIAMMutations()
```

All TanStack Query keys:
- `['iam-users', filters]`
- `['user-detail', userId]`
- `['owner-list']`

Mutations invalidate: `['iam-users']`, `['user-detail', userId]`, `['owner-list']` as appropriate.

### 3.4 UI Components

| Component | Location | Purpose |
|---|---|---|
| `UserDirectoryTable` | `components/iam/` | Filterable, paginated table; search by email; action: invite |
| `UserDetailCard` | `components/iam/` | User auth info header |
| `MembershipRow` | `components/iam/` | Inline actions: change role (dropdown), reassign client (dropdown), remove (with confirmation) |
| `InvitationRow` | `components/iam/` | Inline actions: resend, revoke (with confirmation) |
| `InviteUserDialog` | `components/iam/` | Shared form for invite admin/user; tenant dropdown; conditional client dropdown |
| `InviteOwnerDialog` | `components/iam/` | Email-only form; calls `invite-owner` |
| `OwnerRow` | `components/iam/` | Read-only owner entry + remove action (blocked for self) |
| `LastAdminBadge` | `components/iam/` | Visual indicator on the last admin in a tenant; disables demote/remove actions |

---

## 4. Data Models

### 4.1 New Table: `owner_invitations`

```sql
CREATE TABLE owner_invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  invited_by  uuid        NOT NULL REFERENCES auth.users(id),
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_owner_invitations_email ON owner_invitations(email);
```

**RLS:** `deny_anon` (all anon blocked). No `tenant_isolation` needed — accessed only via service role in edge functions.

### 4.2 Migration: `invitations.updated_at`

```sql
ALTER TABLE invitations
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER invitations_updated_at
  BEFORE UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Used by `resend-invite` for idempotency: skip if `updated_at > now() - interval '60 seconds'`.

### 4.3 Migration: Last-Admin Guard Trigger

```sql
CREATE OR REPLACE FUNCTION prevent_last_admin_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Block DELETE if this is the last tenant_admin for the tenant
  IF TG_OP = 'DELETE' AND OLD.role = 'tenant_admin' THEN
    IF (SELECT COUNT(*) FROM tenant_memberships
        WHERE tenant_id = OLD.tenant_id AND role = 'tenant_admin' AND id != OLD.id) = 0 THEN
      RAISE EXCEPTION 'last_admin_removal' USING MESSAGE =
        'Cannot remove the last admin from tenant ' || OLD.tenant_id;
    END IF;
    RETURN OLD;
  END IF;

  -- Block role demotion if this is the last tenant_admin
  IF TG_OP = 'UPDATE' AND OLD.role = 'tenant_admin' AND NEW.role != 'tenant_admin' THEN
    IF (SELECT COUNT(*) FROM tenant_memberships
        WHERE tenant_id = OLD.tenant_id AND role = 'tenant_admin' AND id != OLD.id) = 0 THEN
      RAISE EXCEPTION 'last_admin_demotion' USING MESSAGE =
        'Cannot demote the last admin of tenant ' || OLD.tenant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER last_admin_guard
  BEFORE DELETE OR UPDATE ON tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION prevent_last_admin_change();
```

The trigger error message (`last_admin_removal`, `last_admin_demotion`) is caught in the frontend mutation and shown as a user-facing error.

### 4.4 New TypeScript Interfaces

```ts
interface IAMMember {
  userId: string
  email: string
  role: 'tenant_admin' | 'tenant_user'
  tenantId: string
  tenantName: string
  clientId: string | null
  clientName: string | null
  membershipCreatedAt: string
}

interface MembershipDetail {
  id: string
  tenantId: string
  tenantName: string
  role: 'tenant_admin' | 'tenant_user'
  clientId: string | null
  clientName: string | null
  createdAt: string
}

interface InvitationDetail {
  id: string
  tenantId: string
  tenantName: string
  role: 'tenant_admin' | 'tenant_user'
  clientId: string | null
  status: 'pending' | 'accepted' | 'expired'
  expiresAt: string
  createdAt: string
}

interface AuthUser {
  id: string
  email: string
  provider: 'email' | 'google'
  createdAt: string
  rawAppMetadata: { user_role?: string; tenant_id?: string; client_id?: string }
}
```

---

## 5. Key Flows

### 5.1 Change Role / Reassign Client

```
Owner selects role in MembershipRow dropdown
  → useIAMMutations.changeRole(tenantId, userId, newRole)
  → supabase.from('tenant_memberships')
      .update({ role: newRole, client_id: newRole === 'tenant_admin' ? null : existingClientId })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
  → On 'last_admin_demotion' DB error → surface toast: "Cannot demote last admin"
  → On success → invalidate ['user-detail', userId], ['iam-users']
  → Affected user sees change on next JWT refresh
```

### 5.2 Remove Membership

```
Owner clicks Remove on MembershipRow
  → Confirmation dialog: "User will lose access to <Tenant> on next session refresh"
  → useIAMMutations.removeMembership(tenantId, userId)
  → supabase.from('tenant_memberships')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
  → On 'last_admin_removal' DB error → surface toast: "Cannot remove last admin"
  → On success → invalidate cache
```

### 5.3 Resend Invitation

```
Owner clicks Resend on InvitationRow
  → useIAMMutations.resendInvitation(invitationId)
  → POST /functions/v1/resend-invite { invitationId }

Edge function:
  1. Validate JWT (owner or tenant_admin)
  2. SELECT * FROM invitations WHERE id = ? AND status = 'pending'
  3. If NOT FOUND → 404 invitation_not_found
  4. If updated_at > now() - interval '60 seconds' → 429 too_many_requests (idempotency)
  5. supabase.auth.admin.inviteUserByEmail(email, { redirectTo, data })
  6. UPDATE invitations SET expires_at = now() + 7d  (trigger sets updated_at)
  7. Return 200
```

### 5.4 Invite Owner

> Diagram: [`docs/diagrams/iam-invite-owner-flow.drawio`](../../docs/diagrams/iam-invite-owner-flow.drawio)

```
Phase 1 — Owner invites:
  POST /functions/v1/invite-owner { email }
    → Validate owner JWT
    → Check no existing pending owner_invitation for email (409 if found)
    → INSERT INTO owner_invitations (email, invited_by)
    → supabase.auth.admin.inviteUserByEmail(email, {
          redirectTo: '{APP_URL}/invite/accept-owner',
          data: { owner_invitation_id }
      })
    → 201 Created

Phase 2 — New owner accepts:
  /invite/accept-owner?token=<otp>
    → supabase.auth.verifyOtp({ email, token, type: 'invite' })
    → JWT issued (no claims yet)
    → POST /functions/v1/complete-owner-signup
        → Validate JWT
        → Read owner_invitation_id from user.user_metadata
        → SELECT * FROM owner_invitations WHERE id = ? AND status = 'pending' AND expires_at > now()
        → supabase.auth.admin.updateUserById(userId, {
              app_metadata: { user_role: 'owner' }
          })
        → UPDATE owner_invitations SET status = 'accepted'
        → 200 OK
    → supabase.auth.refreshSession()
        → Custom Token Hook: sees user_role='owner' in app_metadata → passes through
    → Redirect to /owner/tenants
```

---

## 6. Error Handling

| Scenario | Source | Response | UI behaviour |
|---|---|---|---|
| Demoting last admin | DB trigger | Postgres exception `last_admin_demotion` | Toast: "Cannot demote — tenant must retain at least one admin" |
| Removing last admin | DB trigger | Postgres exception `last_admin_removal` | Toast: "Cannot remove — tenant must retain at least one admin" |
| Duplicate pending invitation (resend) | `resend-invite` | 429 `too_many_requests` | Toast: "Invitation was just resent, please wait" |
| Invitation not found / already used | `resend-invite` / `complete-owner-signup` | 404 / 409 | Error message inline |
| Owner invitation expired | `complete-owner-signup` | 410 `invitation_expired` | "/invite/accept-owner" page shows expiry message |
| Self-removal of owner | `list-owners` page | Client-side disabled action | Remove button disabled with tooltip "Cannot remove your own owner account" |
| < 1 owner remaining | `invite-owner` | N/A (additive operation only) | N/A |
| Unauthorised (non-owner hits `/owner/iam/*`) | Middleware | Redirect to tenant dashboard | No error; seamless redirect |
| Auth Admin API failure | Edge functions | 503 `auth_admin_error` | Toast with retry option |

---

## 7. Testing Strategy

| Layer | Tool | Coverage |
|---|---|---|
| DB trigger (last-admin guard) | pgTAP | Delete last admin → exception; delete non-last admin → success; demote last admin → exception; promote user → success; demote with remaining admin → success |
| `owner_invitations` RLS | pgTAP | Anon blocked; authenticated non-owner blocked; service role reads all |
| `updated_at` trigger | pgTAP | UPDATE invitations → updated_at changes; no-op after immediate second update within 60s caught in app layer |
| `iam-users` edge function | Deno.test | Non-owner JWT → 403; owner JWT → returns enriched list; filters applied; pagination works |
| `iam-user-detail` edge function | Deno.test | Unknown userId → 404; returns memberships + invitations for known user |
| `resend-invite` edge function | Deno.test | Non-pending invitation → 404; within 60s → 429; success case resets expires_at |
| `invite-owner` edge function | Deno.test | Duplicate pending → 409; non-owner caller → 403; success case inserts row + sends email |
| `complete-owner-signup` edge function | Deno.test | Expired invitation → 410; accepted → 409; success sets user_role='owner' |
| `useIAMMutations` hook | Vitest | Optimistic update on role change; rollback on DB trigger error; cache invalidation |
| `MembershipRow` | Vitest | Remove button disabled when `isLastAdmin=true`; confirmation dialog shown; mutation called on confirm |
| `LastAdminBadge` | Vitest | Shown when admin count = 1 for tenant |
| Full invite-owner flow | Playwright | Owner invites → email sent (local Supabase) → new owner accepts OTP → completes signup → redirected to /owner/tenants |
| Role change E2E | Playwright | Promote tenant_user → confirm role shows tenant_admin; demote last admin → error toast; no page crash |

---

## 8. Performance Considerations

| Concern | Approach |
|---|---|
| `iam-users` join (memberships + users) | Single Auth Admin `listUsers()` call (supports up to 1000 users per page); join with `tenant_memberships` in edge function memory; index on `tenant_memberships.user_id` (already exists) |
| `iam-users` filter by tenant | WHERE clause on `tenant_memberships.tenant_id` (indexed) before enrichment |
| `iam-user-detail` memberships + invitations | Two indexed queries (`tenant_memberships.user_id`, `invitations.email`); no N+1 |
| Last-admin trigger cost | Trigger runs a `COUNT(*)` on demote/delete — bounded by tenant admin count; negligible at scale |
| TanStack Query cache | `['iam-users']` staleTime: 30s; `['user-detail']` staleTime: 60s; mutations invalidate immediately |

---

## 9. Security Considerations

| Concern | Approach |
|---|---|
| `auth.users` exposure | Accessed only via service role key inside edge functions; never returned as raw Supabase rows to browser |
| Owner role assignment | `raw_app_meta_data` set only via `supabase.auth.admin.updateUserById` (service role); not user-modifiable |
| `owner_invitation_id` in user_metadata | Used as a DB lookup key only; role is not trusted from user_metadata — the edge function reads the DB record to determine permissions |
| Self-removal protection | `complete-owner-signup` success path cannot reduce owner count; UI disables self-removal button client-side |
| Non-owner calling IAM edge functions | All edge functions check `user_role === 'owner'` on the decoded JWT; return 403 immediately otherwise |
| Direct Supabase write calls (mutations) | Owner JWT is attached by `@supabase/ssr`; RLS `tenant_isolation` policy allows owner on all rows. DB trigger provides last-admin backstop regardless of call origin |
| Invitation metadata tampering | `owner_invitation_id` in user_metadata could be modified by the user — `complete-owner-signup` queries `owner_invitations` by that ID and validates `invited_by` + `status`; a modified ID simply fails the DB lookup |

---

## 10. Monitoring and Observability

| Signal | Edge Function | What to log |
|---|---|---|
| Owner invited | `invite-owner` | `invited_email`, `invited_by`, `owner_invitation_id` |
| Owner signup completed | `complete-owner-signup` | `user_id`, `owner_invitation_id`, `invited_by` |
| Invitation resent | `resend-invite` | `invitation_id`, `email`, `caller_role` |
| IAM user list query | `iam-users` | `filter_tenant_id`, `result_count`, `duration_ms` |
| Last-admin trigger fired | DB log / edge function catch | `tenant_id`, `user_id`, operation type |
| Auth Admin API errors | All IAM edge functions | Error type, `user_id` of caller, target resource |
