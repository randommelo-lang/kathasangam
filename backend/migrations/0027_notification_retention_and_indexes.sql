-- Migration 0027: Notification 3-month retention, backfill defaults, and performance indexes

-- 1. Ensure existing rows have valid timestamps and read status
UPDATE notifications
SET created_at = NOW()
WHERE created_at IS NULL;

UPDATE notifications
SET is_read = FALSE
WHERE is_read IS NULL;

-- 2. Alter column defaults for future inserts
ALTER TABLE notifications
ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE notifications
ALTER COLUMN is_read SET DEFAULT FALSE;

-- 3. High-performance compound index for user notifications ordered by timestamp
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON notifications(user_id, created_at DESC);

-- 4. Index for global cleanup of notifications older than 3 months
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
ON notifications(created_at);

-- 5. Prune any notifications older than 3 months
DELETE FROM notifications
WHERE created_at < NOW() - INTERVAL '3 months';
