const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://jpqjpirrceopeguvannr.supabase.co', 'sb_publishable_xuDDYt-iEGYTSA5vy_t_5Q_-LBDveO5');
async function test() {
  const { data, error } = await supabase.from('food_posts').select('*');
  console.log('Posts:', JSON.stringify(data, null, 2));
  if (error) console.error('Error:', error);
}
test();
