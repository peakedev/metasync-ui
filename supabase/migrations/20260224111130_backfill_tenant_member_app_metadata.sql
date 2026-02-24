-- Backfill raw_app_meta_data for tenant members whose app_metadata is missing
-- user_role / tenant_id. This covers existing confirmed users who were added
-- to a tenant via the create-user edge function before it started calling
-- admin.updateUserById().

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data
  || jsonb_build_object('user_role', tm.role, 'tenant_id', tm.tenant_id)
FROM tenant_memberships tm
WHERE tm.user_id = u.id
  AND (
    u.raw_app_meta_data ->> 'user_role' IS DISTINCT FROM tm.role
    OR (u.raw_app_meta_data ->> 'tenant_id')::uuid IS DISTINCT FROM tm.tenant_id
  );
