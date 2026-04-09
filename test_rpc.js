const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testrpc() {
  const { data, error } = await supabase.rpc('increment_impact_points', { user_id: '00000000-0000-0000-0000-000000000000', points: 1 });
  console.log('RPC ERROR:', error);
}
testrpc();
