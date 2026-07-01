-- Add is_read column to direct_messages table
ALTER TABLE public.direct_messages ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE;
