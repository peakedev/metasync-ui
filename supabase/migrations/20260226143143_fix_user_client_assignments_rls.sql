-- Fix user_client_assignments RLS: add explicit WITH CHECK for INSERT/UPDATE.
-- The previous policy only had a USING clause, which PostgreSQL uses as a
-- fallback for WITH CHECK. Making it explicit ensures INSERT and UPDATE
-- operations are correctly validated against the same tenant isolation rule.

DROP POLICY IF EXISTS tenant_isolation ON user_client_assignments;

CREATE POLICY tenant_isolation ON user_client_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
       WHERE c.id = user_client_assignments.client_id
         AND (
           c.tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
           OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
       WHERE c.id = user_client_assignments.client_id
         AND (
           c.tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
           OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
         )
    )
  );
