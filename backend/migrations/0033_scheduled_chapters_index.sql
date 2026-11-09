-- Migration 0033: Optimize scheduled chapters queries with a partial index
CREATE INDEX IF NOT EXISTS idx_chapters_scheduled
ON public.chapters (status, scheduled_at)
WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;
