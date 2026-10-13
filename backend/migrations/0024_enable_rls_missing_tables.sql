-- SB-02 / SB-03: close Row Level Security gaps.
--
-- Five tables were created after the RLS enablement pass in 0003/0007/0008/0011/0012
-- and never had RLS turned on. With RLS disabled, access is governed purely by table
-- grants, and Supabase grants `anon` / `authenticated` on public tables by default.
-- The anon key is published to the world by GET /api/config, so these tables were
-- directly readable and writable by anyone holding it.
--
-- The API connects as a superuser role which bypasses RLS, so none of this changes
-- application behaviour: the API keeps its existing explicit ownership checks.
-- This is defence in depth for the direct PostgREST path.

-- ---------------------------------------------------------------------------
-- SB-02: enable RLS on the five unprotected tables.
-- ---------------------------------------------------------------------------

ALTER TABLE public.story_collaborators  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_likes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_ratings        ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Explicit grants, so the tables are closed even if the project was recreated
-- with different Supabase default privileges. Guarded by a role-existence check
-- so this migration also runs against a plain PostgreSQL instance.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    anon_role       text := 'anon';
    authed_role     text := 'authenticated';
    target_tables   text[] := ARRAY[
        'story_collaborators',
        'story_internal_notes',
        'story_likes',
        'story_views',
        'story_ratings'
    ];
    t               text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = anon_role) THEN
        FOREACH t IN ARRAY target_tables LOOP
            EXECUTE format('REVOKE ALL ON public.%I FROM %I', t, anon_role);
        END LOOP;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = authed_role) THEN
        FOREACH t IN ARRAY target_tables LOOP
            EXECUTE format('REVOKE ALL ON public.%I FROM %I', t, authed_role);
        END LOOP;
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- SB-03: column-level grants on profiles.
--
-- The "Users edit own profile" policy (0003:236) restricts which ROW a user may
-- update but never which COLUMNS, so any user could write `role` and `is_banned`
-- on their own row and self-promote to admin. Revoking the table-level UPDATE and
-- re-granting only the user-editable columns closes that.
--
-- Verified against models.rs::UpdateProfileRequest, which accepts exactly:
-- username, avatar_url, bio, preferences.
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (username, avatar_url, bio, preferences)
    ON public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- SB-03 (continued): same treatment for stories.
--
-- "Authors update own stories" (0003:255) also permits writing denormalised
-- counters and payout figures that the API computes server-side.
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON public.stories FROM authenticated;

GRANT UPDATE (
        title,
        genre,
        description,
        cover,
        status,
        language,
        license,
        tags,
        is_nsfw,
        content_rating
    )
    ON public.stories TO authenticated;

-- ---------------------------------------------------------------------------
-- Comments: restrict writers to the column they are allowed to set. The existing
-- "Users create comments" policy checks user_id, but the content column should not
-- be updatable by non-moderators at all.
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON public.comments FROM authenticated;

GRANT UPDATE (content) ON public.comments TO authenticated;