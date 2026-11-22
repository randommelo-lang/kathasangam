-- 0034_performance_indexes.sql
-- Adds missing indexes on hot query paths identified in full-stack performance audit.

-- Chapter content & comic pages (hit on every chapter read & batch story load)
CREATE INDEX IF NOT EXISTS idx_chapter_content_chapter_sort
    ON public.chapter_content (chapter_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_chapter_pages_chapter_page
    ON public.chapter_pages (chapter_id, page_index);

-- Stories catalog sorting & filtering
CREATE INDEX IF NOT EXISTS idx_stories_status_created_at
    ON public.stories (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stories_views_desc
    ON public.stories (views DESC);

CREATE INDEX IF NOT EXISTS idx_stories_likes_desc
    ON public.stories (likes DESC);

-- Case-insensitive profile username lookup
CREATE INDEX IF NOT EXISTS idx_profiles_lower_username
    ON public.profiles (LOWER(username));

-- Supporter badge correlated subquery on comments
CREATE INDEX IF NOT EXISTS idx_tips_user_status
    ON public.tips (user_id, status);

-- Follower notifications on chapter publish
CREATE INDEX IF NOT EXISTS idx_bookmarks_story_id
    ON public.bookmarks (story_id);

CREATE INDEX IF NOT EXISTS idx_library_story_id
    ON public.library (story_id);

-- Public profile follower count
CREATE INDEX IF NOT EXISTS idx_follows_followed_id
    ON public.follows (followed_id);

-- Moderation queue & audit logs
CREATE INDEX IF NOT EXISTS idx_reports_status_created_at
    ON public.reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_target_status
    ON public.reports (target_type, target_id, status);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_logs_created_at
    ON public.moderation_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_logs_moderator_id
    ON public.moderation_audit_logs (moderator_id);
