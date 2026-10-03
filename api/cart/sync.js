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
    if (req.method === 'POST') {
      const { email, cart } = req.body || {};
      const cleanEmail = (email || '').trim().toLowerCase();

      if (!cleanEmail) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
      }

      const cartArray = Array.isArray(cart) ? cart : [];
      await pool.query(
        'UPDATE users SET saved_cart = $1::jsonb, updated_at = NOW() WHERE LOWER(email_address) = $2;',
        [JSON.stringify(cartArray), cleanEmail]
      );

      return res.status(200).json({
        success: true,
        message: 'Cart synchronized with cloud database.',
        cart: cartArray
      });
    }

    if (req.method === 'GET') {
      const email = req.query?.email || '';
      const cleanEmail = (email || '').trim().toLowerCase();

      if (!cleanEmail) {
        return res.status(400).json({ success: false, message: 'Email query parameter is required.' });
      }

      const { rows } = await pool.query(
        'SELECT saved_cart FROM users WHERE LOWER(email_address) = $1 LIMIT 1;',
        [cleanEmail]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      return res.status(200).json({
        success: true,
        cart: rows[0].saved_cart || []
      });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed.' });

  } catch (error) {
    console.error('[Cart Sync Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to synchronize cart: ' + error.message
    });
  }
};
