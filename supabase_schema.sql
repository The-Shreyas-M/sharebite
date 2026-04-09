-- Create profiles table
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  role TEXT CHECK (role IN ('DONOR', 'NGO')) NOT NULL,
  full_name TEXT,
  impact_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Create food_posts table
CREATE TABLE food_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  donor_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  feeds INTEGER NOT NULL,
  expiry_time TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  image_url TEXT,
  status TEXT CHECK (status IN ('available', 'claimed', 'delivered', 'confirmed')) DEFAULT 'available',
  claimed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  proof_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for food_posts
ALTER TABLE food_posts ENABLE ROW LEVEL SECURITY;

-- Food Posts Policies
CREATE POLICY "Available posts are viewable by everyone" ON food_posts
  FOR SELECT USING (true);

CREATE POLICY "Donors can create posts" ON food_posts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'DONOR'
    )
  );

CREATE POLICY "Donors can update their own posts" ON food_posts
  FOR UPDATE USING (donor_id = auth.uid());

CREATE POLICY "NGOs can claim/update posts" ON food_posts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'NGO'
    )
  );

-- Function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'role', 'DONOR'), new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Function to increment NGO impact points
CREATE OR REPLACE FUNCTION public.increment_impact_points(user_id UUID, points INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET impact_points = impact_points + points
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Storage Buckets (run manually in Supabase Dashboard → Storage)
-- Create two public buckets:
--   1. food-images       (for donor food post images)
--   2. delivery-proofs   (for NGO delivery proof photos)
