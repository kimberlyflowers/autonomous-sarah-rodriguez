import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Read the SQL migration file
const sql = fs.readFileSync('./supabase-schema-projects.sql', 'utf8');

console.log('🚀 Running Supabase migration for BLOOM Projects...\n');

// Split SQL into individual statements (PostgreSQL can't handle multiple statements in one query via REST API)
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

let successCount = 0;
let errors = [];

for (let i = 0; i < statements.length; i++) {
  const statement = statements[i] + ';';
  
  // Skip comment lines
  if (statement.trim().startsWith('--')) continue;
  
  try {
    const { data, error } = await supabase.rpc('exec_sql', { query: statement });
    
    if (error) {
      console.log(`⚠️  Statement ${i + 1}: ${error.message}`);
      errors.push({ statement: statement.substring(0, 50) + '...', error: error.message });
    } else {
      successCount++;
      console.log(`✅ Statement ${i + 1}: Success`);
    }
  } catch (err) {
    console.log(`⚠️  Statement ${i + 1}: ${err.message}`);
    errors.push({ statement: statement.substring(0, 50) + '...', error: err.message });
  }
}

console.log(`\n📊 Migration Summary:`);
console.log(`   ✅ Successful: ${successCount}`);
console.log(`   ⚠️  Errors: ${errors.length}`);

if (errors.length > 0) {
  console.log(`\n⚠️  Note: Some errors may be expected (e.g., "already exists" for tables/policies)`);
}

process.exit(0);
