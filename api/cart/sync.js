const { getPool } = require('../_lib/db');
const { handleCors, sendJson, sendError } = require('../_lib/http');
const { readSession } = require('../_lib/session');

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'GET, POST, OPTIONS')) return;

  const session = readSession(req);

  // Require active authentication session to read or modify cart (Fixes C3)
  if (!session || !session.uid) {
    return sendJson(res, 401, {
      success: false,
      error: 'unauthorized',
      message: 'Active session required to synchronize cart.'
    });
  }

  const pool = getPool();

  try {
    if (req.method === 'POST') {
      const { cart } = req.body || {};
      const rawCart = Array.isArray(cart) ? cart : [];

      // Sanitize cart items: keep only valid item structure, max 50 items
      const cartArray = rawCart.slice(0, 50).map(item => {
        const pid = parseInt(item.productId || item.id || 0, 10);
        return {
          id: pid,
          productId: pid,
          name: String(item.name || 'Bakery Item').slice(0, 100),
          price: parseFloat(item.price || 0),
          qty: Math.max(1, Math.min(999, parseInt(item.qty || 1, 10))),
          min: parseInt(item.min || 25, 10)
        };
      }).filter(it => it.id > 0);

      await pool.query(
        'UPDATE users SET saved_cart = $1::jsonb, updated_at = NOW() WHERE id = $2;',
        [JSON.stringify(cartArray), session.uid]
      );

      return sendJson(res, 200, {
        success: true,
        message: 'Cart synchronized with cloud database.',
        cart: cartArray
      });
    }

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        'SELECT saved_cart FROM users WHERE id = $1 LIMIT 1;',
        [session.uid]
      );

      if (rows.length === 0) {
        return sendJson(res, 404, { success: false, message: 'User not found.' });
      }

      return sendJson(res, 200, {
        success: true,
        cart: rows[0].saved_cart || []
      });
    }

    return sendJson(res, 405, { success: false, message: 'Method not allowed.' });

  } catch (error) {
    return sendError(res, 500, 'Failed to synchronize cart.', error);
  }
};
