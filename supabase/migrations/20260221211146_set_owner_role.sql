UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"user_role": "owner"}'::jsonb
WHERE email = 'karim@peake.be';
