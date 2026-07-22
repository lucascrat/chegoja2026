const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://zuzmczluztzdofjwwqif.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.q5pgDjzi32wiGrHBZ6jCUw');
supabase.from('rides').select('*').order('created_at', { ascending: false }).limit(2).then(res => console.log(JSON.stringify(res.data, null, 2)));
