-- Re-apply owner_invitations table, updated_at on invitations, and last-admin guard
-- (reverted by 20260221230902)

-- 1. Owner invitations table
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

-- 2. invitations.updated_at column + trigger
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

-- 3. Last-admin guard trigger
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
