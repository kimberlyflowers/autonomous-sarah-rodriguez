// Database setup module - Re-exports from auto-setup
// This file bridges the import paths expected by other modules

import { Pool } from 'pg';
import { ensureDatabaseExists, testDatabaseConnection } from '../src/database/auto-setup.js';

// Create connection pool to bloom_heartbeat database
export const createPool = () => {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    });
  }
  return new Pool({
    host: process.env.PGHOST || 'postgres.railway.internal',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    database: 'bloom_heartbeat',
    ssl: false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });
};

// Re-export functions from auto-setup
export { ensureDatabaseExists, testDatabaseConnection };

// Default export for compatibility
export default {
  createPool,
  ensureDatabaseExists,
  testDatabaseConnection
};