-- Create clients table
CREATE TABLE clients (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metasync_client_id  text        NOT NULL,
  name                text        NOT NULL,
  enabled             boolean     NOT NULL DEFAULT true,
  vault_secret_id     uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_tenant_id ON clients(tenant_id);
