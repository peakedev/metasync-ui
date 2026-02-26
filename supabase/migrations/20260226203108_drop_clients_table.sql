-- Drop the clients table.
-- This table was never populated — clients are managed on MetaSync backends.
-- The only Supabase concept that matters is user_client_assignments, which stores
-- opaque MetaSync client UUIDs (no FK to this table since migration 20260226195328).

-- 1. Drop FK and column from invitations (unused, no code references it)
ALTER TABLE invitations DROP CONSTRAINT invitations_client_id_fkey;
ALTER TABLE invitations DROP COLUMN client_id;

-- 2. Drop RLS policies on clients
DROP POLICY IF EXISTS deny_anon ON clients;
DROP POLICY IF EXISTS tenant_isolation ON clients;

-- 3. Drop the clients table and its index
DROP TABLE clients;
