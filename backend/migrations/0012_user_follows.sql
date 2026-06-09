-- Add migration script here

-- Create follows table mapping follower to followed user
CREATE TABLE IF NOT EXISTS public.follows (
    follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    followed_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, followed_id)
);

-- Enable Row Level Security
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Policies for follows table
CREATE POLICY "Anyone can view follows" ON public.follows
    FOR SELECT USING (true);

CREATE POLICY "Users can manage own follows" ON public.follows
    FOR ALL USING (auth.uid() = follower_id);
