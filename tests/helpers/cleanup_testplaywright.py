import os
import psycopg2
import urllib.request
import urllib.error

database_url = None
supabase_url = None
service_role_key = None

if os.path.exists("backend/.env"):
    with open("backend/.env", "r") as f:
        for line in f:
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                database_url = line.split("=", 1)[1].strip().strip('"')
            elif line.startswith("SUPABASE_URL="):
                supabase_url = line.split("=", 1)[1].strip().strip('"')
            elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                service_role_key = line.split("=", 1)[1].strip().strip('"')

if not database_url:
    print("Error: DATABASE_URL not found")
    exit(1)

def delete_file_from_storage(file_url):
    if not file_url:
        return
    
    # Strip CSS url(...) wrapper if present
    if file_url.startswith("url('") and file_url.endswith("')"):
        file_url = file_url[5:-2]
    elif file_url.startswith('url("') and file_url.endswith('")'):
        file_url = file_url[5:-2]
    
    # 1. Local files
    if file_url.startswith("/uploads/"):
        relative_path = os.path.join("backend", file_url[1:])
        if os.path.exists(relative_path):
            try:
                os.remove(relative_path)
                print(f"[SUCCESS] Deleted local file: {relative_path}")
            except Exception as e:
                print(f"[WARNING] Failed to delete local file {relative_path}: {e}")
        return

    # 2. Supabase Storage files
    if "/storage/v1/object/public/" in file_url and supabase_url and service_role_key:
        try:
            pos = file_url.find("/storage/v1/object/public/")
            path_part = file_url[pos + len("/storage/v1/object/public/"):]
            delete_url = f"{supabase_url}/storage/v1/object/{path_part}"
            
            req = urllib.request.Request(
                delete_url,
                method='DELETE',
                headers={
                    'apikey': service_role_key,
                    'Authorization': f'Bearer {service_role_key}'
                }
            )
            with urllib.request.urlopen(req) as response:
                print(f"[SUCCESS] Deleted storage file successfully: {file_url}")
        except urllib.error.HTTPError as e:
            print(f"[WARNING] Supabase Storage delete failed for {file_url} (HTTP {e.code}): {e.read().decode('utf-8', errors='ignore')}")
        except Exception as e:
            print(f"[WARNING] Supabase Storage delete failed for {file_url}: {e}")

try:
    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    cur = conn.cursor()

    # Always clean up public test data IDs to prevent leftovers
    print("Deleting public test data...")
    cur.execute("""
        DELETE FROM public.reports 
        WHERE id IN (
            '40000000-0000-0000-0000-000000000001',
            '40000000-0000-0000-0000-000000000002',
            '40000000-0000-0000-0000-000000000003',
            'e8f9c2d1-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 
            'f9a8b7c6-d5e4-3a2b-1c0d-9e8d7c6b5a4f',
            'a2b3c4d5-e6f7-8a9b-0c1d-2e3f4a5b6c7d',
            'b3c4d5e6-f7a8-9b0c-1d2e-3f4a5b6c7d8e',
            'c4d5e6f7-a8b9-0c1d-2e3f-4a5b6c7d8e9f',
            'd5e6f7a8-b9c0-1d2e-3f4a-5b6c7d8e9f0a'
        ) OR target_id IN (
            '10000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000002',
            '10000000-0000-0000-0000-000000000003',
            '20000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000002',
            '20000000-0000-0000-0000-000000000003',
            '30000000-0000-0000-0000-000000000001',
            '30000000-0000-0000-0000-000000000002',
            '30000000-0000-0000-0000-000000000003',
            '288ccb78-7a45-4089-9b35-c8c17cc5e50e',
            'ccd82df2-be63-4277-8a34-4180572687b7'
        )
    """)
    cur.execute("""
        DELETE FROM public.comments 
        WHERE id IN (
            '30000000-0000-0000-0000-000000000001',
            '30000000-0000-0000-0000-000000000002',
            '30000000-0000-0000-0000-000000000003'
        )
    """)
    cur.execute("""
        DELETE FROM public.chapters 
        WHERE id IN (
            '20000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000002',
            '20000000-0000-0000-0000-000000000003',
            'ccd82df2-be63-4277-8a34-4180572687b7'
        ) OR story_id = '288ccb78-7a45-4089-9b35-c8c17cc5e50e'
    """)
    cur.execute("""
        DELETE FROM public.stories 
        WHERE id IN (
            '10000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000002',
            '10000000-0000-0000-0000-000000000003',
            '288ccb78-7a45-4089-9b35-c8c17cc5e50e'
        )
    """)

    # Find all test users in auth.users
    # Criteria: specific test email address list, or specific test IDs
    cur.execute("""
        SELECT id, email 
        FROM auth.users 
        WHERE email IN (
            'testplaywright@example.com',
            'dummyauthor@example.com',
            'reader@example.com',
            'wrong@example.com'
        ) OR id IN (
            'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
            'b2c3d4e5-f67a-8b9c-0d1e-2f3a4b5c6d7e',
            'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f'
        )
    """)
    test_users = cur.fetchall()

    if not test_users:
        print("No test users found to clean up.")
        cur.close()
        conn.close()
        exit(0)

    print(f"Found {len(test_users)} test user(s) to clean up.")

    for user_id, email in test_users:
        print(f"\n--- Cleaning up test user: {email} (ID: {user_id}) ---")
        
        # 1. Fetch file URLs to delete before clearing database entries
        file_urls = set()

        # Profile avatar
        cur.execute("SELECT avatar_url FROM public.profiles WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if row and row[0]:
            file_urls.add(row[0])

        # Story covers
        cur.execute("SELECT cover FROM public.stories WHERE author_id = %s", (user_id,))
        for row in cur.fetchall():
            if row[0]:
                file_urls.add(row[0])

        # Chapter page image backgrounds
        cur.execute("""
            SELECT cp.bg 
            FROM public.chapter_pages cp
            JOIN public.chapters c ON cp.chapter_id = c.id
            JOIN public.stories s ON c.story_id = s.id
            WHERE s.author_id = %s
        """, (user_id,))
        for row in cur.fetchall():
            if row[0]:
                file_urls.add(row[0])

        # 2. Delete storage files
        if file_urls:
            print(f"Found {len(file_urls)} file(s) to clean up from storage.")
            for url in file_urls:
                delete_file_from_storage(url)
        else:
            print("No storage files found to clean up.")

        # Explicitly delete profile as fallback (it triggers cascade deletes for profiles-related records)
        print("Deleting DB records from public.profiles...")
        cur.execute("DELETE FROM public.profiles WHERE id = %s", (user_id,))
        
        # Explicitly delete user from auth.users (it triggers trigger-based profile deletion if any profile remained, plus cleans up auth auth.users details)
        print("Deleting DB records from auth.users...")
        cur.execute("DELETE FROM auth.users WHERE id = %s", (user_id,))

        # 4. Clean up notifications sent by or referencing the user
        cur.execute("DELETE FROM public.notifications WHERE user_id = %s", (user_id,))

        # 5. Clean up audit logs
        cur.execute("DELETE FROM public.moderation_audit_logs WHERE moderator_id = %s", (user_id,))

        print(f"[SUCCESS] Cleaned up {email} successfully!")

    cur.close()
    conn.close()
    print("\n[SUCCESS] All test users and their data deleted successfully!")

except Exception as e:
    print(f"Error during cleanup: {e}")
