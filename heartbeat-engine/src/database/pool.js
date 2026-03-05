// Singleton database pool — one pool for the entire app
import { Pool } from 'pg';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('db-pool');

let _pool = null;

export function getSharedPool() {
  if (!_pool) {
    if (process.env.DATABASE_URL) {
      _pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: false,
        max: 10,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
      });
    } else {
      _pool = new Pool({
        host: process.env.PGHOST || 'postgres.railway.internal',
        port: process.env.PGPORT || 5432,
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD,
        database: 'bloom_heartbeat',
        ssl: false,
        max: 10,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
      });
    }
    _pool.on('error', (err) => {
      logger.error('Postgres pool error', { error: err.message });
    });
    logger.info('Shared DB pool created');
  }
  return _pool;
}

export default { getSharedPool };
