-- Add parent_id column to comments table to support threaded replies
ALTER TABLE comments ADD COLUMN parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;

-- Create index for fast query retrieval of replies by parent_id
CREATE INDEX idx_comments_parent ON comments(parent_id);
