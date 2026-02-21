# Owner IAM Management — Implementation Plan

Specs: [`requirements.md`](./requirements.md) · [`design.md`](./design.md)

---

## Phase 1 — Database Migrations

**Goal:** All new schema objects exist locally; last-admin guard is enforced at the DB level; pgTAP tests pass.

**Verification:** `supabase test db` — all new pgTAP tests pass. Attempt to delete the last admin of a tenant → Postgres exception raised. Attempt to insert into `owner_invitations` as anon → blocked by RLS.

### Tasks

- [ ] **Migration: `owner_invitations` table**
  `supabase migration new create_owner_invitations`
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
  ALTER TABLE owner_invitations ENABLE ROW LEVEL SECURITY;
  CREATE POLICY deny_anon ON owner_invitations FOR ALL TO anon USING (false);
  ```

- [ ] **Migration: `invitations.updated_at` column + trigger**
  `supabase migration new add_invitations_updated_at`
  ```sql
  ALTER TABLE invitations ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

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

- [ ] **Migration: last-admin guard trigger**
  `supabase migration new last_admin_guard`
  ```sql
  CREATE OR REPLACE FUNCTION prevent_last_admin_change()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'DELETE' AND OLD.role = 'tenant_admin' THEN
      IF (SELECT COUNT(*) FROM tenant_memberships
          WHERE tenant_id = OLD.tenant_id AND role = 'tenant_admin' AND id != OLD.id) = 0 THEN
        RAISE EXCEPTION 'last_admin_removal' USING MESSAGE =
          'Cannot remove the last admin from tenant ' || OLD.tenant_id;
      END IF;
      RETURN OLD;
    END IF;
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

- [ ] **pgTAP: `owner_invitations` RLS**
  `supabase/tests/iam_owner_invitations_rls.sql`
  Tests:
  - Anon SELECT → 0 rows (blocked)
  - Service role INSERT → success
  - Service role SELECT → returns row

- [ ] **pgTAP: last-admin guard trigger**
  `supabase/tests/iam_last_admin_guard.sql`
  Tests:
  - Delete the only admin of a tenant → exception message contains `last_admin_removal`
  - Delete one admin when another exists → success
  - Update role from `tenant_admin` to `tenant_user` when only admin → exception `last_admin_demotion`
  - Promote `tenant_user` to `tenant_admin` → success (trigger does not block)
  - Demote with a remaining second admin → success

- [ ] **pgTAP: `invitations.updated_at` trigger**
  `supabase/tests/iam_invitations_updated_at.sql`
  Tests:
  - INSERT invitation → `updated_at` = `created_at` (both now())
  - UPDATE invitation status → `updated_at` changes

---

## Phase 2 — Read Edge Functions

**Goal:** Three read-only edge functions operational locally; Deno tests pass; owner JWT returns expected payloads.

**Verification:** `deno test --allow-all supabase/functions/tests/iam-read-test.ts` — all assertions pass. Call each function with a non-owner JWT → 403 returned.

### Tasks

- [ ] **Edge function: `iam-users`**
  `supabase/functions/iam-users/index.ts`

  - `GET /functions/v1/iam-users`
  - Query params: `tenantId?`, `role?`, `assigned?` (`true`/`false`), `search?` (email prefix), `limit?` (default 100), `offset?` (default 0)
  - Logic:
    1. `supabase.auth.getUser(token)` → assert `user_role === 'owner'` → 403 otherwise
    2. `supabaseAdmin.auth.admin.listUsers({ page, perPage })` → build email map `{ [userId]: email }`
    3. Query `tenant_memberships` joined with `tenants` and `clients` with WHERE filters
    4. Enrich each row with email from map; apply `search` filter client-side if provided
    5. Return `{ items: IAMMember[], total: number }`
  - Unit test: non-owner JWT → 403; owner JWT with mock data → returns enriched list; `role` filter applied; `assigned=false` returns only rows with `client_id IS NULL`

- [ ] **Edge function: `iam-user-detail`**
  `supabase/functions/iam-user-detail/index.ts`

  - `GET /functions/v1/iam-user-detail?userId=<uuid>`
  - Logic:
    1. Validate owner JWT
    2. `supabaseAdmin.auth.admin.getUserById(userId)` → 404 if not found
    3. Query `tenant_memberships` + `tenants` + `clients` WHERE `user_id = userId`
    4. Query `invitations` WHERE `email = user.email` (all statuses)
    5. Return `{ user: AuthUser, memberships: MembershipDetail[], invitations: InvitationDetail[] }`
  - Unit test: unknown userId → 404; known user → correct shape; memberships and invitations both present

- [ ] **Edge function: `list-owners`**
  `supabase/functions/list-owners/index.ts`

  - `GET /functions/v1/list-owners`
  - Logic:
    1. Validate owner JWT
    2. `supabaseAdmin.auth.admin.listUsers()` paginating all pages
    3. Filter where `raw_app_meta_data.user_role === 'owner'`
    4. Return `{ owners: AuthUser[] }`
  - Unit test: non-owner JWT → 403; returns only users with owner role; calling user's own id present in list

---

## Phase 3 — Write Edge Functions

**Goal:** Three write edge functions operational locally; Deno tests cover happy path and all documented error codes; invite-owner + complete-owner-signup round-trip works with local Supabase.

**Verification:** `deno test --allow-all supabase/functions/tests/iam-write-test.ts` — all assertions pass. Manual test: use local Supabase to send owner invite, accept via OTP, confirm `raw_app_meta_data.user_role = 'owner'` set.

### Tasks

- [ ] **Edge function: `resend-invite`**
  `supabase/functions/resend-invite/index.ts`

  - `POST /functions/v1/resend-invite { invitationId }`
  - Auth: owner or `tenant_admin` JWT
  - Logic:
    1. Validate JWT; assert `user_role === 'owner' || user_role === 'tenant_admin'`
    2. SELECT from `invitations` WHERE `id = invitationId AND status = 'pending'` → 404 if not found
    3. `tenant_admin`: assert `invitation.tenant_id === JWT.tenant_id` → 403 if mismatch
    4. If `updated_at > now() - interval '60 seconds'` → return 429 `too_many_requests`
    5. `supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { invitation_id } })`
    6. UPDATE `invitations` SET `expires_at = now() + 7d` (trigger sets `updated_at`)
    7. Return 200
  - Unit tests: 404 on missing/accepted invitation; 429 on rapid resend; tenant_admin for wrong tenant → 403; success resets `expires_at`

- [ ] **Edge function: `invite-owner`**
  `supabase/functions/invite-owner/index.ts`

  - `POST /functions/v1/invite-owner { email }`
  - Auth: owner JWT only
  - Logic:
    1. Validate JWT; assert `user_role === 'owner'` → 403 otherwise
    2. Check no pending `owner_invitations` for `email` → 409 `duplicate_invitation` if found
    3. INSERT INTO `owner_invitations (email, invited_by)`
    4. `supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: '{APP_URL}/invite/accept-owner', data: { owner_invitation_id } })`
    5. Return 201 `{ ownerInvitationId }`
  - Unit tests: non-owner JWT → 403; duplicate pending → 409; success → row in `owner_invitations` with `status = 'pending'`

- [ ] **Edge function: `complete-owner-signup`**
  `supabase/functions/complete-owner-signup/index.ts`

  - `POST /functions/v1/complete-owner-signup`
  - Auth: newly-invited user JWT (after `verifyOtp`)
  - Logic:
    1. `supabase.auth.getUser(token)` → get `user.user_metadata.owner_invitation_id`
    2. SELECT from `owner_invitations` WHERE `id = owner_invitation_id` → 404 `no_invitation` if not found
    3. If `status != 'pending'` → 409 `invitation_already_used`
    4. If `expires_at < now()` → 410 `invitation_expired`
    5. `supabaseAdmin.auth.admin.updateUserById(user.id, { app_metadata: { user_role: 'owner' } })`
    6. UPDATE `owner_invitations` SET `status = 'accepted'`
    7. Return 200
  - Unit tests: missing `owner_invitation_id` in metadata → 404; expired → 410; already accepted → 409; success → user `app_metadata` updated; invitation `status = 'accepted'`

- [ ] **Accept-owner page**
  `app/(auth)/invite/accept-owner/page.tsx`

  - Calls `supabase.auth.verifyOtp({ email, token, type: 'invite' })` from URL params
  - On success: POST `complete-owner-signup` → on 200: `refreshSession()` → redirect to `/owner/tenants`
  - Error states: expired (410), already used (409), unknown error
  - Unit test: renders error states correctly; calls `refreshSession` before redirect

---

## Phase 4 — Frontend Hooks

**Goal:** All four hooks are implemented with TanStack Query; unit tests confirm query structure, cache key invalidation, and mutation error handling (including DB trigger errors).

**Verification:** `npm test -- hooks/iam` — all Vitest tests pass.

### Tasks

- [ ] **`useIAMUsers(filters, pagination)`**
  `hooks/iam/useIAMUsers.ts`

  Wraps GET `/functions/v1/iam-users` via `supabase.functions.invoke`. Cache key: `['iam-users', filters]`. `staleTime: 30_000`.
  Unit tests: correct query key per filter combination; empty filter → all users fetched; returns `{ items, total, isLoading, error }`

- [ ] **`useUserDetail(userId)`**
  `hooks/iam/useUserDetail.ts`

  Wraps GET `/functions/v1/iam-user-detail?userId=`. Cache key: `['user-detail', userId]`. `staleTime: 60_000`.
  Unit test: called with userId → correct URL constructed; 404 response → `error` set

- [ ] **`useOwnerList()`**
  `hooks/iam/useOwnerList.ts`

  Wraps GET `/functions/v1/list-owners`. Cache key: `['owner-list']`. `staleTime: 60_000`.
  Unit test: returns `owners` array

- [ ] **`useIAMMutations()`**
  `hooks/iam/useIAMMutations.ts`

  Exposes:
  - `changeRole(tenantId, userId, newRole)` — direct Supabase UPDATE; if promoting to `tenant_admin`, also sets `client_id = null`
  - `reassignClient(tenantId, userId, clientId | null)` — direct Supabase UPDATE
  - `removeMembership(tenantId, userId)` — direct Supabase DELETE
  - `revokeInvitation(invitationId)` — direct Supabase UPDATE `status = 'expired'`
  - `resendInvitation(invitationId)` — POST `/functions/v1/resend-invite`
  - `inviteOwner(email)` — POST `/functions/v1/invite-owner`

  Each mutation on success invalidates relevant cache keys:
  - `changeRole`, `removeMembership`, `reassignClient` → invalidate `['iam-users']` and `['user-detail', userId]`
  - `revokeInvitation`, `resendInvitation` → invalidate `['iam-users']`, `['user-detail', userId]`
  - `inviteOwner` → invalidate `['owner-list']`

  Unit tests:
  - `changeRole` to `tenant_admin` → `client_id` set to `null` in UPDATE payload
  - DB trigger error (`last_admin_removal`) → mutation `error` contains the Postgres message
  - DB trigger error (`last_admin_demotion`) → same
  - `revokeInvitation` → UPDATE with `status = 'expired'`; cache invalidated on success
  - `resendInvitation` → 429 response → error exposed to caller

---

## Phase 5 — User Directory Page

**Goal:** `/owner/iam/users` renders the cross-tenant member table with working filters, search, and the invite dialog.

**Verification:** Navigate to `/owner/iam/users` as owner → table loads; filter by tenant → rows scoped; search by partial email → filtered; click invite button → `InviteUserDialog` opens and submits correctly.

### Tasks

- [ ] **`UserDirectoryTable` component**
  `components/iam/UserDirectoryTable.tsx`

  Props: `items: IAMMember[]`, `total: number`, `onPageChange`, `onFilterChange`.
  Columns: Email, Role (badge), Tenant, Client (or "Unassigned" badge), Joined. Each row links to `/owner/iam/users/[userId]`.
  Unit test: renders all columns; "Unassigned" badge shown when `clientId = null`; row click navigates correctly

- [ ] **Filter bar**
  `components/iam/UserDirectoryFilters.tsx`

  Controlled inputs: tenant select (populated from `useTenants()`), role select, assigned toggle, email search (debounced 300ms).
  Unit test: changing tenant filter calls `onFilterChange` with updated params; debounce delays `onFilterChange`

- [ ] **`InviteUserDialog` component**
  `components/iam/InviteUserDialog.tsx`

  Props: `defaultTenantId?`, `onSuccess`.
  Fields: email (required), role (select: `tenant_admin` / `tenant_user`), tenant (dropdown — disabled if `defaultTenantId` provided), client (dropdown, visible only when `role = 'tenant_user'`, populated by `useClients(tenantId)`).
  On submit: calls `useMetaSyncMutation` → POST `/functions/v1/invite`.
  Unit tests: client dropdown hidden for `tenant_admin`; client dropdown populates on tenant change; 409 duplicate → form error shown; success → `onSuccess` called

- [ ] **`/owner/iam/users/page.tsx`**
  Composes `UserDirectoryFilters` + `UserDirectoryTable` + `InviteUserDialog`. Reads filter state from URL search params (for shareable URLs). Pagination state in URL params (`?page=`).
  Unit test: filter state synced with URL; page reset to 0 on filter change

---

## Phase 6 — User Detail Page

**Goal:** `/owner/iam/users/[userId]` shows full user context and all inline actions work (role change, client reassignment, remove membership, revoke/resend invitation).

**Verification:** Navigate to a user's detail page → memberships and invitations listed; change role → row updates; demote last admin → error toast; remove membership → confirmation dialog; row disappears after removal.

### Tasks

- [ ] **`UserDetailCard` component**
  `components/iam/UserDetailCard.tsx`

  Props: `user: AuthUser`. Displays: email, provider icon (Google / email), account created date.
  Unit test: renders provider icon correctly; email shown

- [ ] **`LastAdminBadge` component**
  `components/iam/LastAdminBadge.tsx`

  Props: `tenantId: string`, `memberships: MembershipDetail[]`.
  Computed: `isLastAdmin = memberships.filter(m => m.tenantId === tenantId && m.role === 'tenant_admin').length === 1`.
  Renders a `Badge` with tooltip: "Last admin — cannot demote or remove".
  Unit test: shown when admin count for tenant = 1; hidden when ≥ 2 admins

- [ ] **`MembershipRow` component**
  `components/iam/MembershipRow.tsx`

  Props: `membership: MembershipDetail`, `allMemberships: MembershipDetail[]`, `onChangeRole`, `onReassignClient`, `onRemove`.
  - Role: select dropdown (`tenant_admin` / `tenant_user`); disabled if `isLastAdmin`
  - Client: select dropdown (populated from `useClients(membership.tenantId)`); only shown for `tenant_user`; includes "Unassigned" option
  - Remove: button; disabled if `isLastAdmin`; shows `ConfirmationDialog` before calling `onRemove`
  Unit tests:
  - Role dropdown disabled when `isLastAdmin = true`
  - Remove button disabled when `isLastAdmin = true`
  - Selecting new role calls `onChangeRole`
  - Remove button click opens confirmation; confirm calls `onRemove`; cancel does not

- [ ] **`InvitationRow` component**
  `components/iam/InvitationRow.tsx`

  Props: `invitation: InvitationDetail`, `onResend`, `onRevoke`.
  - Resend: visible when `status = 'pending'`; shows spinner during mutation
  - Revoke: visible when `status = 'pending'`; requires `ConfirmationDialog`
  - Status badge: pending (yellow), accepted (green), expired (gray)
  Unit tests: resend button absent for non-pending; revoke shows confirmation; 429 from resend → error toast

- [ ] **`/owner/iam/users/[userId]/page.tsx`**
  Composes `UserDetailCard` + `MembershipRow` list + `InvitationRow` list.
  DB trigger errors (`last_admin_removal`, `last_admin_demotion`) caught in `useIAMMutations` and surfaced as toast.
  Unit test: renders "No memberships" when empty; renders "No invitations" when empty; toast shown on trigger error

---

## Phase 7 — Invitations Page

**Goal:** `/owner/iam/invitations` lists all pending invitations across all tenants with resend/revoke actions; stale invitations flagged and auto-expired.

**Verification:** Navigate to `/owner/iam/invitations` → pending invitations listed; filter by tenant → scoped; expired-but-pending rows flagged visually; revoke one → confirmation → row disappears.

### Tasks

- [ ] **`InvitationsPage` component**
  `app/owner/iam/invitations/page.tsx`

  Uses `useIAMUsers` with status filter tunnelled through — OR a dedicated `useIAMInvitations` hook wrapping `supabase.from('invitations').select(...).eq('status', 'pending')` directly (owner RLS bypass allows this).

  Implement `useIAMInvitations(filters)`:
  `hooks/iam/useIAMInvitations.ts`
  Direct Supabase query: `invitations` joined with `tenants` and `clients` WHERE `status = 'pending'`. Filters: `tenantId?`, `role?`. Cache key: `['iam-invitations', filters]`.

  On page load: for rows where `expires_at < now()` and `status = 'pending'`, batch UPDATE to `status = 'expired'` then invalidate cache (background fire-and-forget mutation).

  Unit tests:
  - Returns only pending rows
  - Expired rows trigger background update on mount
  - Filter by tenant applied

- [ ] **`InvitationTableRow` component** (list view variant of `InvitationRow`)
  Columns: email, tenant, role, client (or "None"), invited by (email), created, expiry.
  Expiry column: red text + warning icon when `expires_at < now()`.
  Actions: Resend, Revoke — same logic as in user detail page.
  Unit test: expired row shows red expiry; both actions call correct mutation

---

## Phase 8 — Owners Page

**Goal:** `/owner/iam/owners` lists all owner accounts; owner can invite a new owner; full invite-owner → accept → owner role assignment flow works.

**Verification:** Navigate to `/owner/iam/owners` → own account listed; click "Invite Owner" → fill email → submit → owner_invitations row created in local DB; use local Supabase inbucket to find invite email → follow link → accept OTP → confirm `raw_app_meta_data.user_role = 'owner'` set via Supabase Studio.

### Tasks

- [ ] **`OwnerRow` component**
  `components/iam/OwnerRow.tsx`

  Props: `owner: AuthUser`, `isSelf: boolean`.
  Displays: email, provider icon, joined date.
  Remove button: disabled with tooltip "Cannot remove your own owner account" when `isSelf = true`.
  Note: owner removal is not implemented in Phase 1 (additive only — deferred to a future spec). Remove button shown as disabled/placeholder.
  Unit test: `isSelf = true` → button disabled

- [ ] **`InviteOwnerDialog` component**
  `components/iam/InviteOwnerDialog.tsx`

  Single email field. On submit: calls `useIAMMutations.inviteOwner(email)` → POST `/functions/v1/invite-owner`.
  Success: toast "Invitation sent to [email]"; invalidate `['owner-list']`.
  409: form error "A pending invitation already exists for this email".
  Unit tests: submit calls `inviteOwner`; 409 shows form error; success shows toast

- [ ] **`/owner/iam/owners/page.tsx`**
  Uses `useOwnerList()`. Renders `OwnerRow` per owner. Current user identified via `useSession().user.id` → `isSelf`.
  Unit test: renders all owners; current user's row has disabled remove button

- [ ] **`/invite/accept-owner/page.tsx`** (Phase 3 task — ensure complete)
  Verify it handles all error states (410, 409, generic) with user-facing messages.
  Unit test: 410 response → "This invitation has expired. Ask an owner to re-invite you." shown; 200 → `refreshSession` called

---

## Phase 9 — Navigation & IAM Index

**Goal:** IAM section is reachable from the owner navigation; `/owner/iam` redirects to `/owner/iam/users`; all four sub-pages are linked in a secondary nav.

**Verification:** Sign in as owner → sidebar shows "IAM" section with Users, Invitations, Owners links; clicking each navigates correctly; non-owner session → IAM links absent.

### Tasks

- [ ] **Owner sidebar navigation**
  Add "IAM" group to the owner sidebar (wherever `app/owner/layout.tsx` or equivalent renders navigation):
  - Users → `/owner/iam/users`
  - Invitations → `/owner/iam/invitations`
  - Owners → `/owner/iam/owners`
  Unit test: `<RoleGuard role="owner">` wraps IAM nav items; non-owner → items not rendered

- [ ] **`/owner/iam/page.tsx` redirect**
  ```ts
  import { redirect } from 'next/navigation'
  export default function IAMIndexPage() { redirect('/owner/iam/users') }
  ```

- [ ] **IAM secondary nav**
  `components/iam/IAMNav.tsx` — tab-style nav within the IAM section: Users · Invitations · Owners. Active state from `usePathname()`.
  Unit test: correct tab active per pathname

---

## Phase 10 — E2E Tests & Documentation

**Goal:** Full Playwright E2E suite covering all critical IAM flows; docs updated.

**Verification:** `npx playwright test tests/e2e/iam` — all tests pass against local Supabase.

### Tasks

- [ ] **E2E: Invite tenant admin from owner IAM**
  `tests/e2e/iam/invite-tenant-admin.spec.ts`
  - Sign in as owner → `/owner/iam/users` → click Invite → fill email + select tenant + role = admin → submit
  - Verify: invitation appears in `/owner/iam/invitations`; row in `invitations` table (check via Supabase Studio)

- [ ] **E2E: Role change and last-admin guard**
  `tests/e2e/iam/role-change.spec.ts`
  - Navigate to user detail page → change a `tenant_user` to `tenant_admin` → confirm row updates
  - Demote the only admin of a tenant → error toast "Cannot demote" shown; role unchanged

- [ ] **E2E: Remove membership**
  `tests/e2e/iam/remove-membership.spec.ts`
  - Navigate to user detail → click Remove on a non-last-admin membership → confirmation dialog → confirm → row disappears
  - Attempt Remove on last admin → button disabled; no dialog shown

- [ ] **E2E: Revoke and resend invitation**
  `tests/e2e/iam/invitation-actions.spec.ts`
  - Navigate to `/owner/iam/invitations` → revoke a pending invitation → confirmation → row disappears
  - Resend a pending invitation → success toast; `expires_at` updated in DB

- [ ] **E2E: Invite owner flow**
  `tests/e2e/iam/invite-owner.spec.ts`
  - Owner sends owner invite → row in `owner_invitations`
  - Open local Supabase inbucket → retrieve OTP → navigate to `/invite/accept-owner?token=` → complete signup
  - Verify: new owner visible in `/owner/iam/owners`; `raw_app_meta_data.user_role = 'owner'` in Supabase Studio

- [ ] **Update `docs/edge-functions.md`**
  Add entries for: `iam-users`, `iam-user-detail`, `list-owners`, `resend-invite`, `invite-owner`, `complete-owner-signup` — with path, auth, request/response shape, error codes.

- [ ] **Update `docs/authentication.md`**
  Add section: "Owner Account Provisioning" — describes `invite-owner` + `complete-owner-signup` + `/invite/accept-owner` flow.

- [ ] **Update `docs/database.md`**
  Add `owner_invitations` table; document `invitations.updated_at` column and trigger; document `last_admin_guard` trigger.

- [ ] **Update `docs/index.md`**
  No new files to add; verify all existing links are valid after additions.
