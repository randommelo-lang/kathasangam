-- Replace the auth trigger function with a robust version that handles username conflicts gracefully
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  username_exists BOOLEAN;
  suffix_counter INT := 1;
BEGIN
  -- Generate base username from email, or fallback to user_id substring
  base_username := COALESCE(split_part(NEW.email, '@', 1), 'user_' || substr(NEW.id::text, 1, 8));
  
  -- Prevent empty username
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

  INSERT INTO public.profiles (id, username, role)
  VALUES (
    NEW.id,
    final_username,
    'reader'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
