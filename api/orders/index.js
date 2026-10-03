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

// 1. Create Order
async function handleCreateOrder(req, res, pool) {
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

    // Link user if account exists
    let userId = null;
    if (customerEmail) {
      const userRes = await client.query('SELECT id FROM users WHERE LOWER(email_address) = $1;', [customerEmail]);
      if (userRes.rows.length > 0) {
        userId = userRes.rows[0].id;
      }
    }

    // Insert into orders table
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

    // Insert order items
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

    // Insert downpayment record in payments table
    if (refNumber) {
      await client.query(`
        INSERT INTO payments (
          order_id, payment_channel, payment_stage, amount, reference_number, verification_status
        ) VALUES ($1, $2, 'downpayment', $3, $4, 'unverified');
      `, [dbOrderId, paymentMethod, downpaymentRequired, refNumber]);
    }

    // Insert initial status history
    await client.query(`
      INSERT INTO order_status_history (
        order_id, previous_status, new_status, notes
      ) VALUES ($1, NULL, 'pending', 'Order placed by customer via wholesale portal');
    `, [dbOrderId]);

    // Clear user saved cart after successful checkout
    if (userId) {
      await client.query(`UPDATE users SET saved_cart = '[]'::jsonb WHERE id = $1;`, [userId]);
    }

    await client.query('COMMIT');

    // Send digital receipt email in background via Port 465
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
    throw error;
  } finally {
    client.release();
  }
}

// 2. Resend Receipt
async function handleReceipt(req, res) {
  const { order } = req.body || {};
  if (!order) return res.status(400).json({ success: false, message: 'Order data required' });

  const recipient = (order.customer?.email || '').trim().toLowerCase();
  if (!recipient) return res.status(400).json({ success: false, message: 'Customer email required' });

  const transporter = createTransporter();
  const fromAddress = process.env.GMAIL_USER || 'crbwebake@gmail.com';
  const orderId = order.orderId || 'WB-ORD';

  await transporter.sendMail({
    from: `"WeBake Bakery" <${fromAddress}>`,
    to: recipient,
    subject: `WeBake Order Confirmation & Receipt - ${orderId}`,
    text: `Thank you for your order with Crumbs N' Rolls Bakery! Order ID: ${orderId}. Total: PHP ${order.total || 0}. 50% Downpayment: PHP ${order.downpayment || 0}. Remaining Balance: PHP ${order.balance || 0}.`,
    html: `
      <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:20px; border:1px solid #ebd9c8; border-radius:10px; background:#fff;">
        <h2 style="color:#A0522D; text-align:center;">WeBake Order Confirmation</h2>
        <p>Thank you for choosing <strong>Crumbs N' Rolls Bakery</strong>! Your wholesale bread order has been successfully recorded.</p>
        <div style="background:#FAF6F0; padding:15px; border-radius:8px; margin:20px 0;">
          <p style="margin:5px 0;"><strong>Order ID:</strong> ${orderId}</p>
          <p style="margin:5px 0;"><strong>Total Value:</strong> &#8369;${(order.total || 0).toLocaleString()}</p>
          <p style="margin:5px 0; color:#28a745;"><strong>50% Downpayment Paid:</strong> &#8369;${(order.downpayment || 0).toLocaleString()} (${order.paymentMethod || 'GCash'})</p>
          <p style="margin:5px 0; color:#A0522D;"><strong>Remaining Balance Upon Delivery:</strong> &#8369;${(order.balance || 0).toLocaleString()}</p>
        </div>
        <p style="font-size:12px; color:#888; text-align:center;">1356 Cordero St., Lambakin, Marilao, Bulacan &bull; &copy; 2026 WeBake</p>
      </div>
    `
  });

  return res.status(200).json({ success: true, message: 'Digital receipt dispatched successfully.' });
}

// 3. Cancel Order
async function handleCancelOrder(req, res, pool) {
  const { orderId, email, refundDetails } = req.body || {};
  const cleanOrderId = (orderId || '').trim().toUpperCase();

  if (!cleanOrderId) {
    return res.status(400).json({ success: false, message: 'Order ID is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      'SELECT id, status FROM orders WHERE UPPER(order_code) = $1 LIMIT 1;',
      [cleanOrderId]
    );

    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = orderRes.rows[0];
    const prevStatus = order.status;

    await client.query(
      `UPDATE orders SET status = 'cancellation_requested' WHERE id = $1;`,
      [order.id]
    );

    const refundNotes = refundDetails
      ? `Customer requested cancellation. Refund method: ${refundDetails.wallet || 'E-Wallet'} (${refundDetails.accountNum || ''} - ${refundDetails.accountName || ''}). Reason: ${refundDetails.reason || 'Not specified'}.`
      : 'Customer requested order cancellation and downpayment refund.';

    await client.query(
      `INSERT INTO order_status_history (order_id, previous_status, new_status, notes)
       VALUES ($1, $2, 'cancellation_requested', $3);`,
      [order.id, prevStatus, refundNotes]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Order cancellation and refund request recorded successfully.'
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// 4. Track Order / Partner Application
async function handleTrack(req, res, pool) {
  const id = (req.method === 'GET' ? req.query?.id : req.body?.id) || '';
  const contact = (req.method === 'GET' ? req.query?.contact : req.body?.contact) || '';
  const mode = (req.method === 'GET' ? req.query?.mode : req.body?.mode) || '';

  const cleanId = id.trim().toUpperCase();
  const cleanContact = contact.trim().toLowerCase();

  if (!cleanId) {
    return res.status(400).json({ success: false, message: 'Tracking Reference ID is required.' });
  }

  const isPartner = mode === 'partner' || cleanId.includes('PRT');

  if (isPartner) {
    const pRes = await pool.query(`
      SELECT application_code, applicant_name, applicant_email, applicant_phone,
             business_name, business_type, years_in_operation, estimated_weekly_volume,
             delivery_address, products_of_interest, additional_notes, status, updated_at
      FROM partner_applications
      WHERE UPPER(application_code) = $1
         OR (LOWER(applicant_email) = $2 OR applicant_phone = $3)
      ORDER BY id DESC LIMIT 1;
    `, [cleanId, cleanContact, cleanContact.replace(/\D/g, '')]);

    if (pRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No matching wholesale partnership application found.' });
    }

    const p = pRes.rows[0];
    return res.status(200).json({
      success: true,
      type: 'partner',
      partner: {
        appId: p.application_code,
        email: p.applicant_email,
        phone: p.applicant_phone,
        status: p.status,
        date: p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        details: {
          'owner-name': p.applicant_name,
          'business-name': p.business_name,
          'business-type': p.business_type,
          email: p.applicant_email,
          phone: p.applicant_phone,
          years: p.years_in_operation,
          volume: p.estimated_weekly_volume,
          address: p.delivery_address,
          products: p.products_of_interest || [],
          notes: p.additional_notes || ''
        }
      }
    });
  } else {
    const oRes = await pool.query(`
      SELECT id, order_code, customer_name, customer_email, customer_contact,
             delivery_address, delivery_date, delivery_time, special_notes,
             subtotal_amount, delivery_fee, grand_total, downpayment_required,
             downpayment_paid, balance_due, payment_method, status, created_at
      FROM orders
      WHERE UPPER(order_code) = $1
      LIMIT 1;
    `, [cleanId]);

    if (oRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No matching order found for this tracking ID.' });
    }

    const o = oRes.rows[0];

    const itemsRes = await pool.query(`
      SELECT product_name, pieces_per_bundle, unit_price, quantity, total_price
      FROM order_items
      WHERE order_id = $1
      ORDER BY id ASC;
    `, [o.id]);

    const items = itemsRes.rows.map(it => ({
      name: it.product_name,
      pieces: it.pieces_per_bundle,
      price: parseFloat(it.unit_price),
      qty: it.quantity,
      total: parseFloat(it.total_price)
    }));

    const payRes = await pool.query(`
      SELECT reference_number, payment_channel
      FROM payments
      WHERE order_id = $1
      ORDER BY id DESC LIMIT 1;
    `, [o.id]);
    const refNo = payRes.rows[0]?.reference_number || '';

    return res.status(200).json({
      success: true,
      type: 'order',
      order: {
        orderId: o.order_code,
        date: new Date(o.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        total: parseFloat(o.grand_total),
        downpayment: parseFloat(o.downpayment_required),
        balance: parseFloat(o.balance_due),
        paymentMethod: o.payment_method,
        referenceNumber: refNo,
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
        items: items
      }
    });
  }
}

// Main Dispatcher
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query?.action || (req.url.split('?')[0].split('/').filter(Boolean).pop());
  const pool = getPool();

  try {
    if (action === 'receipt') {
      return await handleReceipt(req, res);
    } else if (action === 'cancel') {
      return await handleCancelOrder(req, res, pool);
    } else if (action === 'track') {
      return await handleTrack(req, res, pool);
    } else {
      return await handleCreateOrder(req, res, pool);
    }
  } catch (error) {
    console.error('[Orders Router Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Orders operation failed: ' + error.message
    });
  }
};
