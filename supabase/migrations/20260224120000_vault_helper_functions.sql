-- Vault helper RPCs called by the proxy edge function via the service_role key.
-- All are SECURITY DEFINER so they execute as the function owner (postgres),
-- which has access to the vault schema regardless of the calling role.

CREATE OR REPLACE FUNCTION public.vault_secret_exists(secret_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM vault.secrets WHERE name = secret_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_create_secret(
  secret_value text,
  secret_name text,
  secret_description text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN vault.create_secret(secret_value, secret_name, secret_description);
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_update_secret(
  secret_name text,
  new_secret text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id FROM vault.secrets WHERE name = secret_name;
  IF _id IS NULL THEN
    RAISE EXCEPTION 'Secret "%" not found', secret_name;
  END IF;
  PERFORM vault.update_secret(_id, new_secret);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_secret_by_name(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _secret text;
BEGIN
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets
  WHERE name = secret_name;
  RETURN _secret;
END;
$$;

-- Only the service_role should call these; block anon and authenticated.
REVOKE EXECUTE ON FUNCTION public.vault_secret_exists(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vault_create_secret(text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vault_update_secret(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_secret_by_name(text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.vault_secret_exists(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_create_secret(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_update_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_secret_by_name(text) TO service_role;
