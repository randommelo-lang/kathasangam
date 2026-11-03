-- Preference writes must go through the API's second-factor checks.
-- Revoke table and column grants, then restore the other grants from 0029.
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE (preferences) ON public.profiles FROM authenticated;
GRANT UPDATE (avatar_url, bio) ON public.profiles TO authenticated;
