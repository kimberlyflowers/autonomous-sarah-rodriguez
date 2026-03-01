// Database setup script for BLOOM Agent Infrastructure
// Connects to Railway PostgreSQL and creates schema

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Railway PostgreSQL connection
const pool = new Pool({
  host: process.env.PGHOST || 'postgres.railway.internal',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'your_postgres_password_here',
  database: 'postgres', // Connect to default database first
  ssl: false // Railway internal network doesn't need SSL
});

async function setupDatabase() {
  console.log('🔧 Setting up BLOOM Agent Infrastructure database...');

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
    const bloomPool = new Pool({
      host: process.env.PGHOST || 'postgres.railway.internal',
      port: process.env.PGPORT || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'your_postgres_password_here',
      database: 'bloom_heartbeat',
      ssl: false
    });

    // Read and execute schema
    console.log('🏗️  Creating tables and indexes...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');

    await bloomPool.query(schemaSql);

    console.log('✅ Database setup complete!');
    console.log('📊 Sarah Rodriguez agent profile created');
    console.log('📋 Trust metrics baseline established');

    // Test connection
    const result = await bloomPool.query(`
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

    await bloomPool.end();

  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  }
}

// Connection test function
async function testConnection() {
  const testPool = new Pool({
    host: process.env.PGHOST || 'postgres.railway.internal',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'your_postgres_password_here',
    database: 'bloom_heartbeat',
    ssl: false
  });

  try {
    const result = await testPool.query('SELECT NOW() as current_time');
    console.log('✅ Database connection successful');
    console.log('⏰ Server time:', result.rows[0].current_time);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  } finally {
    await testPool.end();
  }
}

// Export for use in heartbeat-engine
module.exports = {
  setupDatabase,
  testConnection,
  createPool: () => new Pool({
    host: process.env.PGHOST || 'postgres.railway.internal',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'your_postgres_password_here',
    database: 'bloom_heartbeat',
    ssl: false
  })
};

// Run setup if called directly
if (require.main === module) {
  setupDatabase();
}