-- Owner invitations table for bootstrapping new owner accounts
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

-- Block all anonymous access
CREATE POLICY deny_anon ON owner_invitations FOR ALL TO anon USING (false);
