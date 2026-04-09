-- ============================================
-- SHAREBITE V2 ROLLBACK TO V1 (NON-DESTRUCTIVE)
-- ============================================
-- Does NOT wipe users/posts.
-- If you want a full dev wipe, use `supabase_reset.sql`.

BEGIN;

-- 1) Remove V2 views/functions
DROP VIEW IF EXISTS public.donor_rating_summary;

DROP FUNCTION IF EXISTS public.accept_rescue_bid(UUID);
DROP FUNCTION IF EXISTS public.handle_pickup_eta_timeout(UUID);
DROP FUNCTION IF EXISTS public.expire_overdue_posts();
DROP FUNCTION IF EXISTS public.set_food_posts_updated_at();

-- 2) Drop V2 tables
DROP TABLE IF EXISTS public.donor_ratings CASCADE;
DROP TABLE IF EXISTS public.rescue_bids CASCADE;

-- 3) Revert food_posts schema (best-effort)
ALTER TABLE public.food_posts
	DROP COLUMN IF EXISTS is_edited,
	DROP COLUMN IF EXISTS updated_at,
	DROP COLUMN IF EXISTS claimed_at,
	DROP COLUMN IF EXISTS picked_up_at,
	DROP COLUMN IF EXISTS delivered_at,
	DROP COLUMN IF EXISTS confirmed_at,
	DROP COLUMN IF EXISTS wasted_at;

DROP TRIGGER IF EXISTS trg_food_posts_updated_at ON public.food_posts;

-- Restore v1 status constraint
ALTER TABLE public.food_posts
	DROP CONSTRAINT IF EXISTS food_posts_status_check;

ALTER TABLE public.food_posts
	ADD CONSTRAINT food_posts_status_check
	CHECK (status IN ('available', 'claimed', 'delivered', 'confirmed'));

-- 4) Revert profiles hardening
ALTER TABLE public.profiles
	DROP COLUMN IF EXISTS is_blacklisted;

ALTER TABLE public.profiles
	DROP CONSTRAINT IF EXISTS impact_points_non_negative;

-- 5) Restore v1 increment behavior (allows negatives)
CREATE OR REPLACE FUNCTION public.increment_impact_points(user_id UUID, points INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
	UPDATE public.profiles
	SET impact_points = COALESCE(impact_points, 0) + points
	WHERE id = user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_impact_points(UUID, INTEGER) TO authenticated;

-- 6) Restore v1 RLS policy name/behavior for NGOs
DROP POLICY IF EXISTS "NGO can update own claimed posts" ON public.food_posts;
CREATE POLICY "NGOs can claim/update posts" ON public.food_posts
	FOR UPDATE
	USING (
		EXISTS (
			SELECT 1 FROM public.profiles
			WHERE id = auth.uid() AND role = 'NGO'
		)
	);

COMMIT;
