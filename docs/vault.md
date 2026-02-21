# Supabase Vault

MetaSync API keys (admin keys and client API keys) are stored in **Supabase Vault**. They are encrypted at rest using AEAD (libsodium). The encryption key is managed by Supabase and never stored in the database.

Vault is accessed exclusively by Supabase Edge Functions using the **service role key**. The frontend client (anon key + user JWT) never queries Vault.

## Secret Naming Convention

| Secret name | Contents |
|---|---|
| `tenant_{tenant_id}_admin_key` | MetaSync admin API key for the tenant |
| `client_{client_id}_api_key` | MetaSync client API key |

`tenant_id` and `client_id` are the UUIDs from the `tenants` and `clients` tables respectively.

## Operations (Edge Functions only)

All operations use the `vault` schema functions or the `vault.decrypted_secrets` view. These require the Supabase service role key — available in edge functions via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.

### Store a new secret

```sql
SELECT vault.create_secret(
  'the-api-key-value',
  'tenant_abc123_admin_key',
  'MetaSync admin key for tenant abc123'
);
-- Returns: uuid (the vault secret ID)
```

Store the returned UUID in `clients.vault_secret_id` or as a reference on the tenant record for fast lookup.

### Read (decrypt) a secret

```sql
SELECT secret
  FROM vault.decrypted_secrets
 WHERE name = 'tenant_abc123_admin_key';
```

Or by ID (faster, avoids name scan):

```sql
SELECT secret
  FROM vault.decrypted_secrets
 WHERE id = '<vault_secret_id>';
```

### Update (rotate) a secret

```sql
SELECT vault.update_secret(
  '<vault_secret_id>',
  'the-new-api-key-value'
);
```

Used when a client API key is rotated via `POST /clients/{id}/rotate-key`. The `vault_secret_id` on the `clients` row does not change.

### Delete a secret

```sql
DELETE FROM vault.secrets WHERE id = '<vault_secret_id>';
```

Called when a client is permanently deleted.

## Usage in Edge Functions

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Read secret by name
const { data, error } = await supabaseAdmin
  .from('vault.decrypted_secrets')
  .select('secret')
  .eq('name', `tenant_${tenantId}_admin_key`)
  .single()

if (error || !data) {
  return new Response(JSON.stringify({ error: 'credentials_not_configured' }), { status: 503 })
}

const apiKey = data.secret
```

## Security Notes

- `vault.decrypted_secrets` returns plaintext in memory when queried. Treat access to this view as a highly sensitive permission.
- The service role key must never be exposed to the browser. It is only set as an edge function secret: `npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`
- Secrets are encrypted in database backups and replication streams — only decrypted at query time.
