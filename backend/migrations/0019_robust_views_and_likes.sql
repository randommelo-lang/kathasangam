-- Create story_likes table to prevent multiple likes from the same user
CREATE TABLE IF NOT EXISTS public.story_likes (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, story_id)
);

-- Create story_views table for de-duplication/anti-bot view tracking
CREATE TABLE IF NOT EXISTS public.story_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast de-duplication checks
CREATE INDEX IF NOT EXISTS idx_story_views_check 
ON public.story_views(story_id, ip_address, user_id, viewed_at);

-- Trigger for likes count sync on stories table
CREATE OR REPLACE FUNCTION public.sync_story_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.stories 
        SET likes = likes + 1 
        WHERE id = NEW.story_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.stories 
        SET likes = GREATEST(0, likes - 1) 
        WHERE id = OLD.story_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_story_likes_count ON public.story_likes;
CREATE TRIGGER tr_sync_story_likes_count
AFTER INSERT OR DELETE ON public.story_likes
FOR EACH ROW EXECUTE FUNCTION public.sync_story_likes_count();

-- Trigger for views count sync on stories table
CREATE OR REPLACE FUNCTION public.sync_story_views_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.stories 
    SET views = views + 1 
    WHERE id = NEW.story_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_story_views_count ON public.story_views;
CREATE TRIGGER tr_sync_story_views_count
AFTER INSERT ON public.story_views
FOR EACH ROW EXECUTE FUNCTION public.sync_story_views_count();
