-- Account cleanup and direct deletes must not erase other users' replies.
-- Keep applied migrations unchanged so SQLx checksum validation still succeeds.
ALTER TABLE comments
    DROP CONSTRAINT comments_parent_id_fkey,
    ADD CONSTRAINT comments_parent_id_fkey
        FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE SET NULL;
