-- Add migration script here

-- 1. Profiles Table Policies
CREATE POLICY "Admins update any profile" ON public.profiles
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 2. Reports Table Policies
CREATE POLICY "Users view own reports, mods/admins view all" ON public.reports
FOR SELECT USING (
  auth.uid() = reporter_id OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('moderator', 'admin')
  )
);

CREATE POLICY "Mods and admins update reports" ON public.reports
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('moderator', 'admin')
  )
);

-- 3. Content Moderation Override Policies (stories, chapters, comments)
CREATE POLICY "Mods/admins update any story" ON public.stories
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('moderator', 'admin')
  )
);

CREATE POLICY "Mods/admins delete any story" ON public.stories
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('moderator', 'admin')
  )
);

CREATE POLICY "Mods/admins update any chapter" ON public.chapters
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('moderator', 'admin')
  )
);

CREATE POLICY "Mods/admins delete any chapter" ON public.chapters
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('moderator', 'admin')
  )
);

CREATE POLICY "Mods/admins update any comment" ON public.comments
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('moderator', 'admin')
  )
);

CREATE POLICY "Mods/admins delete any comment" ON public.comments
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('moderator', 'admin')
  )
);

-- 4. Policies for Missing Tables (chapter_content, chapter_pages, tips)

-- chapter_content
CREATE POLICY "Chapter content readable" ON public.chapter_content
FOR SELECT USING (true);

CREATE POLICY "Authors create chapter content" ON public.chapter_content
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chapters
    JOIN public.stories ON public.stories.id = public.chapters.story_id
    WHERE public.chapters.id = chapter_content.chapter_id
    AND public.stories.author_id = auth.uid()
  )
);

CREATE POLICY "Authors and mods/admins edit chapter content" ON public.chapter_content
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.chapters
    JOIN public.stories ON public.stories.id = public.chapters.story_id
    WHERE public.chapters.id = chapter_content.chapter_id
    AND (public.stories.author_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role IN ('moderator', 'admin')
    ))
  )
);

-- chapter_pages
CREATE POLICY "Chapter pages readable" ON public.chapter_pages
FOR SELECT USING (true);

CREATE POLICY "Authors create chapter pages" ON public.chapter_pages
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chapters
    JOIN public.stories ON public.stories.id = public.chapters.story_id
    WHERE public.chapters.id = chapter_pages.chapter_id
    AND public.stories.author_id = auth.uid()
  )
);

CREATE POLICY "Authors and mods/admins edit chapter pages" ON public.chapter_pages
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.chapters
    JOIN public.stories ON public.stories.id = public.chapters.story_id
    WHERE public.chapters.id = chapter_pages.chapter_id
    AND (public.stories.author_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role IN ('moderator', 'admin')
    ))
  )
);

-- tips
CREATE POLICY "Users insert own tips" ON public.tips
FOR INSERT WITH CHECK (
  auth.uid() = user_id
);

CREATE POLICY "Users view own tips, authors view tips, mods/admins view all" ON public.tips
FOR SELECT USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.stories
    WHERE public.stories.id = tips.story_id
    AND public.stories.author_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE public.profiles.id = auth.uid()
    AND public.profiles.role IN ('moderator', 'admin')
  )
);
