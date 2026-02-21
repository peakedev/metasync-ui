-- Create invitations table
CREATE TABLE invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('tenant_admin', 'tenant_user')),
  client_id   uuid        REFERENCES clients(id) ON DELETE SET NULL,
  invited_by  uuid        NOT NULL REFERENCES auth.users(id),
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_tenant_id ON invitations(tenant_id);
CREATE INDEX idx_invitations_email     ON invitations(email);
