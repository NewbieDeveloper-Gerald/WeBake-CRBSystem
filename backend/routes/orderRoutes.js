/**
 * ====================================================================
 * WeBake - Order Routes (Supabase PostgreSQL Backed)
 * Handles order creation, status tracking, cancellations, and receipts
 * ====================================================================
 */

const express = require('express');
const db = require('../database/db');
const { sendOrderReceiptEmail } = require('../services/mailer');

const router = express.Router();

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

function normalizePaymentChannel(method) {
  const m = (method || '').toLowerCase().trim();
  if (m.includes('gcash')) return 'gcash';
  if (m.includes('maya')) return 'maya';
  if (m.includes('bank')) return 'bank_transfer';
  if (m.includes('cod') || m.includes('cash on delivery')) return 'cod';
  return 'gcash';
}

/**
 * POST /api/orders
 * Persists a new wholesale order into Supabase database
 */
router.post('/', async (req, res) => {
  const client = await db.getClient();
  try {
    const { order, hasAccount } = req.body || {};

    if (!order) {
      return res.status(400).json({
        success: false,
        message: 'Order data is required.'
      });
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
      const userRes = await client.query('SELECT id FROM users WHERE email_address = $1;', [customerEmail]);
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
      // Find bundle ID for product
      const bundleRes = await client.query(`
        SELECT pb.id AS bundle_id, pb.pieces_per_bundle, pb.wholesale_price, p.product_name
        FROM product_bundles pb
        JOIN products p ON pb.product_id = p.id
        WHERE p.product_name ILIKE $1 OR p.id = $2
        LIMIT 1;
      `, [item.name || '', parseInt(item.id || 0, 10)]);

      const bundleId = bundleRes.rows[0]?.bundle_id || 1;
      const pieces = bundleRes.rows[0]?.pieces_per_bundle || (item.min || 25);
      const unitPrice = parseFloat(bundleRes.rows[0]?.wholesale_price || (item.price || 105));
      const qty = parseInt(item.qty || 1, 10);
      const itemTotal = unitPrice * qty;

      await client.query(`
        INSERT INTO order_items (
          order_id, product_bundle_id, product_name, pieces_per_bundle, unit_price, quantity, total_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [dbOrderId, bundleId, item.name || 'Bakery Bundle', pieces, unitPrice, qty, itemTotal]);
    }

    // 4. Insert initial payment record if reference number was supplied
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

    await client.query('COMMIT');

    // 6. Asynchronously trigger digital receipt email
    if (isValidEmail(customerEmail)) {
      order.customer = customer;
      order.customer.email = customerEmail;
      order.orderId = orderCode;
      sendOrderReceiptEmail({ order, hasAccount: !!hasAccount })
        .then(info => console.log(`[Order DB] Dispatched receipt for ${orderCode} to ${customerEmail} (ID: ${info?.messageId})`))
        .catch(err => console.error(`[Order Receipt Warning]: Failed to email receipt for ${orderCode}:`, err.message));
    }

    return res.status(201).json({
      success: true,
      message: 'Order created and persisted successfully.',
      orderId: orderCode,
      databaseId: dbOrderId,
      status: 'pending'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Order Placement Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record order in database.',
      error: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/orders/:orderCode
 * Retrieves live order tracking details, line items, and audit history from Supabase
 */
router.get('/:orderCode', async (req, res) => {
  try {
    const { orderCode } = req.params;
    const { contact } = req.query;

    let queryText = `
      SELECT 
        o.id, o.order_code, o.customer_name, o.customer_email, o.customer_contact,
        o.delivery_address, o.delivery_date, o.delivery_time, o.special_notes,
        o.subtotal_amount, o.delivery_fee, o.grand_total,
        o.downpayment_required, o.downpayment_paid, o.balance_due,
        o.payment_method, o.status, o.created_at, o.updated_at
      FROM orders o
      WHERE o.order_code ILIKE $1
    `;
    const params = [orderCode.trim()];

    if (contact) {
      queryText += ' AND o.customer_contact = $2';
      params.push(contact.trim());
    }

    const { rows } = await db.query(queryText, params);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Order ${orderCode} not found.`
      });
    }

    const orderRow = rows[0];

    // Fetch items
    const itemsRes = await db.query(`
      SELECT id, product_name, pieces_per_bundle, unit_price, quantity, total_price
      FROM order_items
      WHERE order_id = $1
      ORDER BY id ASC;
    `, [orderRow.id]);

    // Fetch status history
    const historyRes = await db.query(`
      SELECT previous_status, new_status, notes, created_at
      FROM order_status_history
      WHERE order_id = $1
      ORDER BY created_at ASC;
    `, [orderRow.id]);

    // Fetch payments
    const paymentsRes = await db.query(`
      SELECT payment_channel, payment_stage, amount, reference_number, verification_status, created_at
      FROM payments
      WHERE order_id = $1
      ORDER BY created_at ASC;
    `, [orderRow.id]);

    // Fetch cancellation request if any
    const cancelRes = await db.query(`
      SELECT reason, reason_details, refund_channel, refund_account_name, refund_account_number,
             eligible_refund_amount, status, created_at
      FROM cancellation_requests
      WHERE order_id = $1;
    `, [orderRow.id]);

    return res.json({
      success: true,
      order: {
        id: orderRow.id,
        orderCode: orderRow.order_code,
        customerName: orderRow.customer_name,
        customerEmail: orderRow.customer_email,
        customerContact: orderRow.customer_contact,
        deliveryAddress: orderRow.delivery_address,
        deliveryDate: orderRow.delivery_date,
        deliveryTime: orderRow.delivery_time,
        notes: orderRow.special_notes,
        subtotal: parseFloat(orderRow.subtotal_amount),
        deliveryFee: parseFloat(orderRow.delivery_fee),
        grandTotal: parseFloat(orderRow.grand_total),
        downpaymentRequired: parseFloat(orderRow.downpayment_required),
        downpaymentPaid: parseFloat(orderRow.downpayment_paid),
        balanceDue: parseFloat(orderRow.balance_due),
        paymentMethod: orderRow.payment_method,
        status: orderRow.status,
        createdAt: orderRow.created_at,
        items: itemsRes.rows.map(item => ({
          name: item.product_name,
          pieces: item.pieces_per_bundle,
          unitPrice: parseFloat(item.unit_price),
          quantity: item.quantity,
          totalPrice: parseFloat(item.total_price)
        })),
        history: historyRes.rows,
        payments: paymentsRes.rows,
        cancellation: cancelRes.rows[0] || null
      }
    });
  } catch (error) {
    console.error('[Order Lookup Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order.',
      error: error.message
    });
  }
});

/**
 * POST /api/orders/cancel
 * Customer-initiated cancellation request with 50% refund details
 */
router.post('/cancel', async (req, res) => {
  const client = await db.getClient();
  try {
    const { orderCode, reason, reasonDetails, refundChannel, accountName, accountNumber } = req.body || {};

    if (!orderCode || !reason || !refundChannel || !accountName || !accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Order code, reason, refund channel, account name, and account number are required.'
      });
    }

    await client.query('BEGIN');

    // 1. Find order
    const orderRes = await client.query('SELECT id, status, downpayment_required FROM orders WHERE order_code = $1;', [orderCode.trim()]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = orderRes.rows[0];
    if (['baking', 'out_for_delivery', 'delivered'].includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Orders in '${order.status}' status cannot be cancelled as baking or delivery has already commenced.`
      });
    }

    // 2. Insert or update cancellation request
    const refundAmount = parseFloat(order.downpayment_required);
    await client.query(`
      INSERT INTO cancellation_requests (
        order_id, reason, reason_details, refund_channel, refund_account_name, refund_account_number, eligible_refund_amount, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review')
      ON CONFLICT (order_id) DO UPDATE SET
        reason = EXCLUDED.reason,
        reason_details = EXCLUDED.reason_details,
        refund_channel = EXCLUDED.refund_channel,
        refund_account_name = EXCLUDED.refund_account_name,
        refund_account_number = EXCLUDED.refund_account_number,
        eligible_refund_amount = EXCLUDED.eligible_refund_amount,
        status = 'pending_review';
    `, [order.id, reason, reasonDetails || '', refundChannel.toLowerCase(), accountName, accountNumber, refundAmount]);

    // 3. Update order status
    const prevStatus = order.status;
    await client.query('UPDATE orders SET status = $1 WHERE id = $2;', ['cancellation_requested', order.id]);

    // 4. Log status history
    await client.query(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, notes)
      VALUES ($1, $2, 'cancellation_requested', $3);
    `, [order.id, prevStatus, `Customer requested cancellation. Reason: ${reason}`]);

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Cancellation and 50% refund request submitted successfully.',
      orderCode: orderCode,
      eligibleRefundAmount: refundAmount,
      status: 'cancellation_requested'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Cancellation Request Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process cancellation request.',
      error: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/orders/receipt
 * Legacy / direct receipt email dispatch endpoint
 */
router.post('/receipt', async (req, res) => {
  try {
    const { order, hasAccount } = req.body || {};

    if (!order) {
      return res.status(400).json({
        success: false,
        message: 'Order data is required.'
      });
    }

    const customerEmail = (order.customer?.email || '').trim().toLowerCase();
    if (!customerEmail || !isValidEmail(customerEmail)) {
      return res.status(400).json({
        success: false,
        message: 'A valid customer email is required to dispatch the digital receipt.'
      });
    }

    order.customer = order.customer || {};
    order.customer.email = customerEmail;

    const info = await sendOrderReceiptEmail({
      order: order,
      hasAccount: !!hasAccount
    });

    return res.status(200).json({
      success: true,
      message: 'Digital receipt dispatched successfully.',
      messageId: info.messageId
    });
  } catch (error) {
    console.error('[Order Receipt Error]:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to dispatch digital receipt.'
    });
  }
});

module.exports = router;
