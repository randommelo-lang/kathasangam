-- Add paragraph_index column to comments table
ALTER TABLE comments ADD COLUMN paragraph_index INT;

-- Create index for fast retrieval of comments by chapter and paragraph index
CREATE INDEX idx_comments_chapter_paragraph ON comments(chapter_id, paragraph_index);
