# Tenant Management

## Data Model

Each tenant maps 1:1 to a deployed MetaSync backend instance.

```
tenants
  └── tenant_memberships  (users ↔ tenants, with role and optional client assignment)
  └── clients             (MetaSync clients per tenant)
  └── invitations         (pending/accepted/expired invite records)
```

See [database.md](./database.md) for full schema.

## Roles

| Role | Who manages them | How assigned |
|---|---|---|
| Owner | Self (platform-level) | `raw_app_meta_data.user_role = 'owner'` set via Supabase admin API |
| Tenant Admin | Owner | Invited via `invite` edge function with `role = 'tenant_admin'` |
| Tenant User | Tenant Admin | Invited via `invite` edge function with `role = 'tenant_user'` |

## Tenant Lifecycle (Owner)

### Create tenant
`POST /functions/v1/proxy` → MetaSync is not involved. The owner creates a row in `tenants` directly via the Supabase client (RLS allows owner access). `backend_url` is null until the tenant admin configures it.

### Configure backend URL (Tenant Admin)
1. Admin updates `tenants.backend_url` via Supabase client.
2. UI validates by calling the MetaSync `/health` endpoint through the `proxy` edge function.
3. If reachable: show "connected". If not: show "unreachable" — but the URL is still saved.

### Configure admin API key (Tenant Admin)
1. Admin submits the key via the UI.
2. The `proxy` edge function stores it in Supabase Vault: `vault.create_secret(key, 'tenant_{id}_admin_key')`.
3. The key is never returned to the browser. UI shows "configured" status only.
4. Validation: edge function makes a test call to MetaSync with the key before confirming success.

See [vault.md](./vault.md) for Vault operations.

## Invitation Flow

> Sequence diagram: [`../docs/diagrams/invitation-flow.drawio`](./diagrams/invitation-flow.drawio)

### Phase 1 — Admin sends invite

```
POST /functions/v1/invite
Headers: Authorization: Bearer <admin-jwt>
Body: { email, role, client_id? }
```

Edge function:
1. Validates JWT (must be `tenant_admin` for own tenant, or `owner`)
2. `INSERT INTO invitations (tenant_id, email, role, client_id, invited_by)`
3. `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: APP_URL/invite/accept, data: { invitation_id } })`
4. Supabase sends the invite email

### Phase 2 — User accepts invite

User clicks link → `/invite/accept?token=<otp>`

1. `supabase.auth.verifyOtp({ email, token, type: 'invite' })` — user authenticated, no custom claims yet (no membership row)
2. App calls `POST /functions/v1/complete-signup` with the user's JWT
3. Edge function:
   - Reads `invitation_id` from `user.user_metadata`
   - Validates invitation: `status = 'pending'` AND `expires_at > now()`
   - `INSERT INTO tenant_memberships (tenant_id, user_id, role, client_id)`
   - `UPDATE invitations SET status = 'accepted'`
4. `supabase.auth.refreshSession()` → Custom Token Hook re-runs → claims populated
5. Redirect to `/[tenantSlug]/dashboard`

**Expiry**: invitations expire after 7 days. If `expires_at < now()`, `complete-signup` returns 410. The UI shows an expiry screen prompting the admin to re-invite.

**Client assignment**: `client_id` in the invitation is optional. If omitted, the user lands in the tenant with no client assignment and cannot access MetaSync operations until a tenant admin assigns them via `tenant_memberships.client_id`.

## Client Management (Tenant Admin)

Clients are MetaSync-side entities. The tenant admin manages them via the MetaSync API (proxied):

| Operation | MetaSync endpoint | Local side effect |
|---|---|---|
| Create client | `POST /clients` | Store returned API key in Vault; save `vault_secret_id` on `clients` row |
| List clients | `GET /clients` | None |
| Toggle enabled | `POST /clients/{id}/toggle` | None |
| Rotate API key | `POST /clients/{id}/rotate-key` | Replace Vault secret; update `vault_secret_id` |
| Delete client | `DELETE /clients/{id}` | Delete `clients` row; orphaned Vault secret cleaned up |

The API key returned at creation/rotation is displayed **once** in the UI (copy-to-clipboard) and never retrievable in plaintext afterward.

## User Management (Tenant Admin)

Tenant users are managed via `tenant_memberships`. Key operations:

- **List users**: `SELECT * FROM tenant_memberships WHERE tenant_id = ...` (RLS-enforced)
- **Assign/reassign client**: `UPDATE tenant_memberships SET client_id = ... WHERE user_id = ...`
- **Remove user**: `DELETE FROM tenant_memberships WHERE user_id = ... AND tenant_id = ...`
- **View pending invitations**: `SELECT * FROM invitations WHERE tenant_id = ... AND status = 'pending'`
- **Revoke invitation**: `UPDATE invitations SET status = 'expired' WHERE id = ...`
