const { getPool } = require('./_lib/db');
const { handleCors, sendJson } = require('./_lib/http');

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'GET, HEAD, OPTIONS')) return;

  const startTime = Date.now();
  let dbStatus = 'disconnected';

  try {
    const pool = getPool();
    await pool.query('SELECT 1;');
    dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'error: ' + (err.message || 'unknown');
  }

  return sendJson(res, dbStatus === 'connected' ? 200 : 503, {
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    service: 'webake-crbsystem-api',
    database: dbStatus,
    responseTimeMs: Date.now() - startTime,
    timestamp: new Date().toISOString()
  });
};
