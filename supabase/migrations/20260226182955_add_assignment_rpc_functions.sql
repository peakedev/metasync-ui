-- RPC functions for managing user-client assignments.
-- SECURITY DEFINER so they run as the function owner (postgres),
-- bypassing RLS and avoiding PostgREST issues.

CREATE OR REPLACE FUNCTION public.assign_client_to_user(
  p_user_id uuid,
  p_client_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO user_client_assignments (user_id, client_id)
  VALUES (p_user_id, p_client_id)
  ON CONFLICT (user_id, client_id) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.unassign_client_from_user(
  p_user_id uuid,
  p_client_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM user_client_assignments
  WHERE user_id = p_user_id AND client_id = p_client_id;
$$;

-- Grant execute to service_role (edge functions) and authenticated
GRANT EXECUTE ON FUNCTION public.assign_client_to_user TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_client_from_user TO service_role, authenticated;
