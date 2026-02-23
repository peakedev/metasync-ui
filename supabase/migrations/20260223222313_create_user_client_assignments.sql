-- Create user_client_assignments junction table (many-to-many: users <-> clients).
-- Replaces the single client_id column on tenant_memberships with a proper
-- junction that allows a user to be assigned to multiple clients.

-- 1. New table
CREATE TABLE user_client_assignments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id  uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);

CREATE INDEX idx_uca_user_id   ON user_client_assignments(user_id);
CREATE INDEX idx_uca_client_id ON user_client_assignments(client_id);

-- 2. RLS
ALTER TABLE user_client_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_anon ON user_client_assignments
  FOR ALL TO anon USING (false);

-- Tenant isolation: a user can see/manage assignments for clients that belong
-- to their own tenant, or the owner can see everything.
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
  );

-- 3. Migrate existing data and drop old column (only if it still exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'tenant_memberships'
       AND column_name  = 'client_id'
  ) THEN
    INSERT INTO user_client_assignments (user_id, client_id)
    SELECT user_id, client_id
      FROM tenant_memberships
     WHERE client_id IS NOT NULL
    ON CONFLICT (user_id, client_id) DO NOTHING;

    ALTER TABLE tenant_memberships DROP COLUMN client_id;
  END IF;
END $$;

-- 5. Grant the auth hook access to the new table
GRANT ALL ON TABLE public.user_client_assignments TO supabase_auth_admin;
