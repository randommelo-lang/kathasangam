-- Add content_rating column to stories table
ALTER TABLE stories ADD COLUMN IF NOT EXISTS content_rating VARCHAR(32) NOT NULL DEFAULT 'All ages';
UPDATE stories SET content_rating = '18+' WHERE is_nsfw = TRUE;
