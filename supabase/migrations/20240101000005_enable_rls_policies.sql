-- Enable RLS on all tables and create policies

-- ============ tenants ============
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_anon ON tenants
  FOR ALL TO anon USING (false);

CREATE POLICY tenant_isolation ON tenants
  FOR ALL TO authenticated
  USING (
    id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
  );

-- ============ clients ============
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_anon ON clients
  FOR ALL TO anon USING (false);

CREATE POLICY tenant_isolation ON clients
  FOR ALL TO authenticated
  USING (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
  );

-- ============ tenant_memberships ============
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_anon ON tenant_memberships
  FOR ALL TO anon USING (false);

CREATE POLICY tenant_isolation ON tenant_memberships
  FOR ALL TO authenticated
  USING (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
  );

-- ============ invitations ============
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_anon ON invitations
  FOR ALL TO anon USING (false);

CREATE POLICY tenant_isolation ON invitations
  FOR ALL TO authenticated
  USING (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
  );
