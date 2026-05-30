-- Add migration script for reading progress table
CREATE TABLE IF NOT EXISTS reading_progress (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    page_index INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, story_id)
);

-- Enable RLS
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;

-- Policy for reading progress management (select/insert/update/delete)
CREATE POLICY "Users manage own reading progress"
ON reading_progress
FOR ALL
USING (auth.uid() = user_id);
