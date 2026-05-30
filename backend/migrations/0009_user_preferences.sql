ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{
  "reader_theme": "light",
  "reader_size": 19,
  "reader_mode": "scroll",
  "email_notifications": true,
  "in_app_notifications": true
}'::jsonb;
