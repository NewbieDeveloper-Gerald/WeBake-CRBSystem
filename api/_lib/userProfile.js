/**
 * ====================================================================
 * WeBake - User Profile & Data Aggregator Helper (userProfile.js)
 * Shared profile and orders history data mapping
 * Consolidates duplicate logic across login and session endpoints
 * ====================================================================
 */

async function fetchUserProfile(pool, userId, cleanEmail) {
  // 1. Fetch user base data with default address
  const userQuery = `
    SELECT u.id, u.role_id, r.role_name, u.full_name, u.email_address, u.contact_number,
           u.is_active, u.saved_cart,
           a.address_line1 AS address
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN user_addresses a ON a.user_id = u.id AND a.is_default = TRUE
    WHERE u.id = $1 OR LOWER(u.email_address) = $2
    LIMIT 1;
  `;
  const userRes = await pool.query(userQuery, [userId || 0, cleanEmail]);

  if (userRes.rows.length === 0) {
    return null;
  }

  const user = userRes.rows[0];

  // 2. Fetch order history
  const ordersRes = await pool.query(`
    SELECT o.id, o.order_code, o.customer_name, o.customer_email, o.customer_contact,
           o.delivery_address, o.delivery_date, o.delivery_time, o.special_notes,
           o.subtotal_amount, o.delivery_fee, o.grand_total,
           o.downpayment_required, o.downpayment_paid, o.balance_due,
           o.payment_method, o.status, o.created_at
    FROM orders o
    WHERE o.user_id = $1 OR LOWER(o.customer_email) = $2
    ORDER BY o.created_at DESC;
  `, [user.id, user.email_address.toLowerCase()]);

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

  return {
    id: user.id,
    name: user.full_name,
    email: user.email_address,
    contact: user.contact_number,
    address: user.address || '',
    savedCart: user.saved_cart || [],
    orderHistory: orderHistory
  };
}

module.exports = {
  fetchUserProfile
};
