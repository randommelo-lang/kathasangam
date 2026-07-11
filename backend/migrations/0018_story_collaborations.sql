-- Migration to support Collaborative Co-Authoring features
CREATE TABLE story_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL, -- 'co-writer' or 'editor'
    status VARCHAR(50) NOT NULL DEFAULT 'invited', -- 'invited' or 'accepted'
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(story_id, user_id)
);

CREATE TABLE story_internal_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
