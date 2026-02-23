-- Update token hook: remove client_id injection.
-- client_id is now managed via user_client_assignments table and selected at
-- the application layer, not embedded in the JWT.

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

  IF v_claims -> 'app_metadata' IS NULL THEN
    v_claims := jsonb_set(v_claims, '{app_metadata}', '{}'::jsonb);
  END IF;

  IF (v_claims -> 'app_metadata' ->> 'user_role') = 'owner' THEN
    RETURN event;
  END IF;

  SELECT role, tenant_id
    INTO v_membership
    FROM tenant_memberships
   WHERE user_id = v_user_id
   LIMIT 1;

  IF FOUND THEN
    v_claims := jsonb_set(v_claims, '{app_metadata,user_role}', to_jsonb(v_membership.role));
    v_claims := jsonb_set(v_claims, '{app_metadata,tenant_id}', to_jsonb(v_membership.tenant_id));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;
