# Edge Functions

All edge functions are located in `supabase/functions/`. They run on Deno and are deployed to the Supabase "Metasync UI" project.

**Auth contract (all functions):** Every function calls `supabase.auth.getUser(token)` as step 1, using the Bearer JWT from the `Authorization` header. If the token is absent, invalid, or expired, the function returns `401` immediately — no further processing occurs.

## Local development

```bash
npx supabase functions serve          # Serve all functions with hot-reload
npx supabase functions serve proxy    # Serve a single function
```

Functions are available at `http://localhost:54321/functions/v1/<name>`.

## Deployment

```bash
npx supabase functions deploy         # Deploy all functions to remote project
npx supabase functions deploy proxy   # Deploy a single function
npx supabase secrets set KEY=value    # Set a secret accessible via Deno.env.get('KEY')
```

---

## `proxy`

**Path**: `POST|GET|PATCH|DELETE|PUT /functions/v1/proxy`
**Auth**: JWT required (any authenticated user)

Forwards a request to the caller's tenant MetaSync backend using the appropriate credential retrieved from Vault.

### Request body

```json
{
  "tenantId": "<uuid>",
  "path": "/jobs",
  "method": "GET",
  "body": { }
}
```

### Logic

1. `supabase.auth.getUser(token)` — extract `tenant_id`, `user_role`, `client_id` from `app_metadata`
2. Assert `claims.tenant_id === tenantId` (owner skips this check)
3. Determine Vault secret name:
   - `tenant_admin` or `owner` → `tenant_{tenantId}_admin_key`
   - `tenant_user` → `client_{client_id}_api_key`
4. `SELECT backend_url FROM tenants WHERE id = tenantId`
5. `SELECT secret FROM vault.decrypted_secrets WHERE name = <secret_name>`
6. `fetch(backend_url + path, { method, body, headers: { api_key: secret } })`
7. Return MetaSync response verbatim (status + body)

### Error codes

| Code | Reason |
|---|---|
| 401 | Missing or invalid JWT |
| 403 `tenant_mismatch` | JWT tenant_id does not match requested tenantId |
| 403 `no_client` | tenant_user has no client assignment |
| 503 `credentials_not_configured` | Vault secret not found |
| 503 `backend_unreachable` | MetaSync backend did not respond |

---

## `stream-proxy`

**Path**: `GET /functions/v1/stream-proxy`
**Auth**: JWT required (tenant_user or above)

SSE-specific proxy for the chat streaming interface. Pipes the MetaSync SSE stream directly to the browser.

### Query parameters

```
tenantId, model, temperature, userPrompt, additionalPrompts
```

### Logic

1. Validate JWT
2. Retrieve API key from Vault (same credential logic as `proxy`)
3. `POST {backend_url}/stream` with `Accept: text/event-stream`
4. Return `new Response(metasyncStream, { headers: { 'Content-Type': 'text/event-stream' } })`

Chunks are piped without buffering. The function does not modify the SSE payload.

### Error codes

Same as `proxy`, plus:

| Code | Reason |
|---|---|
| SSE `event: error` | Error received mid-stream from MetaSync; sent as an SSE event so the browser can render an inline error bubble |

See [streaming.md](./streaming.md) for the browser-side handling.

---

## `invite`

**Path**: `POST /functions/v1/invite`
**Auth**: JWT required; caller must be `tenant_admin` (own tenant) or `owner`

Creates an invitation record and triggers the Supabase invite email.

### Request body

```json
{
  "email": "user@example.com",
  "role": "tenant_user",
  "client_id": "<uuid>"
}
```

`client_id` is optional. If omitted the invited user lands in the tenant with no client assignment.

### Logic

1. Validate JWT; assert `user_role` is `tenant_admin` or `owner`
2. `INSERT INTO invitations (tenant_id, email, role, client_id, invited_by, status='pending')`
3. `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: APP_URL/invite/accept, data: { invitation_id } })`
4. Return `201 Created`

### Error codes

| Code | Reason |
|---|---|
| 401 | Missing or invalid JWT |
| 403 | Caller is not `tenant_admin` or `owner` |
| 409 | Active pending invitation already exists for this email + tenant |

---

## `complete-signup`

**Path**: `POST /functions/v1/complete-signup`
**Auth**: JWT required (newly invited user, immediately after `verifyOtp`)

Finalises onboarding: reads the invitation record and inserts the `tenant_memberships` row.

### Request body

None. The function reads `invitation_id` from `user.user_metadata` (set by Supabase when the invite was created).

### Logic

1. Validate JWT; extract `user.user_metadata.invitation_id`
2. `SELECT * FROM invitations WHERE id = invitation_id AND status = 'pending' AND expires_at > now()`
3. `INSERT INTO tenant_memberships (tenant_id, user_id, role, client_id)`
4. `UPDATE invitations SET status = 'accepted'`
5. Return `200 OK`

The caller then calls `supabase.auth.refreshSession()` to trigger the Custom Access Token Hook and populate JWT custom claims.

### Error codes

| Code | Reason |
|---|---|
| 401 | Missing or invalid JWT |
| 404 | Invitation record not found |
| 410 | Invitation expired (`expires_at < now()`) |
| 409 | User already has a membership in this tenant |
