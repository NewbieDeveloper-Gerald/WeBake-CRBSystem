const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    const config = process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
          max: 3,
          connectionTimeoutMillis: 6000
        }
      : {
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '6543', 10),
          database: process.env.DB_NAME || 'postgres',
          ssl: { rejectUnauthorized: false },
          max: 3,
          connectionTimeoutMillis: 6000
        };

    pool = new Pool(config);
  }
  return pool;
}

module.exports = { getPool };
