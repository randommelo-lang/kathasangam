-- Add migration script here

-- 1. Direct Messages Table
CREATE TABLE IF NOT EXISTS public.direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own messages" ON public.direct_messages
FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
);

CREATE POLICY "Users send own messages" ON public.direct_messages
FOR INSERT WITH CHECK (
    auth.uid() = sender_id
);

-- 2. Bookmarks Table
CREATE TABLE IF NOT EXISTS public.bookmarks (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, story_id)
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bookmarks" ON public.bookmarks
FOR SELECT USING (
    auth.uid() = user_id
);

CREATE POLICY "Users manage own bookmarks" ON public.bookmarks
FOR ALL USING (
    auth.uid() = user_id
);

-- 3. Reading Lists (Playlists) Table
CREATE TABLE IF NOT EXISTS public.reading_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE public.reading_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view public or own reading lists" ON public.reading_lists
FOR SELECT USING (
    is_private = false OR auth.uid() = user_id
);

CREATE POLICY "Users manage own reading lists" ON public.reading_lists
FOR ALL USING (
    auth.uid() = user_id
);

-- 4. Reading List Entries Table
CREATE TABLE IF NOT EXISTS public.reading_list_entries (
    reading_list_id UUID NOT NULL REFERENCES public.reading_lists(id) ON DELETE CASCADE,
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (reading_list_id, story_id)
);

ALTER TABLE public.reading_list_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view visible reading list entries" ON public.reading_list_entries
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.reading_lists
        WHERE id = reading_list_id AND (is_private = false OR user_id = auth.uid())
    )
);

CREATE POLICY "Users manage own reading list entries" ON public.reading_list_entries
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.reading_lists
        WHERE id = reading_list_id AND user_id = auth.uid()
    )
);
