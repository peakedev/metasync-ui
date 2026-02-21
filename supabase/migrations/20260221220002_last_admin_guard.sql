-- Prevent removing or demoting the last tenant_admin from a tenant
CREATE OR REPLACE FUNCTION prevent_last_admin_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Block DELETE if this is the last tenant_admin for the tenant
  IF TG_OP = 'DELETE' AND OLD.role = 'tenant_admin' THEN
    IF (SELECT COUNT(*) FROM tenant_memberships
        WHERE tenant_id = OLD.tenant_id AND role = 'tenant_admin' AND id != OLD.id) = 0 THEN
      RAISE EXCEPTION 'last_admin_removal' USING MESSAGE =
        'Cannot remove the last admin from tenant ' || OLD.tenant_id;
    END IF;
    RETURN OLD;
  END IF;

  -- Block role demotion if this is the last tenant_admin
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
