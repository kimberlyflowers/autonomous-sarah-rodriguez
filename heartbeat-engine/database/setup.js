// Database setup script for BLOOM Agent Infrastructure (ES Module version)
// Connects to Railway PostgreSQL and creates schema

import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Railway PostgreSQL connection
const createPool = (database = 'postgres') => new Pool({
  host: process.env.PGHOST || 'postgres.railway.internal',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'your_postgres_password_here',
  database,
  ssl: false // Railway internal network doesn't need SSL
});

export async function setupDatabase() {
  console.log('🔧 Setting up BLOOM Agent Infrastructure database...');

  let pool = createPool();

  try {
    // First, create the bloom_heartbeat database if it doesn't exist
    console.log('📦 Creating bloom_heartbeat database...');
    await pool.query(`
      CREATE DATABASE bloom_heartbeat;
    `).catch(err => {
      if (err.code === '42P04') {
        console.log('✅ Database bloom_heartbeat already exists');
      } else {
        throw err;
      }
    });

    // Close connection to default database
    await pool.end();

    // Connect to the bloom_heartbeat database
    pool = createPool('bloom_heartbeat');

    // Read and execute schema
    console.log('🏗️  Creating tables and indexes...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');

    await pool.query(schemaSql);

    console.log('✅ Database setup complete!');
    console.log('📊 Sarah Rodriguez agent profile created');
    console.log('📋 Trust metrics baseline established');

    // Test connection
    const result = await pool.query(`
      SELECT id, name, role, client, autonomy_level
      FROM agents
      WHERE id = 'bloomie-sarah-rodriguez'
    `);

    if (result.rows.length > 0) {
      const sarah = result.rows[0];
      console.log(`👩‍💼 Agent: ${sarah.name} (${sarah.role})`);
      console.log(`🏢 Client: ${sarah.client}`);
      console.log(`🔒 Autonomy Level: ${sarah.autonomy_level} (Observer)`);
    }

  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Connection test function
export async function testDatabaseConnection() {
  const pool = createPool('bloom_heartbeat');

  try {
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connection successful');
    console.log('⏰ Server time:', result.rows[0].current_time);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  } finally {
    await pool.end();
  }
}

// Export pool factory for use in heartbeat-engine
export { createPool };

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase();
}