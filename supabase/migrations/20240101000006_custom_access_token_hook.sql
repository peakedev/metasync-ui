-- Custom Access Token Hook
-- Injects user_role, tenant_id, client_id into app_metadata on every JWT issuance/refresh

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims     jsonb;
  v_user_id    uuid;
  v_membership record;
BEGIN
  v_claims  := event -> 'claims';
  v_user_id := (event ->> 'user_id')::uuid;

  -- Ensure app_metadata object exists
  IF v_claims -> 'app_metadata' IS NULL THEN
    v_claims := jsonb_set(v_claims, '{app_metadata}', '{}'::jsonb);
  END IF;

  -- Owner: claims already set in app_metadata via admin API; pass through
  IF (v_claims -> 'app_metadata' ->> 'user_role') = 'owner' THEN
    RETURN event;
  END IF;

  -- Look up membership
  SELECT role, tenant_id, client_id
    INTO v_membership
    FROM tenant_memberships
   WHERE user_id = v_user_id
   LIMIT 1;

  IF FOUND THEN
    v_claims := jsonb_set(v_claims, '{app_metadata,user_role}', to_jsonb(v_membership.role));
    v_claims := jsonb_set(v_claims, '{app_metadata,tenant_id}', to_jsonb(v_membership.tenant_id));
    v_claims := jsonb_set(v_claims, '{app_metadata,client_id}', to_jsonb(v_membership.client_id));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- Grant necessary permissions for the hook to work
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon;
GRANT ALL ON TABLE public.tenant_memberships TO supabase_auth_admin;
