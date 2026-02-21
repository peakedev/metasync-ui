# Owner IAM Management — Requirements

**Linear Key:** AN
**Spec folder:** `specs/iam/`
**Depends on:** `specs/baseline/` (authentication, invitation flow, role hierarchy)

---

## 1. Introduction

This feature gives the **Owner** role full, centralised control over the platform's identity and access management (IAM). Today the owner can create tenants and invite tenant admins, but user lifecycle operations (role changes, revocation, cross-tenant visibility, client reassignment) are fragmented or undocumented. This spec defines a complete owner IAM console.

**Scope:** Owner-facing pages under `/owner/iam/`. Does not change the tenant admin's own user management scope (already covered in baseline FR-USER-1).

---

## 2. Alignment with Product Vision

The MetaSync platform is a multi-tenant LLM operations hub. Its value depends on controlled, auditable access to AI pipelines and client API keys. Full owner IAM control is a prerequisite for:

- Onboarding new tenants reliably (invite first admin, verify setup)
- Responding to security incidents (revoke access, rotate keys)
- Maintaining clean tenant boundaries (prevent orphaned users / stale memberships)
- Scaling to many tenants without per-tenant manual support

---

## 3. Functional Requirements

### FR-IAM-1 — Cross-Tenant User Directory

**Story:** As an owner, I want to see all users across all tenants in one place, so that I can identify access issues and act on them without navigating per-tenant screens.

**Acceptance Criteria:**
- Page `/owner/iam/users` lists all `tenant_memberships` rows (no tenant filter)
- Columns: user email, role, tenant name, client name (or "Unassigned"), membership created date
- Filterable by: tenant, role, client assignment status (assigned / unassigned)
- Searchable by email
- Pagination (100 rows per page)
- Rows link to per-user detail page `/owner/iam/users/[userId]`

---

### FR-IAM-2 — Per-User Detail & Actions

**Story:** As an owner, I want a single page per user showing all their tenant memberships and invitations, so that I can manage their access holistically.

**Acceptance Criteria:**
- Page `/owner/iam/users/[userId]` shows:
  - User email, auth provider (email/Google), account created date
  - All `tenant_memberships` rows for that user (tenant name, role, client assignment)
  - All `invitations` rows for that user (tenant, role, status, expiry)
- Owner can **remove a membership** (DELETE `tenant_memberships` row) for any tenant from this page
- Removing a membership does not delete the Supabase auth account
- If removal leaves a tenant with zero admins, show confirmation warning before proceeding
- After membership removal, affected user's JWT claims update on next session refresh (Custom Token Hook)

---

### FR-IAM-3 — Invite Tenant Admin

**Story:** As an owner, I want to invite a new tenant admin to any tenant, so that I can bootstrap or reinforce admin capacity without navigating to the tenant-specific screen.

**Acceptance Criteria:**
- Owner can invoke the invitation flow from `/owner/iam/users` and `/owner/tenants/[id]`
- Form: email, tenant (dropdown of all non-deleted tenants), role fixed to `tenant_admin`
- Calls `POST /functions/v1/invite` with `{ tenantId, email, role: 'tenant_admin' }` (owner JWT)
- On success: invitation record created, Supabase invite email dispatched
- If a pending invitation already exists for that email+tenant: show error "Pending invitation already exists"
- Newly created invitation appears in the pending invitations list immediately (optimistic update)

---

### FR-IAM-4 — Invite Tenant User

**Story:** As an owner, I want to invite a tenant user to any tenant with optional client pre-assignment, so that I can provision end-users during initial tenant setup.

**Acceptance Criteria:**
- Form: email, tenant (dropdown), role fixed to `tenant_user`, client (dropdown of clients for the selected tenant — optional)
- Calls `POST /functions/v1/invite` with `{ tenantId, email, role: 'tenant_user', clientId? }` (owner JWT)
- Same duplicate-check and optimistic update behaviour as FR-IAM-3
- If client is pre-assigned, the accepted membership has `client_id` populated immediately

---

### FR-IAM-5 — Resend Invitation

**Story:** As an owner, I want to resend a pending invitation that has not been accepted, so that users who missed the email can still onboard.

**Acceptance Criteria:**
- Available on: pending invitations list under `/owner/iam/invitations` and the per-user detail page
- Action: re-calls `supabase.auth.admin.inviteUserByEmail()` for the same email + resets `expires_at` to `now() + 7 days`
- Invitation `status` stays `'pending'`; `created_at` does not change
- Only available for invitations with `status = 'pending'`
- Implemented via a new `POST /functions/v1/resend-invite` edge function (owner or tenant_admin JWT)

---

### FR-IAM-6 — Revoke Invitation

**Story:** As an owner, I want to cancel a pending invitation before it is accepted, so that I can correct mistakes or remove access that should not have been granted.

**Acceptance Criteria:**
- Available on: pending invitations list and per-user detail page
- Action: `UPDATE invitations SET status = 'expired'` (via edge function or direct Supabase call with owner JWT; RLS owner bypass permits this)
- Only invitations with `status = 'pending'` can be revoked
- Revoked invitation cannot be accepted (complete-signup validates `status = 'pending'`)
- Confirmation dialog required before revocation

---

### FR-IAM-7 — Change User Role Within Tenant

**Story:** As an owner, I want to promote a tenant_user to tenant_admin or demote a tenant_admin to tenant_user, so that I can adjust access as responsibilities change.

**Acceptance Criteria:**
- Action available on the per-user detail page membership rows
- Updates `tenant_memberships.role` for the targeted `(tenant_id, user_id)` row
- Demoting last admin: show blocking error "Cannot demote — tenant must have at least one admin"
- Promoting to `tenant_admin`: `client_id` on the membership is set to `null` (admins use the admin key, not a client key)
- After role change, JWT claims update on next session refresh
- Implemented via direct Supabase call; no edge function required (owner RLS bypass handles it)

---

### FR-IAM-8 — Reassign Client

**Story:** As an owner, I want to change which client a tenant user is assigned to, so that I can respond to operational changes without requiring tenant admin involvement.

**Acceptance Criteria:**
- Action on per-user detail page membership rows (tenant_user rows only)
- Dropdown of clients belonging to that tenant (only `enabled = true` clients)
- Includes option "Unassigned" (sets `client_id = null`)
- Updates `tenant_memberships.client_id`
- Implemented via direct Supabase call (owner RLS bypass)
- JWT claims update on next session refresh

---

### FR-IAM-9 — Pending Invitations List

**Story:** As an owner, I want a global list of all pending invitations across all tenants, so that I can monitor onboarding state and act on stale invitations.

**Acceptance Criteria:**
- Page `/owner/iam/invitations` lists all `invitations` rows where `status = 'pending'`
- Columns: email, tenant name, role, client (or "None"), invited by, created date, expiry date
- Filterable by: tenant, role, expiry (expired vs. active)
- Actions per row: Resend (FR-IAM-5), Revoke (FR-IAM-6)
- Expired invitations (`expires_at < now()` and `status = 'pending'`) are visually flagged and auto-marked expired on view (background update)

---

### FR-IAM-10 — Owner Account Bootstrap

**Story:** As an owner, I want to create another owner account, so that critical administrative access is not single-point-of-failure.

**Acceptance Criteria:**
- Page `/owner/iam/owners` lists all users with `user_role = 'owner'` (queried via service-role edge function, since `auth.users` is not accessible via RLS)
- Owner can invite a new owner via email: calls a new `POST /functions/v1/invite-owner` edge function
  - Edge function: creates Supabase auth invitation; on accept, sets `raw_app_meta_data.user_role = 'owner'` (via `supabase.auth.admin.updateUserById`)
  - No `tenant_memberships` row is created for owners
- Owner cannot remove their own owner account from this screen (self-protection)
- Minimum 1 owner must remain at all times

---

## 4. Non-Functional Requirements

### NFR-IAM-ARCH-1 — Edge Function Authorization
All write operations (invite, resend, revoke, role change, client reassignment) must validate the caller's JWT as `user_role = 'owner'` before executing. Direct RLS bypass (via `tenant_isolation` policy's owner check) is acceptable for read/update on `tenant_memberships` and `invitations`. Operations on `auth.users` (invite owner, list owners) require the service role key and must go through edge functions.

### NFR-IAM-ARCH-2 — No Client-Side Secret Access
Owner API calls to manage memberships use the anon key + owner JWT. Operations requiring the service role (invite owner, list auth.users) are proxied through edge functions. The service role key never reaches the browser.

### NFR-IAM-ARCH-3 — JWT Claim Staleness
Role and client assignment changes take effect on the affected user's **next session refresh** (token expiry or explicit `refreshSession()` call). The UI must not imply immediate enforcement. Owner/admin UIs should note "Changes take effect on user's next login/session refresh."

### NFR-IAM-PERF-1 — List Query Performance
`/owner/iam/users` query joins `tenant_memberships`, `tenants`, `clients`, and `auth.users`. Must complete within 500 ms for up to 10,000 membership rows. Use indexed FK columns; avoid N+1 queries (fetch with Supabase `.select()` join syntax).

### NFR-IAM-SEC-1 — Owner-Only Routes
All `/owner/iam/*` routes are guarded by the existing middleware check `app_metadata.user_role === 'owner'`. Non-owner users receive 403 / redirect to their scoped dashboard.

### NFR-IAM-SEC-2 — Last Admin Protection
Any operation that would leave a tenant with zero `tenant_admin` memberships must be blocked at both the UI (disabled action + tooltip) and the edge function / RLS level (server-side validation before UPDATE/DELETE).

### NFR-IAM-REL-1 — Invitation Idempotency
Resend invitation must be idempotent: calling it twice in quick succession produces only one updated `expires_at` and one email sent. The edge function should debounce or check `updated_at` recency.

### NFR-IAM-USAB-1 — Confirmation for Destructive Actions
Removing a membership and revoking an invitation require a confirmation dialog. The dialog must state the specific consequence (e.g., "User will lose access to \<Tenant Name\> immediately on next session refresh").
