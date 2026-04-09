-- ============================================
-- SHAREBITE V2 UPGRADE (NON-DESTRUCTIVE)
-- ============================================
-- Safe to run multiple times.
-- Does NOT wipe users/posts.
--
-- If you want a full dev wipe, use `supabase_reset.sql` (NOT recommended for production).

BEGIN;

-- Needed for gen_random_uuid() in some Supabase projects
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================
-- 1) Profiles hardening
-- =============================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'impact_points_non_negative'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT impact_points_non_negative CHECK (impact_points >= 0);
  END IF;
END $$;

-- Floor at 0 so NGOs can be penalized without going negative
CREATE OR REPLACE FUNCTION public.increment_impact_points(user_id UUID, points INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET impact_points = GREATEST(0, COALESCE(impact_points, 0) + points)
  WHERE id = user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_impact_points(UUID, INTEGER) TO authenticated;

-- =============================
-- 2) Food posts lifecycle
-- =============================

ALTER TABLE public.food_posts
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wasted_at TIMESTAMPTZ;

-- Expand allowed statuses (v1 had a restrictive CHECK; v1 code already uses picked_up)
ALTER TABLE public.food_posts
  DROP CONSTRAINT IF EXISTS food_posts_status_check;

ALTER TABLE public.food_posts
  ADD CONSTRAINT food_posts_status_check
  CHECK (status IN (
    'available',
    'claimed',
    'picked_up',
    'delivered',
    'confirmed',
    'wasted'
  ));

-- Keep updated_at current
CREATE OR REPLACE FUNCTION public.set_food_posts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_food_posts_updated_at ON public.food_posts;
CREATE TRIGGER trg_food_posts_updated_at
BEFORE UPDATE ON public.food_posts
FOR EACH ROW
EXECUTE PROCEDURE public.set_food_posts_updated_at();

-- Indexes for faster feeds
CREATE INDEX IF NOT EXISTS idx_food_posts_status_expiry
  ON public.food_posts (status, expiry_time);
CREATE INDEX IF NOT EXISTS idx_food_posts_donor_created
  ON public.food_posts (donor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_food_posts_claimed_status
  ON public.food_posts (claimed_by, status);

-- =============================
-- 3) Bidding system
-- =============================

CREATE TABLE IF NOT EXISTS public.rescue_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.food_posts(id) ON DELETE CASCADE,
  ngo_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  eta_minutes INTEGER NOT NULL CHECK (eta_minutes > 0 AND eta_minutes <= 1440),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, ngo_id)
);

CREATE INDEX IF NOT EXISTS idx_rescue_bids_post_created
  ON public.rescue_bids (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rescue_bids_ngo_created
  ON public.rescue_bids (ngo_id, created_at DESC);

ALTER TABLE public.rescue_bids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read rescue_bids" ON public.rescue_bids;
DROP POLICY IF EXISTS "NGO insert bids" ON public.rescue_bids;
DROP POLICY IF EXISTS "Donor update bids" ON public.rescue_bids;
DROP POLICY IF EXISTS "Bids visible to NGO or donor" ON public.rescue_bids;
DROP POLICY IF EXISTS "NGO can insert bid" ON public.rescue_bids;
DROP POLICY IF EXISTS "Donor can update bids on own post" ON public.rescue_bids;
DROP POLICY IF EXISTS "NGO can update own pending bid" ON public.rescue_bids;

-- NGOs can see their bids; donors can see bids on their posts
CREATE POLICY "Bids visible to NGO or donor" ON public.rescue_bids
  FOR SELECT
  TO authenticated
  USING (
    ngo_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.food_posts fp
      WHERE fp.id = rescue_bids.post_id
        AND fp.donor_id = auth.uid()
    )
  );

-- Only NGOs can place bids (only while post is available & not expired)
CREATE POLICY "NGO can insert bid" ON public.rescue_bids
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ngo_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'NGO')
    AND EXISTS (
      SELECT 1 FROM public.food_posts fp
      WHERE fp.id = rescue_bids.post_id
        AND fp.status = 'available'
        AND fp.expiry_time > NOW()
    )
  );

-- Donors can update bid statuses on their posts
CREATE POLICY "Donor can update bids on own post" ON public.rescue_bids
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.food_posts fp
      WHERE fp.id = rescue_bids.post_id
        AND fp.donor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.food_posts fp
      WHERE fp.id = rescue_bids.post_id
        AND fp.donor_id = auth.uid()
    )
  );

-- NGOs can update their own bid ETA while still pending
CREATE POLICY "NGO can update own pending bid" ON public.rescue_bids
  FOR UPDATE
  TO authenticated
  USING (ngo_id = auth.uid() AND status = 'pending')
  WITH CHECK (ngo_id = auth.uid() AND status = 'pending');

-- Atomic accept: marks selected bid accepted, others rejected, and moves post into claimed state
CREATE OR REPLACE FUNCTION public.accept_rescue_bid(bid_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_post_id UUID;
  v_donor_id UUID;
  v_ngo_id UUID;
BEGIN
  SELECT rb.post_id, fp.donor_id, rb.ngo_id
  INTO v_post_id, v_donor_id, v_ngo_id
  FROM public.rescue_bids rb
  JOIN public.food_posts fp ON fp.id = rb.post_id
  WHERE rb.id = bid_id;

  IF v_post_id IS NULL THEN
    RAISE EXCEPTION 'Bid not found';
  END IF;

  IF v_donor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the donor can accept bids';
  END IF;

  -- Only accept while still available
  IF EXISTS (SELECT 1 FROM public.food_posts WHERE id = v_post_id AND status <> 'available') THEN
    RAISE EXCEPTION 'Post is not available';
  END IF;

  UPDATE public.rescue_bids
  SET status = CASE WHEN id = bid_id THEN 'accepted' ELSE 'rejected' END
  WHERE post_id = v_post_id;

  UPDATE public.food_posts
  SET status = 'claimed',
      claimed_by = v_ngo_id,
      claimed_at = NOW()
  WHERE id = v_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_rescue_bid(UUID) TO authenticated;

-- If an NGO doesn't show up within the accepted ETA (claimed_at + eta_minutes),
-- donor can time out the pickup. Post is re-opened unless it is expired or within 30 minutes of expiry,
-- in which case it's moved to wasted.
CREATE OR REPLACE FUNCTION public.handle_pickup_eta_timeout(post_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_post record;
  v_eta_minutes integer;
  v_due timestamptz;
  v_now timestamptz := now();
BEGIN
  SELECT *
  INTO v_post
  FROM public.food_posts
  WHERE id = handle_pickup_eta_timeout.post_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_post.donor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the donor can time out pickup';
  END IF;

  IF v_post.status <> 'claimed' THEN
    RETURN 'noop';
  END IF;

  IF v_post.picked_up_at IS NOT NULL OR v_post.delivered_at IS NOT NULL OR v_post.confirmed_at IS NOT NULL THEN
    RETURN 'noop';
  END IF;

  SELECT eta_minutes
  INTO v_eta_minutes
  FROM public.rescue_bids rb
  WHERE rb.post_id = handle_pickup_eta_timeout.post_id
    AND rb.status = 'accepted'
  LIMIT 1;

  IF v_eta_minutes IS NULL OR v_post.claimed_at IS NULL THEN
    RETURN 'noop';
  END IF;

  v_due := v_post.claimed_at + make_interval(mins => v_eta_minutes);
  IF v_now < v_due THEN
    RETURN 'too_early';
  END IF;

  -- Clear bids so NGOs can place new offers.
  DELETE FROM public.rescue_bids rb WHERE rb.post_id = handle_pickup_eta_timeout.post_id;

  -- If expired or near expiry (<= 30 mins left), move to wasted.
  IF v_post.expiry_time <= v_now OR v_post.expiry_time <= (v_now + interval '30 minutes') THEN
    UPDATE public.food_posts
    SET status = 'wasted',
        wasted_at = v_now,
        claimed_by = NULL
    WHERE id = handle_pickup_eta_timeout.post_id;
    RETURN 'wasted';
  END IF;

  UPDATE public.food_posts
  SET status = 'available',
      claimed_by = NULL,
      claimed_at = NULL
  WHERE id = handle_pickup_eta_timeout.post_id;

  RETURN 'reopened';
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_pickup_eta_timeout(UUID) TO authenticated;

-- =============================
-- 4) Expiry / wasted handling
-- =============================
-- Rule: if expiry_time passed and still available => wasted
-- Rule: if claimed/picked_up and > 30 mins after expiry_time and not delivered => wasted + NGO penalty

CREATE OR REPLACE FUNCTION public.expire_overdue_posts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_count integer := 0;
  r record;
BEGIN
  -- Available posts past expiry => wasted
  WITH upd AS (
    UPDATE public.food_posts
    SET status = 'wasted',
        wasted_at = v_now
    WHERE status = 'available'
      AND expiry_time <= v_now
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM upd;

  -- Claimed/picked_up posts overdue => wasted (+ penalty)
  FOR r IN
    SELECT id, claimed_by
    FROM public.food_posts
    WHERE status IN ('claimed', 'picked_up')
      AND expiry_time + INTERVAL '30 minutes' <= v_now
  LOOP
    UPDATE public.food_posts
    SET status = 'wasted',
        wasted_at = v_now
    WHERE id = r.id;

    IF r.claimed_by IS NOT NULL THEN
      PERFORM public.increment_impact_points(r.claimed_by, -1);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_overdue_posts() TO authenticated;

-- =============================
-- 5) Donor ratings
-- =============================

CREATE TABLE IF NOT EXISTS public.donor_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.food_posts(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ngo_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, ngo_id)
);

CREATE INDEX IF NOT EXISTS idx_donor_ratings_donor
  ON public.donor_ratings (donor_id, created_at DESC);

ALTER TABLE public.donor_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ratings" ON public.donor_ratings;
DROP POLICY IF EXISTS "NGO insert ratings" ON public.donor_ratings;
DROP POLICY IF EXISTS "NGO can insert rating for confirmed rescue" ON public.donor_ratings;

CREATE POLICY "Public read ratings" ON public.donor_ratings
  FOR SELECT
  USING (true);

-- NGOs can rate a donor only for rescues they completed (post confirmed)
CREATE POLICY "NGO can insert rating for confirmed rescue" ON public.donor_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ngo_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.food_posts fp
      WHERE fp.id = donor_ratings.post_id
        AND fp.status = 'confirmed'
        AND fp.claimed_by = auth.uid()
        AND fp.donor_id = donor_ratings.donor_id
    )
  );

CREATE OR REPLACE VIEW public.donor_rating_summary AS
SELECT
  donor_id,
  ROUND(AVG(rating)::numeric, 2) AS avg_rating,
  COUNT(*)::integer AS ratings_count
FROM public.donor_ratings
GROUP BY donor_id;

GRANT SELECT ON public.donor_rating_summary TO anon, authenticated;

-- =============================
-- 6) Tighten food_posts RLS (NGOs should not be able to claim directly)
-- =============================

DROP POLICY IF EXISTS "NGOs can claim/update posts" ON public.food_posts;
DROP POLICY IF EXISTS "NGO can update own claimed posts" ON public.food_posts;

-- NGOs can update only posts that are assigned to them (proof upload + status transitions)
CREATE POLICY "NGO can update own claimed posts" ON public.food_posts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'NGO')
    AND claimed_by = auth.uid()
  );

-- Optional: ask PostgREST (Supabase API) to reload its schema cache.
-- This helps newly-created RPC functions appear immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;
