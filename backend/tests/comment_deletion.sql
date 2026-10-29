-- Run against an empty, disposable PostgreSQL database:
-- psql -X --dbname=<test-database> --file=backend/tests/comment_deletion.sql
-- All schema and fixture changes are rolled back, including on failure.
\set ON_ERROR_STOP on
BEGIN;

-- Minimal local Supabase Auth fixtures needed by the original migrations.
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$;

\ir ../migrations/0003_supabase_upgrade.sql
\ir ../migrations/0014_auth_deleted_trigger.sql
\ir ../migrations/0017_inline_comments.sql
\ir ../migrations/0021_add_parent_id_to_comments.sql

INSERT INTO auth.users (id, email) VALUES
    (md5('story-owner')::UUID, 'owner@example.invalid'),
    (md5('leaving-reader')::UUID, 'leaving@example.invalid'),
    (md5('remaining-reader')::UUID, 'remaining@example.invalid');
INSERT INTO stories (id, author_id, title) VALUES
    (md5('story')::UUID, md5('story-owner')::UUID, 'Another user owns this story');
INSERT INTO chapters (id, story_id, title) VALUES
    (md5('chapter')::UUID, md5('story')::UUID, 'Discussion');

-- Include nested replies, an authored intermediate node, and an inline reply.
INSERT INTO comments (id, chapter_id, user_id, content, parent_id, paragraph_index)
SELECT md5(label)::UUID, md5('chapter')::UUID, md5(owner_label)::UUID,
       label, md5(parent_label)::UUID, paragraph_index
FROM (VALUES
    ('root', 'leaving-reader', NULL, NULL::INT),
    ('child', 'remaining-reader', 'root', NULL::INT),
    ('grandchild', 'remaining-reader', 'child', NULL::INT),
    ('intermediate', 'leaving-reader', 'child', NULL::INT),
    ('deep-reply', 'remaining-reader', 'intermediate', NULL::INT),
    ('inline-reply', 'remaining-reader', 'root', 3),
    ('standalone', 'leaving-reader', NULL, NULL::INT)
) AS fixture(label, owner_label, parent_label, paragraph_index);

-- Exercise an upgrade with existing threads, rather than only a fresh schema.
\ir ../migrations/0028_preserve_comment_replies.sql

CREATE FUNCTION pg_temp.assert_remaining_replies() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT count(*) FROM comments) <> 4 OR EXISTS (
        SELECT 1
        FROM (VALUES
            ('child', NULL, NULL::INT),
            ('grandchild', 'child', NULL::INT),
            ('deep-reply', NULL, NULL::INT),
            ('inline-reply', NULL, 3)
        ) AS expected(label, parent_label, paragraph_index)
        LEFT JOIN comments c ON c.id = md5(expected.label)::UUID
        WHERE c.id IS NULL
           OR c.user_id IS DISTINCT FROM md5('remaining-reader')::UUID
           OR c.content IS DISTINCT FROM expected.label
           OR c.chapter_id IS DISTINCT FROM md5('chapter')::UUID
           OR c.parent_id IS DISTINCT FROM md5(expected.parent_label)::UUID
           OR c.paragraph_index IS DISTINCT FROM expected.paragraph_index
    ) THEN
        RAISE EXCEPTION 'Another user''s replies were deleted, changed, or incorrectly detached';
    END IF;
END;
$$;

SAVEPOINT fixtures;

-- The account endpoint first removes all comments owned by the caller.
DELETE FROM comments WHERE user_id = md5('leaving-reader')::UUID;
DELETE FROM profiles WHERE id = md5('leaving-reader')::UUID;
DELETE FROM auth.users WHERE id = md5('leaving-reader')::UUID;
SELECT pg_temp.assert_remaining_replies();
ROLLBACK TO fixtures;

-- Profile cascades and the Supabase Auth deletion trigger must also be safe.
DELETE FROM profiles WHERE id = md5('leaving-reader')::UUID;
SELECT pg_temp.assert_remaining_replies();
ROLLBACK TO fixtures;

DELETE FROM auth.users WHERE id = md5('leaving-reader')::UUID;
SELECT pg_temp.assert_remaining_replies();
ROLLBACK TO fixtures;

-- A direct parent deletion preserves every descendant and nested relationship.
DELETE FROM comments WHERE id = md5('root')::UUID;
DO $$
BEGIN
    IF (SELECT count(*) FROM comments) <> 6
       OR (SELECT count(*) FROM comments WHERE parent_id IS NULL) <> 3
       OR (SELECT parent_id FROM comments WHERE id = md5('grandchild')::UUID)
          IS DISTINCT FROM md5('child')::UUID
       OR (SELECT parent_id FROM comments WHERE id = md5('deep-reply')::UUID)
          IS DISTINCT FROM md5('intermediate')::UUID THEN
        RAISE EXCEPTION 'Direct parent deletion damaged the remaining conversation';
    END IF;
END;
$$;
ROLLBACK TO fixtures;

-- RLS permits deleting one's own parent, but must not erase another user's reply.
CREATE ROLE comment_deletion_reader NOLOGIN;
GRANT USAGE ON SCHEMA public, auth TO comment_deletion_reader;
GRANT SELECT ON profiles TO comment_deletion_reader;
GRANT SELECT, DELETE ON comments TO comment_deletion_reader;
SELECT set_config('request.jwt.claim.sub', md5('leaving-reader')::TEXT, true);
SET LOCAL ROLE comment_deletion_reader;
DELETE FROM comments WHERE id = md5('child')::UUID;
DELETE FROM comments WHERE id = md5('root')::UUID;
DO $$
BEGIN
    IF (SELECT count(*) FROM comments) <> 6
       OR NOT EXISTS (
           SELECT 1 FROM comments
           WHERE id = md5('child')::UUID AND parent_id IS NULL
             AND user_id = md5('remaining-reader')::UUID AND content = 'child'
       ) THEN
        RAISE EXCEPTION 'Deleting an authorized parent bypassed reply ownership';
    END IF;
END;
$$;
RESET ROLE;
ROLLBACK TO fixtures;

-- Normal comment deletion still retains the existing anonymized parent.
UPDATE comments SET content = '[deleted]', user_id = NULL WHERE id = md5('root')::UUID;
DO $$
BEGIN
    IF (SELECT count(*) FROM comments) <> 7
       OR (SELECT count(*) FROM comments WHERE parent_id = md5('root')::UUID) <> 2 THEN
        RAISE EXCEPTION 'Soft deletion no longer preserves the thread';
    END IF;
END;
$$;
ROLLBACK TO fixtures;

-- Authorized chapter/story removal must continue cleaning up all comments.
DELETE FROM chapters WHERE id = md5('chapter')::UUID;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM comments) THEN
        RAISE EXCEPTION 'Chapter deletion left comments behind';
    END IF;
END $$;
ROLLBACK TO fixtures;

DELETE FROM stories WHERE id = md5('story')::UUID;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM comments) THEN
        RAISE EXCEPTION 'Story deletion left comments behind';
    END IF;
END $$;

ROLLBACK;
