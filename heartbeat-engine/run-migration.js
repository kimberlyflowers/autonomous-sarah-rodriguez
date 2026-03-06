import { query } from './src/db.js';
import fs from 'fs';

const migrationFile = './migrations/005_create_projects_table.sql';
const sql = fs.readFileSync(migrationFile, 'utf8');

console.log('Running migration: 005_create_projects_table.sql');

try {
  await query(sql);
  console.log('✅ Migration completed successfully!');
  process.exit(0);
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}
