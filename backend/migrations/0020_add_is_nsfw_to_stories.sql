-- Add is_nsfw column to stories table
ALTER TABLE stories ADD COLUMN is_nsfw BOOLEAN NOT NULL DEFAULT FALSE;
