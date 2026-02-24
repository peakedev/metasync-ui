-- Re-apply the token hook WITHOUT the client_id SELECT.
-- Migration 20260223215544 was already applied to remote with the OLD content
-- (which still selected client_id), so content edits to that file were ignored
-- by db push. Meanwhile 20260223222313 dropped the client_id column, causing
-- the old hook to crash. This migration fixes it.

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
