-- Add migration script here
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM (
    'reader',
    'author',
    'moderator',
    'admin'
);

CREATE TABLE profiles (

    id UUID PRIMARY KEY,

    username TEXT UNIQUE NOT NULL,

    avatar_url TEXT DEFAULT '',

    bio TEXT DEFAULT '',

    role user_role DEFAULT 'reader',

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stories (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    author_id UUID REFERENCES profiles(id)
    ON DELETE CASCADE,

    title TEXT NOT NULL,

    type TEXT NOT NULL DEFAULT 'Web Novel',

    genre TEXT NOT NULL DEFAULT 'Fantasy',

    language TEXT NOT NULL DEFAULT 'English',

    license TEXT NOT NULL DEFAULT 'Creator-owned',

    status TEXT NOT NULL DEFAULT 'draft',

    tags JSONB DEFAULT '[]',

    description TEXT DEFAULT '',

    cover TEXT DEFAULT '',

    followers INTEGER DEFAULT 0,

    views INTEGER DEFAULT 0,

    likes INTEGER DEFAULT 0,

    earnings INTEGER DEFAULT 0,

    progress INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE chapters (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    story_id UUID REFERENCES stories(id)
    ON DELETE CASCADE,

    sort_order INTEGER DEFAULT 0,

    title TEXT NOT NULL,

    status TEXT DEFAULT 'draft',

    access TEXT DEFAULT 'free',

    scheduled_at TIMESTAMP,

    words INTEGER DEFAULT 0,

    reads INTEGER DEFAULT 0,

    likes INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE chapter_content (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    chapter_id UUID REFERENCES chapters(id)
    ON DELETE CASCADE,

    sort_order INTEGER DEFAULT 0,

    paragraph TEXT NOT NULL
);

CREATE TABLE chapter_pages (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    chapter_id UUID REFERENCES chapters(id)
    ON DELETE CASCADE,

    page_index INTEGER DEFAULT 0,

    label TEXT DEFAULT '',

    bg TEXT DEFAULT ''
);

CREATE TABLE comments (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    chapter_id UUID REFERENCES chapters(id)
    ON DELETE CASCADE,

    user_id UUID REFERENCES profiles(id)
    ON DELETE CASCADE,

    content TEXT NOT NULL,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE library (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES profiles(id)
    ON DELETE CASCADE,

    story_id UUID REFERENCES stories(id)
    ON DELETE CASCADE,

    added_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id, story_id)
);

CREATE TABLE tips (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    story_id UUID REFERENCES stories(id)
    ON DELETE CASCADE,

    user_id UUID REFERENCES profiles(id)
    ON DELETE SET NULL,

    amount INTEGER DEFAULT 5,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE reports (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    reporter_id UUID REFERENCES profiles(id)
    ON DELETE SET NULL,

    target_type TEXT NOT NULL,

    target_id UUID NOT NULL,

    reason TEXT NOT NULL,

    status TEXT DEFAULT 'open',

    severity TEXT DEFAULT 'medium',

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES profiles(id)
    ON DELETE CASCADE,

    message TEXT NOT NULL,

    is_read BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stories_author
ON stories(author_id);

CREATE INDEX idx_chapters_story
ON chapters(story_id);

CREATE INDEX idx_comments_chapter
ON comments(chapter_id);

CREATE INDEX idx_library_user
ON library(user_id);

CREATE INDEX idx_notifications_user
ON notifications(user_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

ALTER TABLE chapter_content ENABLE ROW LEVEL SECURITY;

ALTER TABLE chapter_pages ENABLE ROW LEVEL SECURITY;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE library ENABLE ROW LEVEL SECURITY;

ALTER TABLE tips ENABLE ROW LEVEL SECURITY;

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable"
ON profiles
FOR SELECT
USING (true);

CREATE POLICY "Users edit own profile"
ON profiles
FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Stories readable"
ON stories
FOR SELECT
USING (true);

CREATE POLICY "Authors create stories"
ON stories
FOR INSERT
WITH CHECK (
    auth.uid() = author_id
);

CREATE POLICY "Authors update own stories"
ON stories
FOR UPDATE
USING (
    auth.uid() = author_id
);

CREATE POLICY "Authors delete own stories"
ON stories
FOR DELETE
USING (
    auth.uid() = author_id
);

CREATE POLICY "Chapters readable"
ON chapters
FOR SELECT
USING (true);

CREATE POLICY "Authors create chapters"
ON chapters
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM stories
        WHERE stories.id = story_id
        AND stories.author_id = auth.uid()
    )
);

CREATE POLICY "Authors update chapters"
ON chapters
FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM stories
        WHERE stories.id = chapters.story_id
        AND stories.author_id = auth.uid()
    )
);

CREATE POLICY "Comments readable"
ON comments
FOR SELECT
USING (true);

CREATE POLICY "Users create comments"
ON comments
FOR INSERT
WITH CHECK (
    auth.uid() = user_id
);

CREATE POLICY "Users delete own comments"
ON comments
FOR DELETE
USING (
    auth.uid() = user_id
);

CREATE POLICY "Users manage own library"
ON library
FOR ALL
USING (
    auth.uid() = user_id
);

CREATE POLICY "Users read own notifications"
ON notifications
FOR SELECT
USING (
    auth.uid() = user_id
);

CREATE POLICY "Users update own notifications"
ON notifications
FOR UPDATE
USING (
    auth.uid() = user_id
);

CREATE POLICY "Users create reports"
ON reports
FOR INSERT
WITH CHECK (
    auth.uid() = reporter_id
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN

  INSERT INTO public.profiles (
      id,
      username
  )
  VALUES (
      NEW.id,
      split_part(NEW.email, '@', 1)
  );

  RETURN NEW;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE public.handle_new_user();