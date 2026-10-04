const express = require('express');
const router = express.Router();
const db = require('../database/db');

// POST /api/cart/sync
router.post('/sync', async (req, res) => {
  try {
    const { email, cart } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'Email is required to synchronize cart.' });
    }

    const rawCart = Array.isArray(cart) ? cart : [];
    const cartArray = rawCart.slice(0, 50).map(item => {
      const pid = parseInt(item.productId || item.id || 0, 10);
      return {
        id: pid,
        productId: pid,
        name: String(item.name || 'Bakery Item').slice(0, 100),
        price: parseFloat(item.price || 0),
        qty: Math.max(1, Math.min(99, parseInt(item.qty || 1, 10))),
        min: parseInt(item.min || 25, 10)
      };
    }).filter(it => it.id > 0);

    const userRes = await db.query(
      'UPDATE users SET saved_cart = $1::jsonb, updated_at = NOW() WHERE LOWER(email_address) = $2 RETURNING id;',
      [JSON.stringify(cartArray), cleanEmail]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Cart synchronized with cloud database.',
      cart: cartArray
    });
  } catch (error) {
    console.error('[Cart Sync POST Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to synchronize cart.' });
  }
});

// GET /api/cart/sync
router.get('/sync', async (req, res) => {
  try {
    const email = (req.query?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required to fetch cart.' });
    }

    const { rows } = await db.query(
      'SELECT saved_cart FROM users WHERE LOWER(email_address) = $1 LIMIT 1;',
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      cart: rows[0].saved_cart || []
    });
  } catch (error) {
    console.error('[Cart Sync GET Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch cart.' });
  }
});

module.exports = router;
