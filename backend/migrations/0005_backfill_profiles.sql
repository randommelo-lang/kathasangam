-- Backfill profiles for any users who signed up before the triggers were in place
INSERT INTO public.profiles (id, username, role)
SELECT 
  id, 
  COALESCE(split_part(email, '@', 1), 'user_' || substr(id::text, 1, 8)) AS username, 
  'reader'::user_role AS role
FROM auth.users
ON CONFLICT (id) DO NOTHING;
