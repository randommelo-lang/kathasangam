-- Add is_banned and ban_reason columns to profiles table
ALTER TABLE profiles ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN ban_reason TEXT;
