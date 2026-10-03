const { getPool } = require('../_lib/db');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const pool = getPool();

  try {
    const email = req.method === 'GET'
      ? (req.query?.email || '')
      : (req.body?.email || '');

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'Email query parameter is required.' });
    }

    const { rows } = await pool.query(
      'SELECT id, full_name, email_address FROM users WHERE LOWER(email_address) = $1 LIMIT 1;',
      [cleanEmail]
    );

    return res.status(200).json({
      success: true,
      exists: rows.length > 0,
      user: rows.length > 0 ? { name: rows[0].full_name, email: rows[0].email_address } : null
    });

  } catch (error) {
    console.error('[Auth Check Email Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check email: ' + error.message
    });
  }
};
