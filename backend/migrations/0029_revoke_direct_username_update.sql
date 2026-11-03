-- F-009: username modifications must go through /api/profile to enforce reserved names,
-- profanity checks, and format validation rules; authenticated users cannot update username directly.

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (avatar_url, bio, preferences)
    ON public.profiles TO authenticated;
