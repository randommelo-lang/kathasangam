-- Migration 0032: Add display_name to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';

-- Backfill any existing NULL display_name values with empty string
UPDATE public.profiles SET display_name = '' WHERE display_name IS NULL;

-- Allow authenticated users to update their own display_name column
GRANT UPDATE (display_name) ON public.profiles TO authenticated;

-- Upgrade handle_new_user() to capture display_name / full_name from OAuth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  username_exists BOOLEAN;
  suffix_counter INT := 1;
  oauth_avatar TEXT;
  initial_display_name TEXT;
BEGIN
  -- Extract avatar URL if provided by Google or other OAuth providers
  oauth_avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  -- Extract display name / full name if provided
  initial_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    ''
  );

  -- Generate base username from email or metadata, or fallback to user_id substring
  base_username := COALESCE(
    split_part(NEW.email, '@', 1),
    'user_' || substr(NEW.id::text, 1, 8)
  );

  IF base_username = '' THEN
    base_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;

  final_username := base_username;

  -- Ensure uniqueness of the username in profiles table
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.profiles WHERE username = final_username
    ) INTO username_exists;

    IF NOT username_exists THEN
      EXIT;
    END IF;

    final_username := base_username || suffix_counter::text;
    suffix_counter := suffix_counter + 1;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name, role, avatar_url)
  VALUES (
    NEW.id,
    final_username,
    initial_display_name,
    'reader',
    oauth_avatar
  )
  ON CONFLICT (id) DO UPDATE
    SET avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
        display_name = CASE
          WHEN public.profiles.display_name IS NULL OR public.profiles.display_name = ''
          THEN EXCLUDED.display_name
          ELSE public.profiles.display_name
        END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
