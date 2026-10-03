const { getPool } = require('../_lib/db');
const { createTransporter } = require('../_lib/mailer');

function normalizePaymentChannel(method) {
  const m = (method || '').toLowerCase().trim();
  if (m.includes('gcash')) return 'gcash';
  if (m.includes('maya')) return 'maya';
  if (m.includes('bank')) return 'bank_transfer';
  if (m.includes('cod') || m.includes('cash on delivery')) return 'cod';
  return 'gcash';
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    const { order, hasAccount } = req.body || {};

    if (!order) {
      return res.status(400).json({ success: false, message: 'Order data is required.' });
    }

    const customer = order.customer || {};
    const customerEmail = (customer.email || '').trim().toLowerCase();
    const customerName = (customer.fullName || customer.name || 'Valued Customer').trim();
    const customerContact = (customer.phone || customer.contact || '').trim();
    const deliveryAddress = (customer.address || 'Marilao, Bulacan').trim();
    const deliveryDate = customer.deliveryDate || new Date().toISOString().slice(0, 10);
    const deliveryTime = customer.deliveryTime || '09:00 AM - 12:00 PM';
    const specialNotes = customer.notes || '';

    const grandTotal = parseFloat(order.total || 0);
    const deliveryFee = 50.00;
    const subtotal = Math.max(0, grandTotal - deliveryFee);
    const downpaymentRequired = parseFloat(order.downpayment || (grandTotal * 0.5));
    const balanceDue = parseFloat(order.balance || (grandTotal - downpaymentRequired));
    const paymentMethod = normalizePaymentChannel(order.paymentMethod);
    const refNumber = order.referenceNumber || '';
    const orderCode = order.orderId || `WB-${Math.floor(10000 + Math.random() * 90000)}`;

    await client.query('BEGIN');

    // 1. Check if user already exists by email
    let userId = null;
    if (customerEmail) {
      const userRes = await client.query('SELECT id FROM users WHERE LOWER(email_address) = $1;', [customerEmail]);
      if (userRes.rows.length > 0) {
        userId = userRes.rows[0].id;
      }
    }

    // 2. Insert into orders table
    const orderInsertSql = `
      INSERT INTO orders (
        order_code, user_id, customer_name, customer_email, customer_contact,
        delivery_address, delivery_date, delivery_time, special_notes,
        subtotal_amount, delivery_fee, grand_total, downpayment_rate,
        downpayment_required, downpayment_paid, balance_due, payment_method, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'pending')
      RETURNING id, order_code, created_at;
    `;
    const orderRes = await client.query(orderInsertSql, [
      orderCode, userId, customerName, customerEmail, customerContact,
      deliveryAddress, deliveryDate, deliveryTime, specialNotes,
      subtotal, deliveryFee, grandTotal, 0.50,
      downpaymentRequired, 0.00, balanceDue, paymentMethod
    ]);
    const dbOrderId = orderRes.rows[0].id;

    // 3. Insert order items
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      let bundleId = null;
      try {
        const bundleRes = await client.query(`
          SELECT pb.id AS bundle_id
          FROM product_bundles pb
          JOIN products p ON pb.product_id = p.id
          WHERE p.product_name ILIKE $1
          LIMIT 1;
        `, [item.name || '']);
        if (bundleRes.rows.length > 0) {
          bundleId = bundleRes.rows[0].bundle_id;
        } else {
          const firstBundle = await client.query('SELECT id FROM product_bundles LIMIT 1;');
          bundleId = firstBundle.rows[0]?.id || 1;
        }
      } catch (e) {
        bundleId = 1;
      }

      await client.query(`
        INSERT INTO order_items (
          order_id, product_bundle_id, product_name, pieces_per_bundle, unit_price, quantity, total_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [
        dbOrderId,
        bundleId,
        item.name || 'Bakery Item',
        item.pieces || 25,
        parseFloat(item.price || 105),
        parseInt(item.qty || 1, 10),
        parseFloat(item.total || ((item.price || 105) * (item.qty || 1)))
      ]);
    }

    // 4. Insert downpayment record in payments table
    if (refNumber) {
      await client.query(`
        INSERT INTO payments (
          order_id, payment_channel, payment_stage, amount, reference_number, verification_status
        ) VALUES ($1, $2, 'downpayment', $3, $4, 'unverified');
      `, [dbOrderId, paymentMethod, downpaymentRequired, refNumber]);
    }

    // 5. Insert initial status history
    await client.query(`
      INSERT INTO order_status_history (
        order_id, previous_status, new_status, notes
      ) VALUES ($1, NULL, 'pending', 'Order placed by customer via wholesale portal');
    `, [dbOrderId]);

    // 6. Clear user saved cart after successful checkout
    if (userId) {
      await client.query(`UPDATE users SET saved_cart = '[]'::jsonb WHERE id = $1;`, [userId]);
    }

    await client.query('COMMIT');

    // 7. Send digital receipt email in background via Port 465
    if (isValidEmail(customerEmail)) {
      try {
        const transporter = createTransporter();
        const fromAddress = process.env.GMAIL_USER || 'crbwebake@gmail.com';
        transporter.sendMail({
          from: `"WeBake Bakery" <${fromAddress}>`,
          to: customerEmail,
          subject: `WeBake Order Confirmation & Receipt - ${orderCode}`,
          text: `Thank you for your order with Crumbs N' Rolls Bakery! Order ID: ${orderCode}. Total: PHP ${grandTotal}. Downpayment: PHP ${downpaymentRequired}. Remaining Balance: PHP ${balanceDue}.`,
          html: `
            <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:20px; border:1px solid #ebd9c8; border-radius:10px; background:#fff;">
              <h2 style="color:#A0522D; text-align:center;">WeBake Order Confirmation</h2>
              <p>Thank you for choosing <strong>Crumbs N' Rolls Bakery</strong>! Your wholesale bread order has been successfully recorded in our system.</p>
              <div style="background:#FAF6F0; padding:15px; border-radius:8px; margin:20px 0;">
                <p style="margin:5px 0;"><strong>Order ID:</strong> ${orderCode}</p>
                <p style="margin:5px 0;"><strong>Total Value:</strong> &#8369;${grandTotal.toFixed(2)}</p>
                <p style="margin:5px 0; color:#28a745;"><strong>50% Downpayment:</strong> &#8369;${downpaymentRequired.toFixed(2)} (${order.paymentMethod || 'GCash'})</p>
                <p style="margin:5px 0; color:#A0522D;"><strong>Balance Upon Delivery:</strong> &#8369;${balanceDue.toFixed(2)}</p>
              </div>
              <p style="font-size:12px; color:#888; text-align:center;">1356 Cordero St., Lambakin, Marilao, Bulacan &bull; &copy; 2026 WeBake</p>
            </div>
          `
        }).catch(err => console.error('[Order Email Error]:', err.message));
      } catch (mailErr) {
        console.error('[Mailer Init Error]:', mailErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Order created and persisted successfully in cloud database.',
      orderId: orderCode,
      databaseId: dbOrderId,
      status: 'pending'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Order Placement Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record order: ' + error.message
    });
  } finally {
    client.release();
  }
};
