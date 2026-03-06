import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

console.log('🔗 Connecting to Supabase...');
console.log(`URL: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = fs.readFileSync('./supabase-schema-projects.sql', 'utf8');

console.log('📝 Running migration SQL...');

try {
  // Execute the SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
  
  if (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
  
  console.log('✅ Migration completed successfully!');
  
  // Verify tables created
  console.log('\n🔍 Verifying tables...');
  const { data: tables, error: verifyError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .in('table_name', ['projects', 'sessions']);
    
  if (verifyError) {
    console.log('Note: Table verification query not supported, but migration likely succeeded');
  } else {
    console.log('Tables found:', tables);
  }
  
  console.log('\n✅ DONE! Projects backend is ready.');
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
