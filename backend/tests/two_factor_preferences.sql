-- Run on an empty disposable database: psql -X -f backend/tests/two_factor_preferences.sql
\set ON_ERROR_STOP on
BEGIN;

CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$;
CREATE TABLE public.profiles (id UUID PRIMARY KEY, username TEXT, avatar_url TEXT, bio TEXT, preferences JSONB);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users edit own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Profiles are viewable" ON public.profiles FOR SELECT USING (true);
CREATE TABLE public.stories (title TEXT, genre TEXT, description TEXT, cover TEXT, status TEXT,
    language TEXT, license TEXT, tags TEXT, is_nsfw BOOLEAN, content_rating TEXT);
CREATE TABLE public.comments (content TEXT);
CREATE TABLE public.story_collaborators (id INT);
CREATE TABLE public.story_internal_notes (id INT);
CREATE TABLE public.story_likes (id INT);
CREATE TABLE public.story_views (id INT);
CREATE TABLE public.story_ratings (id INT);
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

\ir ../migrations/0024_enable_rls_missing_tables.sql
\ir ../migrations/0029_revoke_direct_username_update.sql

DO $$ BEGIN
    IF NOT has_column_privilege('authenticated', 'public.profiles', 'preferences', 'UPDATE') THEN
        RAISE EXCEPTION 'Expected the existing migrations to allow preference updates';
    END IF;
END $$;

-- Cover both the existing column grant and a table-level grant in an upgraded project.
GRANT UPDATE ON public.profiles TO authenticated;
\ir ../migrations/0030_protect_two_factor_preferences.sql

DO $$ BEGIN
    IF has_column_privilege('authenticated', 'public.profiles', 'preferences', 'UPDATE')
       OR NOT has_column_privilege('authenticated', 'public.profiles', 'bio', 'UPDATE') THEN
        RAISE EXCEPTION 'Unexpected profile update privileges';
    END IF;
END $$;

INSERT INTO public.profiles VALUES (md5('owner')::UUID, 'owner', '', '', '{"two_factor_email_enabled": true}');
SELECT set_config('request.jwt.claim.sub', md5('owner')::TEXT, true);
SET LOCAL ROLE authenticated;
UPDATE public.profiles SET bio = 'updated' WHERE id = auth.uid();
DO $$ BEGIN
    BEGIN
        UPDATE public.profiles SET preferences = '{"two_factor_email_enabled": false}' WHERE id = auth.uid();
        RAISE EXCEPTION 'Direct preference update unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    IF (SELECT preferences->>'two_factor_email_enabled' FROM public.profiles WHERE id = auth.uid()) <> 'true'
       OR (SELECT bio FROM public.profiles WHERE id = auth.uid()) <> 'updated' THEN
        RAISE EXCEPTION 'Profile update changed the wrong data';
    END IF;
END $$;
RESET ROLE;
ROLLBACK;
