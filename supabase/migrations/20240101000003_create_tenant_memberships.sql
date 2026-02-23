-- Create tenant_memberships table
CREATE TABLE tenant_memberships (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('tenant_admin', 'tenant_user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_memberships_tenant_id ON tenant_memberships(tenant_id);
CREATE INDEX idx_memberships_user_id   ON tenant_memberships(user_id);
