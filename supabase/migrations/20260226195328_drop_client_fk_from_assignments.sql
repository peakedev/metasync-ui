-- Drop the FK constraint on user_client_assignments.client_id.
--
-- The Supabase `clients` table is not populated — clients are managed
-- entirely on the MetaSync backend. The client_id column stores MetaSync
-- client IDs directly (which happen to be UUIDs). The FK to clients(id)
-- was causing all INSERT attempts to fail since no matching rows exist.

ALTER TABLE user_client_assignments
  DROP CONSTRAINT user_client_assignments_client_id_fkey;
