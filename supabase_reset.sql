-- ============================================
-- SHAREBITE HARD RESET SCRIPT
-- ============================================
-- WARNING: Running this will wipe all Users, Posts, and Impact Points!
-- Use this ONLY for local/dev/testing.
-- Do NOT run in production unless you intentionally want to delete everything.

BEGIN;

-- 1. Wipe all Food Posts
TRUNCATE TABLE public.food_posts CASCADE;

-- 2. Wipe all User Profiles
TRUNCATE TABLE public.profiles CASCADE;

-- 3. Wipe all Auth Logins
-- (Since profiles is linked via foreign key, this safely deletes all registered users)
DELETE FROM auth.users;

-- Note: Storage Bucket images are not deleted by SQL truncations.
-- If you want to wipe images, delete them manually via the Supabase Storage Dashboard.

COMMIT;
