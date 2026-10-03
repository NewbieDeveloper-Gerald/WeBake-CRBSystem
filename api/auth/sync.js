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
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const userRes = await pool.query(`
      SELECT u.id, u.role_id, u.full_name, u.email_address, u.contact_number,
             u.partner_status, u.is_active,
             a.address_line1 AS address
      FROM users u
      LEFT JOIN user_addresses a ON a.user_id = u.id AND a.is_default = TRUE
      WHERE LOWER(u.email_address) = $1
      LIMIT 1;
    `, [cleanEmail]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const user = userRes.rows[0];

    // Query orders
    const ordersRes = await pool.query(`
      SELECT o.id, o.order_code, o.customer_name, o.customer_email, o.customer_contact,
             o.delivery_address, o.delivery_date, o.delivery_time, o.special_notes,
             o.subtotal_amount, o.delivery_fee, o.grand_total,
             o.downpayment_required, o.downpayment_paid, o.balance_due,
             o.payment_method, o.status, o.created_at
      FROM orders o
      WHERE o.user_id = $1 OR LOWER(o.customer_email) = $2
      ORDER BY o.created_at DESC;
    `, [user.id, cleanEmail]);

    const orderRows = ordersRes.rows;
    let orderHistory = [];

    if (orderRows.length > 0) {
      const orderIds = orderRows.map(o => o.id);
      const itemsRes = await pool.query(`
        SELECT order_id, product_name, pieces_per_bundle, unit_price, quantity, total_price
        FROM order_items
        WHERE order_id = ANY($1::bigint[])
        ORDER BY id ASC;
      `, [orderIds]);

      const itemsByOrderId = {};
      itemsRes.rows.forEach(item => {
        if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
        itemsByOrderId[item.order_id].push({
          name: item.product_name,
          pieces: item.pieces_per_bundle,
          price: parseFloat(item.unit_price),
          qty: item.quantity,
          total: parseFloat(item.total_price)
        });
      });

      orderHistory = orderRows.map(o => ({
        orderId: o.order_code,
        date: new Date(o.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        items: itemsByOrderId[o.id] || [],
        total: parseFloat(o.grand_total),
        downpayment: parseFloat(o.downpayment_required),
        balance: parseFloat(o.balance_due),
        paymentMethod: o.payment_method,
        status: o.status,
        customer: {
          name: o.customer_name,
          email: o.customer_email,
          contact: o.customer_contact,
          address: o.delivery_address,
          deliveryDate: o.delivery_date,
          deliveryTime: o.delivery_time,
          notes: o.special_notes
        },
        createdAt: o.created_at
      }));
    }

    let partnerStatus = user.partner_status || 'none';
    try {
      const partnerRes = await pool.query(
        'SELECT status FROM wholesale_partner_applications WHERE user_id = $1 OR LOWER(contact_email) = $2 ORDER BY id DESC LIMIT 1;',
        [user.id, cleanEmail]
      );
      if (partnerRes.rows.length > 0) {
        partnerStatus = partnerRes.rows[0].status;
      }
    } catch (e) {}

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email_address,
        contact: user.contact_number,
        address: user.address || '',
        partnerStatus: partnerStatus,
        orderHistory: orderHistory
      }
    });

  } catch (error) {
    console.error('[Auth Sync Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync user: ' + error.message
    });
  }
};
