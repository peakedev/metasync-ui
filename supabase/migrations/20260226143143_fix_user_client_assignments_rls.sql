-- Fix user_client_assignments RLS.
--
-- The original policy used a subquery on `clients`, but the `clients` table
-- has its own RLS.  PostgreSQL evaluates nested RLS recursively, and this
-- causes INSERT / UPDATE / DELETE on user_client_assignments to fail with
-- "new row violates row-level security policy".
--
-- Fix: create a SECURITY DEFINER helper that checks client tenant ownership
-- without being subject to the `clients` RLS, then use it in the policy.

-- 1. Helper function (SECURITY DEFINER → bypasses RLS on `clients`)
CREATE OR REPLACE FUNCTION public.client_belongs_to_tenant(
  p_client_id uuid,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM clients WHERE id = p_client_id AND tenant_id = p_tenant_id
  );
$$;

-- 2. Replace the policy
DROP POLICY IF EXISTS tenant_isolation ON user_client_assignments;

CREATE POLICY tenant_isolation ON user_client_assignments
  FOR ALL TO authenticated
  USING (
    public.client_belongs_to_tenant(
      client_id,
      ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    )
    OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
  )
  WITH CHECK (
    public.client_belongs_to_tenant(
      client_id,
      ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    )
    OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
  );
