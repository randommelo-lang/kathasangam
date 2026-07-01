import os
import psycopg2

database_url = None
if os.path.exists("backend/.env"):
    with open("backend/.env", "r") as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                database_url = line.split("=", 1)[1].strip().strip('"')

if not database_url:
    print("Error: DATABASE_URL not found")
    exit(1)

try:
    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    cur = conn.cursor()
    
    # Check if pgcrypto is enabled
    cur.execute("SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'")
    if not cur.fetchone():
        print("pgcrypto is not enabled. Enabling it...")
        cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public")
        
    print("Deleting pre-existing test user if any...")
    cur.execute("DELETE FROM auth.users WHERE email = 'testplaywright@example.com'")
    
    print("Inserting test user into auth.users...")
    # Insert user with encrypted password using crypt() (excluding generated confirmed_at)
    cur.execute("""
        INSERT INTO auth.users (
            id, 
            email, 
            encrypted_password, 
            email_confirmed_at, 
            aud, 
            role, 
            raw_app_meta_data, 
            raw_user_meta_data, 
            is_super_admin,
            created_at,
            updated_at
        )
        VALUES (
            'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
            'testplaywright@example.com',
            crypt('Password123!', gen_salt('bf', 10)),
            NOW(),
            'authenticated',
            'authenticated',
            '{"provider":"email","providers":["email"]}',
            '{"username":"testplaywright"}',
            false,
            NOW(),
            NOW()
        )
    """)
    print("Test user inserted into auth.users successfully!")
    
    # Verify that trigger created profile
    cur.execute("SELECT id, username, role FROM profiles WHERE id = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'")
    profile = cur.fetchone()
    print("Profile in DB:", profile)
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"DB Error: {e}")
