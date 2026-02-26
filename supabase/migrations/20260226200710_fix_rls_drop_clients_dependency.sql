-- Replace the RLS policy on user_client_assignments.
--
-- The previous policy used `client_belongs_to_tenant()` which queries the
-- empty `clients` table.  Since clients are managed entirely on the MetaSync
-- backend, we must NOT reference that table.
--
-- New approach: check tenant membership via `tenant_memberships` which IS
-- populated.  A SECURITY DEFINER helper avoids nested-RLS issues.

-- 1. Drop the old policy and helper that references the empty clients table
DROP POLICY IF EXISTS tenant_isolation ON user_client_assignments;
DROP FUNCTION IF EXISTS public.client_belongs_to_tenant(uuid, uuid);

-- 2. Helper: does the target user belong to the caller's tenant?
--    SECURITY DEFINER bypasses RLS on tenant_memberships during evaluation.
CREATE OR REPLACE FUNCTION public.user_in_tenant(
  p_user_id  uuid,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_memberships
    WHERE user_id  = p_user_id
      AND tenant_id = p_tenant_id
  );
$$;

-- 3. New policy
CREATE POLICY assignment_access ON user_client_assignments
  FOR ALL TO authenticated
  USING (
    -- Users can always see their own assignments
    user_id = auth.uid()
    -- Owners can see everything
    OR (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
    -- Tenant admins can see assignments of users in their tenant
    OR (
      (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'tenant_admin'
      AND public.user_in_tenant(
            user_client_assignments.user_id,
            (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
          )
    )
  )
  WITH CHECK (
    -- Only owners or tenant admins can write
    (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'owner'
    OR (
      (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'tenant_admin'
      AND public.user_in_tenant(
            user_client_assignments.user_id,
            (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
          )
    )
  );
