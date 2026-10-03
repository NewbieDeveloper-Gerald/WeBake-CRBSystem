const { getPool } = require('../_lib/db');
const { handleCors, sendJson, sendError } = require('../_lib/http');

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'GET, POST, OPTIONS')) return;

  const pool = getPool();

  try {
    const email = req.method === 'GET'
      ? (req.query?.email || '')
      : (req.body?.email || '');

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      return sendJson(res, 400, { success: false, message: 'Email parameter is required.' });
    }

    const { rows } = await pool.query(
      'SELECT id FROM users WHERE LOWER(email_address) = $1 LIMIT 1;',
      [cleanEmail]
    );

    // Only return boolean existence without leaking user's full name or metadata (Fixes H9)
    return sendJson(res, 200, {
      success: true,
      exists: rows.length > 0
    });

  } catch (error) {
    return sendError(res, 500, 'Failed to check email availability.', error);
  }
};
