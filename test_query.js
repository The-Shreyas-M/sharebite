const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('food_posts').select('*');
  console.log('Food Posts RAW:', data);
  if (error) console.error('Error RAW:', error);

  const now = new Date().toISOString();
  console.log('Now is:', now);
  
  const { data: qData, error: qError } = await supabase
    .from('food_posts')
    .select('*, donor_profile:profiles!food_posts_donor_id_fkey(full_name)')
    .eq('status', 'available')
    .gt('expiry_time', now)
    .order('expiry_time', { ascending: true });
    
  console.log('Query result:', qData);
  if (qError) console.error('Query error:', qError);
}
check();
