/**
 * ====================================================================
 * WeBake - Supabase PostgreSQL Database Client
 * Connection pooling and query helper with SSL support
 * ====================================================================
 */

require('dotenv').config();
const { Pool } = require('pg');

const poolConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'postgres',
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
};

// If DATABASE_URL is present and DB_HOST is not explicitly preferred, we can also support connectionString
const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[Supabase DB Pool Error]: Unexpected client error', err.message);
});

/**
 * Execute parameterized query
 * @param {string} text - SQL statement with $1, $2 placeholders
 * @param {Array} params - Array of parameter values
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production' && duration > 1000) {
      console.warn(`[Slow Query] ${duration}ms: ${text.slice(0, 80)}...`);
    }
    return res;
  } catch (error) {
    console.error(`[DB Query Error] Query: "${text.slice(0, 100)}..." Error:`, error.message);
    throw error;
  }
}

/**
 * Get a dedicated client from the pool (e.g. for multi-statement transactions)
 */
async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);

  // Set timeout to prevent leaked connections
  const timeout = setTimeout(() => {
    console.error('[DB Client Leak] A client has been checked out for more than 10 seconds!');
  }, 10000);

  client.release = () => {
    clearTimeout(timeout);
    client.query = originalQuery;
    client.release = originalRelease;
    return originalRelease();
  };

  return client;
}

/**
 * Perform a quick database health ping
 */
async function ping() {
  try {
    const res = await query('SELECT NOW() as current_time, current_database() as db;');
    return {
      connected: true,
      database: res.rows[0].db,
      timestamp: res.rows[0].current_time
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

module.exports = {
  pool,
  query,
  getClient,
  ping
};
