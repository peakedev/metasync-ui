# Edge Functions

All edge functions are located in `supabase/functions/`. They run on Deno and are deployed to the Supabase "Metasync UI" project. A shared CORS configuration lives in `supabase/functions/_shared/cors.ts`.

## Auth Contract

Every function follows the same authentication pattern:

1. Extract the `Authorization` header from the incoming request.
2. Create a Supabase client with that header attached.
3. Call `supabase.auth.getUser()` to validate the JWT and extract the user.
4. If the token is absent, invalid, or expired, return `401` immediately.
5. Read `app_metadata` from the user object for role and tenant claims.

## Local Development

```bash
npx supabase functions serve           # Serve all functions with hot-reload
npx supabase functions serve proxy     # Serve a single function
```

Functions are available at `http://localhost:54321/functions/v1/<name>`.

## Deployment

```bash
npx supabase functions deploy          # Deploy all functions to remote project
npx supabase functions deploy proxy    # Deploy a single function
npx supabase secrets set KEY=value     # Set a secret accessible via Deno.env.get('KEY')
```

---

## `proxy`

**Path:** `POST /functions/v1/proxy`
**Source:** `supabase/functions/proxy/index.ts`
**Auth:** JWT required (any authenticated user)

Forwards requests to the caller's tenant MetaSync backend using the appropriate API key retrieved from Supabase Vault. Also handles a special `store_admin_key` action for saving admin API keys to Vault.

### Request body

```json
{
  "tenantId": "<uuid>",
  "path": "/jobs",
  "method": "GET",
  "body": {}
}
```

### Logic

1. Validate JWT; extract `tenant_id`, `user_role`, `client_id` from `app_metadata`.
2. If `body.action === "store_admin_key"`, delegate to the admin key storage handler (see below).
3. Assert `claims.tenant_id === tenantId` (owner skips this check).
4. Look up `backend_url` from the `tenants` table using a service role client.
5. Determine the Vault secret name based on the user's role:
   - `tenant_admin` or `owner` -> `tenant_{tenantId}_admin_key`
   - `tenant_user` with a client -> `client_{client_id}_api_key`
   - `tenant_user` without a client -> return 403 `no_client`
6. Retrieve the API key from Vault using `rpc('get_secret_by_name')` with a fallback to querying `vault.decrypted_secrets`.
7. Forward the request: `fetch(backend_url + path, { method, body, headers: { api_key } })`.
8. Return the MetaSync response verbatim (status code and body).

### Store admin key action

When `body.action === "store_admin_key"`, the function stores or updates the tenant's admin API key in Vault:

```json
{
  "action": "store_admin_key",
  "tenantId": "<uuid>",
  "key": "<api-key-value>"
}
```

Only `tenant_admin` or `owner` roles can perform this action. The function checks for an existing secret and either updates or creates it.

### Error codes

| Code | Error key | Reason |
|---|---|---|
| 400 | `missing_params` | `tenantId` or `path` not provided |
| 401 | `missing_jwt` / `invalid_jwt` | No or invalid JWT |
| 403 | `tenant_mismatch` | JWT `tenant_id` does not match requested `tenantId` |
| 403 | `no_client` | Tenant user has no client assignment |
| 503 | `credentials_not_configured` | Backend URL or Vault secret not found |
| 503 | `backend_unreachable` | MetaSync backend did not respond (catch block) |

---

## `stream-proxy`

**Path:** `GET /functions/v1/stream-proxy`
**Source:** `supabase/functions/stream-proxy/index.ts`
**Auth:** JWT required

SSE-specific proxy for the chat streaming interface. Pipes the MetaSync SSE stream directly to the browser without buffering or modifying chunks.

### Query parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `tenantId` | `string` | Yes | Target tenant UUID |
| `model` | `string` | Yes | Model name from tenant's configured models |
| `temperature` | `number` | Yes | Sampling temperature |
| `userPrompt` | `string` | Yes | The user's chat message |
| `additionalPrompts` | `string` | No | JSON-encoded array of additional prompt IDs |

### Logic

1. Validate JWT; extract claims.
2. Assert tenant access (same check as `proxy`).
3. Look up `backend_url` from the `tenants` table.
4. Retrieve the API key from Vault (same credential logic as `proxy`).
5. Build the request body with `model`, `temperature`, `userPrompt`, and optional `additionalPrompts`.
6. `POST {backend_url}/stream` with headers `Accept: text/event-stream` and `api_key`.
7. Pipe the response body directly: `new Response(metasyncResponse.body, { headers: { 'Content-Type': 'text/event-stream' } })`.

The response includes a `X-Stream-Id` header forwarded from the MetaSync backend when present.

### Error codes

Same as `proxy`, plus:

| Code | Error key | Reason |
|---|---|---|
| SSE `event: error` | (inline) | Error received mid-stream from MetaSync; sent as an SSE event so the browser can render an inline error bubble |

---

## `invite`

**Path:** `POST /functions/v1/invite`
**Source:** `supabase/functions/invite/index.ts`
**Auth:** JWT required; caller must be `tenant_admin` (own tenant) or `owner`

Creates an invitation record and triggers the Supabase invite email.

### Request body

```json
{
  "email": "user@example.com",
  "role": "tenant_user",
  "tenantId": "<uuid>",
  "clientId": "<uuid>"
}
```

`clientId` is optional. If omitted, the invited user joins the tenant with no client assignment.

### Logic

1. Validate JWT; assert `user_role` is `tenant_admin` or `owner`.
2. Assert tenant access (owner skips the check).
3. Check for an existing pending invitation for the same email + tenant; return 409 if found.
4. `INSERT INTO invitations (tenant_id, email, role, client_id, invited_by)` with `status = 'pending'`.
5. `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: APP_URL/invite/accept, data: { invitation_id } })`.
6. Return `201 Created` with the invitation record.

### Error codes

| Code | Error key | Reason |
|---|---|---|
| 400 | `missing_params` | `email`, `role`, or `tenantId` not provided |
| 401 | `missing_jwt` / `invalid_jwt` | No or invalid JWT |
| 403 | `forbidden` | Caller is not `tenant_admin` or `owner` |
| 403 | `tenant_mismatch` | Non-owner trying to invite to another tenant |
| 405 | `method_not_allowed` | Request method is not POST |
| 409 | `duplicate_invitation` | Active pending invitation already exists for this email + tenant |
| 500 | `internal_error` | Database insert or other internal failure |

---

## `complete-signup`

**Path:** `POST /functions/v1/complete-signup`
**Source:** `supabase/functions/complete-signup/index.ts`
**Auth:** JWT required (newly invited user, immediately after `verifyOtp`)

Finalizes onboarding by reading the invitation record and creating the `tenant_memberships` row.

### Request body

None. The function reads `invitation_id` from `user.user_metadata` (set by Supabase Auth when the invite was created).

### Logic

1. Validate JWT; extract `user.user_metadata.invitation_id`.
2. If no `invitation_id` is present, return 404.
3. Fetch the invitation record from the database.
4. Validate: `status = 'pending'` (return 409 if already used).
5. Validate: `expires_at > now()` (return 410 if expired).
6. Check for existing membership in the tenant (return 409 if already a member).
7. `INSERT INTO tenant_memberships (tenant_id, user_id, role, client_id)`.
8. `UPDATE invitations SET status = 'accepted'`.
9. Return `200 OK` with `{ success: true, tenant_id }`.

The caller then calls `supabase.auth.refreshSession()` to trigger the Custom Access Token Hook and populate JWT claims.

### Error codes

| Code | Error key | Reason |
|---|---|---|
| 401 | `missing_jwt` / `invalid_jwt` | No or invalid JWT |
| 404 | `no_invitation` | No `invitation_id` in user metadata |
| 404 | `invitation_not_found` | Invitation record does not exist |
| 405 | `method_not_allowed` | Request method is not POST |
| 409 | `invitation_already_used` | Invitation status is not `'pending'` |
| 409 | `already_member` | User already has a membership in this tenant |
| 410 | `invitation_expired` | `expires_at < now()` |
| 500 | `internal_error` | Membership insert or other internal failure |
