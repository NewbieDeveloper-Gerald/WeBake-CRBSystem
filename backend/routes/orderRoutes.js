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
    const hasAccount = req.body?.hasAccount;
    const order = (req.body?.order && typeof req.body.order === 'object') ? req.body.order : req.body;

    if (!order || (!order.total && !order.totalAmount && !order.grandTotal && !order.items)) {
      return res.status(400).json({
        success: false,
        message: 'Order data is required.'
      });
    }

    const customer = order.customer || {
      fullName: order.customerName || order.name,
      email: order.customerEmail || order.email,
      phone: order.customerContact || order.contact || order.phone,
      address: order.deliveryAddress || order.address,
      deliveryDate: order.deliveryDate,
      deliveryTime: order.deliveryTime,
      notes: order.notes
    };
    const customerEmail = (customer.email || '').trim().toLowerCase();
    const customerName = (customer.fullName || customer.name || 'Valued Customer').trim();
    const customerContact = (customer.phone || customer.contact || '').trim();
    const deliveryAddress = (customer.address || 'Marilao, Bulacan').trim();
    const deliveryDate = customer.deliveryDate || new Date().toISOString().slice(0, 10);
    const deliveryTime = customer.deliveryTime || '09:00 AM - 12:00 PM';
    const specialNotes = customer.notes || order.notes || '';

    const grandTotal = parseFloat(order.total || order.totalAmount || order.grandTotal || 0);
    const deliveryFee = parseFloat(order.deliveryFee || 0.00);
    const subtotal = parseFloat(order.subtotal || grandTotal - deliveryFee);
    const downpaymentRequired = parseFloat(order.downpayment || order.amountPaid || (grandTotal * 0.5));
    const balanceDue = parseFloat(order.balance ?? (grandTotal - downpaymentRequired));
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
    const isWalkin = (order.channel === 'walkin' || orderCode.includes('WALK') || deliveryAddress.toLowerCase().includes('walk-in') || deliveryAddress.toLowerCase().includes('store pickup'));
    const initialStatus = (order.status === 'delivered' || order.status === 'completed')
      ? 'delivered'
      : (order.status === 'downpayment_confirmed' || order.status === 'in_production' || order.status === 'baking'
          ? 'downpayment_confirmed'
          : 'pending');
    const downpaymentPaid = (initialStatus === 'delivered' || initialStatus === 'downpayment_confirmed')
      ? downpaymentRequired
      : 0.00;
    const finalBalanceDue = (initialStatus === 'delivered') ? 0.00 : balanceDue;

    const orderInsertSql = `
      INSERT INTO orders (
        order_code, user_id, customer_name, customer_email, customer_contact,
        delivery_address, delivery_date, delivery_time, special_notes,
        subtotal_amount, delivery_fee, grand_total, downpayment_rate,
        downpayment_required, downpayment_paid, balance_due, payment_method, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id, order_code, created_at;
    `;
    const orderRes = await client.query(orderInsertSql, [
      orderCode, userId, customerName, customerEmail, customerContact,
      deliveryAddress, deliveryDate, deliveryTime, specialNotes,
      subtotal, deliveryFee, grandTotal, 0.50,
      downpaymentRequired, downpaymentPaid, finalBalanceDue, paymentMethod, initialStatus
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
      `, [item.name || item.rawName || '', parseInt(item.id || 0, 10)]);

      const bundleId = bundleRes.rows[0]?.bundle_id || 1;
      const pieces = bundleRes.rows[0]?.pieces_per_bundle || (item.min || 25);
      const unitPrice = parseFloat(bundleRes.rows[0]?.wholesale_price || (item.price || 105));
      const qty = parseInt(item.qty || 1, 10);
      const itemTotal = unitPrice * qty;

      await client.query(`
        INSERT INTO order_items (
          order_id, product_bundle_id, product_name, pieces_per_bundle, unit_price, quantity, total_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [dbOrderId, bundleId, item.name || item.rawName || 'Bakery Bundle', pieces, unitPrice, qty, itemTotal]);
    }

    // 4. Insert initial payment record if reference number, proof image, or walk-in payment was supplied
    if (refNumber || order.proofImage || isWalkin) {
      const channel = (order.paymentMethod || '').toLowerCase().includes('cash') ? 'cash' : paymentMethod;
      const isVerified = initialStatus === 'delivered' || isWalkin;
      await client.query(`
        INSERT INTO payments (
          order_id, payment_channel, payment_stage, amount, reference_number, receipt_image_url, verification_status, verified_at
        ) VALUES ($1, $2, 'downpayment', $3, $4, $5, $6, $7);
      `, [
        dbOrderId, channel, downpaymentRequired,
        refNumber || (isWalkin ? 'COUNTER_SALE' : ''),
        order.proofImage || null,
        isVerified ? 'verified' : 'unverified',
        isVerified ? new Date() : null
      ]);
    }

    // 5. Insert initial status history
    await client.query(`
      INSERT INTO order_status_history (
        order_id, previous_status, new_status, notes
      ) VALUES ($1, NULL, $2, $3);
    `, [dbOrderId, initialStatus, isWalkin ? 'Walk-In order completed at counter POS' : 'Order placed by customer via wholesale portal']);

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
 * GET /api/orders/all
 * Retrieves all orders with items, payments, and customer info for Admin Orders Board
 */
router.get('/all', async (req, res) => {
  try {
    const ordersRes = await db.query(`
      SELECT 
        o.id, o.order_code, o.customer_name, o.customer_email, o.customer_contact,
        o.delivery_address, o.delivery_date, o.delivery_time, o.special_notes,
        o.subtotal_amount, o.delivery_fee, o.grand_total,
        o.downpayment_required, o.downpayment_paid, o.balance_due,
        o.payment_method, o.status, o.created_at, o.updated_at
      FROM orders o
      ORDER BY o.created_at DESC;
    `);

    const orderRows = ordersRes.rows;
    if (orderRows.length === 0) {
      return res.json({ success: true, count: 0, orders: [] });
    }

    const orderIds = orderRows.map(o => o.id);

    // Items
    const itemsRes = await db.query(`
      SELECT order_id, product_name, pieces_per_bundle, unit_price, quantity, total_price
      FROM order_items
      WHERE order_id = ANY($1::bigint[])
      ORDER BY id ASC;
    `, [orderIds]);

    const itemsMap = {};
    itemsRes.rows.forEach(item => {
      if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
      itemsMap[item.order_id].push({
        rawName: item.product_name,
        name: item.product_name,
        pieces: item.pieces_per_bundle,
        price: parseFloat(item.unit_price),
        qty: item.quantity,
        total: parseFloat(item.total_price)
      });
    });

    // Payments
    const paymentsRes = await db.query(`
      SELECT order_id, payment_channel, payment_stage, amount, reference_number, receipt_image_url, verification_status, created_at
      FROM payments
      WHERE order_id = ANY($1::bigint[])
      ORDER BY id DESC;
    `, [orderIds]);

    const paymentsMap = {};
    paymentsRes.rows.forEach(p => {
      if (!paymentsMap[p.order_id]) paymentsMap[p.order_id] = p; // pick latest
    });

    const orders = orderRows.map(o => {
      const isWalkin = (o.order_code && o.order_code.includes('WALK')) ||
                       (o.delivery_address && (o.delivery_address.toLowerCase().includes('walk-in') || o.delivery_address.toLowerCase().includes('counter')));
      const p = paymentsMap[o.id] || {};
      const dateObj = new Date(o.created_at);

      return {
        id: o.id,
        orderId: o.order_code,
        customer: {
          name: o.customer_name,
          email: o.customer_email,
          contact: o.customer_contact,
          address: o.delivery_address,
          deliveryDate: o.delivery_date,
          deliveryTime: o.delivery_time,
          notes: o.special_notes
        },
        items: itemsMap[o.id] || [],
        total: parseFloat(o.grand_total),
        downpayment: parseFloat(o.downpayment_required),
        balance: parseFloat(o.balance_due),
        paymentMethod: o.payment_method === 'cod' ? (isWalkin ? 'Cash' : 'COD') : (o.payment_method === 'gcash' ? 'GCash' : (o.payment_method === 'maya' ? 'PayMaya' : o.payment_method)),
        referenceNumber: p.reference_number || '',
        proofImage: p.receipt_image_url || '',
        status: o.status,
        channel: isWalkin ? 'walkin' : 'online',
        date: dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        time: dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        createdAt: o.created_at
      };
    });

    return res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('[Admin Orders Query Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve orders.', error: error.message });
  }
});

/**
 * GET /api/orders/dashboard/stats
 * Computes live metrics for Admin Dashboard
 */
router.get('/dashboard/stats', async (req, res) => {
  try {
    const statsRes = await db.query(`
      SELECT 
        COUNT(id) AS total_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_orders,
        COUNT(CASE WHEN status IN ('downpayment_confirmed', 'baking') THEN 1 END) AS in_production_orders,
        COUNT(CASE WHEN status = 'cancellation_requested' THEN 1 END) AS pending_refunds,
        COALESCE(SUM(CASE WHEN created_at::date = CURRENT_DATE AND status NOT IN ('cancelled', 'refunded') THEN grand_total ELSE 0 END), 0) AS sales_today,
        COALESCE(SUM(CASE WHEN created_at::date = CURRENT_DATE AND (order_code LIKE '%WALK%' OR delivery_address ILIKE '%walk-in%') AND status NOT IN ('cancelled', 'refunded') THEN grand_total ELSE 0 END), 0) AS walkin_sales_today,
        COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN downpayment_paid ELSE 0 END), 0) AS downpayments_collected,
        COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN balance_due ELSE 0 END), 0) AS outstanding_balances
      FROM orders;
    `);

    const paymentsRes = await db.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN payment_channel IN ('cash', 'cod') THEN amount ELSE 0 END), 0) AS cash_received,
        COALESCE(SUM(CASE WHEN payment_channel = 'gcash' THEN amount ELSE 0 END), 0) AS gcash_received,
        COALESCE(SUM(CASE WHEN payment_channel = 'maya' THEN amount ELSE 0 END), 0) AS maya_received
      FROM payments
      WHERE verification_status = 'verified';
    `);

    const partnersRes = await db.query(`
      SELECT COUNT(id) AS pending_partners FROM partner_applications WHERE status IN ('pending', 'under_review');
    `);

    const stats = statsRes.rows[0];
    const pays = paymentsRes.rows[0];
    const pendingPartners = parseInt(partnersRes.rows[0]?.pending_partners || 0, 10);

    const salesToday = parseFloat(stats.sales_today || 0);
    const walkinSalesToday = parseFloat(stats.walkin_sales_today || 0);
    const onlineSalesToday = Math.max(0, salesToday - walkinSalesToday);

    return res.json({
      success: true,
      stats: {
        salesToday,
        onlineSalesToday,
        walkinSalesToday,
        pendingOrders: parseInt(stats.pending_orders || 0, 10),
        inProductionOrders: parseInt(stats.in_production_orders || 0, 10),
        pendingRefunds: parseInt(stats.pending_refunds || 0, 10),
        pendingPartners,
        totalCashReceived: parseFloat(pays.cash_received || 0),
        totalGCashReceived: parseFloat(pays.gcash_received || 0),
        totalMayaReceived: parseFloat(pays.maya_received || 0),
        downpaymentsCollected: parseFloat(stats.downpayments_collected || 0),
        outstandingBalances: parseFloat(stats.outstanding_balances || 0),
        openingCash: 1000.00,
        expectedDrawerCash: 1000.00 + parseFloat(pays.cash_received || 0)
      }
    });
  } catch (error) {
    console.error('[Dashboard Stats Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to compute dashboard stats.', error: error.message });
  }
});

/**
 * GET /api/orders/cancellations/all
 * Retrieves all refund requests for Admin Refunds Queue
 */
router.get('/cancellations/all', async (req, res) => {
  try {
    const q = `
      SELECT 
        cr.id, cr.order_id, cr.reason, cr.reason_details, cr.refund_channel,
        cr.refund_account_name, cr.refund_account_number, cr.eligible_refund_amount,
        cr.status, cr.rejection_reason, cr.created_at, cr.updated_at,
        o.order_code, o.customer_name, o.customer_email, o.customer_contact,
        o.grand_total, o.downpayment_required, o.status AS order_status,
        rt.transaction_reference AS payout_ref, rt.processed_at AS payout_time
      FROM cancellation_requests cr
      JOIN orders o ON cr.order_id = o.id
      LEFT JOIN refund_transactions rt ON rt.cancellation_request_id = cr.id
      ORDER BY cr.created_at DESC;
    `;
    const { rows } = await db.query(q);
    return res.json({
      success: true,
      count: rows.length,
      refunds: rows.map(r => ({
        id: r.id,
        orderId: r.order_code,
        customer: {
          name: r.customer_name,
          email: r.customer_email,
          contact: r.customer_contact
        },
        reason: r.reason,
        reasonDetails: r.reason_details,
        refundChannel: r.refund_channel === 'gcash' ? 'GCash' : (r.refund_channel === 'maya' ? 'PayMaya' : r.refund_channel),
        refundAccountName: r.refund_account_name,
        refundAccountNumber: r.refund_account_number,
        amount: parseFloat(r.eligible_refund_amount || 0),
        status: r.status,
        orderStatus: r.order_status,
        rejectionReason: r.rejection_reason,
        payoutRef: r.payout_ref || null,
        payoutTime: r.payout_time || null,
        date: new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      }))
    });
  } catch (error) {
    console.error('[Cancellations Query Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve refund queue.', error: error.message });
  }
});

/**
 * PATCH /api/orders/:orderCode/verify
 * Confirms downpayment receipt and moves order to production
 */
router.patch('/:orderCode/verify', async (req, res) => {
  const client = await db.getClient();
  try {
    const { orderCode } = req.params;
    await client.query('BEGIN');

    const orderRes = await client.query('SELECT id, status, downpayment_required FROM orders WHERE order_code = $1;', [orderCode.trim()]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    const order = orderRes.rows[0];

    await client.query(`
      UPDATE orders
      SET status = 'downpayment_confirmed', downpayment_paid = $1, updated_at = NOW()
      WHERE id = $2;
    `, [order.downpayment_required, order.id]);

    await client.query(`
      UPDATE payments
      SET verification_status = 'verified', verified_at = NOW()
      WHERE order_id = $1 AND payment_stage = 'downpayment';
    `, [order.id]);

    await client.query(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, notes)
      VALUES ($1, $2, 'downpayment_confirmed', 'Bakery staff verified downpayment receipt and moved order to production queue.');
    `, [order.id, order.status]);

    await client.query('COMMIT');
    return res.json({ success: true, message: `Downpayment verified for ${orderCode}.`, status: 'downpayment_confirmed' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Verify Order Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to verify payment: ' + err.message });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/orders/:orderCode/balance
 * Collects 50% balance on pickup/delivery and marks order as delivered
 */
router.patch('/:orderCode/balance', async (req, res) => {
  const client = await db.getClient();
  try {
    const { orderCode } = req.params;
    const { paymentMethod, refNumber } = req.body || {};
    await client.query('BEGIN');

    const orderRes = await client.query('SELECT id, status, balance_due FROM orders WHERE order_code = $1;', [orderCode.trim()]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    const order = orderRes.rows[0];
    const balanceAmount = parseFloat(order.balance_due);

    await client.query(`
      UPDATE orders
      SET status = 'delivered', balance_due = 0.00, updated_at = NOW()
      WHERE id = $1;
    `, [order.id]);

    const channel = (paymentMethod || 'cash').toLowerCase().includes('cash') ? 'cash' : normalizePaymentChannel(paymentMethod);
    await client.query(`
      INSERT INTO payments (
        order_id, payment_channel, payment_stage, amount, reference_number, verification_status, verified_at
      ) VALUES ($1, $2, 'balance', $3, $4, 'verified', NOW());
    `, [order.id, channel, balanceAmount, refNumber || 'BALANCE_PAID']);

    await client.query(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, notes)
      VALUES ($1, $2, 'delivered', 'Final 50% balance collected on delivery/pickup. Order completed.');
    `, [order.id, order.status]);

    await client.query('COMMIT');
    return res.json({ success: true, message: `Balance collected for ${orderCode}. Order completed!`, status: 'delivered' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Collect Balance Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to collect balance: ' + err.message });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/orders/:orderCode/status
 * Updates status and customer metadata
 */
router.patch('/:orderCode/status', async (req, res) => {
  const client = await db.getClient();
  try {
    const { orderCode } = req.params;
    const { status, customerName, customerContact, customerAddress, notes } = req.body || {};

    await client.query('BEGIN');
    const orderRes = await client.query('SELECT id, status FROM orders WHERE order_code = $1;', [orderCode.trim()]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    const order = orderRes.rows[0];

    const newStatus = status || order.status;
    await client.query(`
      UPDATE orders
      SET status = $1,
          customer_name = COALESCE($2, customer_name),
          customer_contact = COALESCE($3, customer_contact),
          delivery_address = COALESCE($4, delivery_address),
          special_notes = COALESCE($5, special_notes),
          updated_at = NOW()
      WHERE id = $6;
    `, [newStatus, customerName, customerContact, customerAddress, notes, order.id]);

    if (newStatus !== order.status) {
      await client.query(`
        INSERT INTO order_status_history (order_id, previous_status, new_status, notes)
        VALUES ($1, $2, $3, $4);
      `, [order.id, order.status, newStatus, `Status updated by bakery admin to ${newStatus}`]);
    }

    await client.query('COMMIT');
    return res.json({ success: true, message: `Order ${orderCode} updated successfully.`, status: newStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Update Order Status Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to update order status: ' + err.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/orders/cancellations/:id/process
 * Confirms outgoing refund transaction and sets order to refunded
 */
router.post('/cancellations/:id/process', async (req, res) => {
  const client = await db.getClient();
  try {
    const cid = parseInt(req.params.id, 10);
    const { transactionReference, adminNotes } = req.body || {};

    if (!transactionReference) {
      return res.status(400).json({ success: false, message: 'Refund transaction reference number is required.' });
    }

    await client.query('BEGIN');
    const cRes = await client.query(`
      SELECT cr.id, cr.order_id, cr.eligible_refund_amount, o.order_code, o.status AS order_status
      FROM cancellation_requests cr
      JOIN orders o ON cr.order_id = o.id
      WHERE cr.id = $1;
    `, [cid]);

    if (cRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Cancellation request not found.' });
    }
    const cReq = cRes.rows[0];

    await client.query(`
      INSERT INTO refund_transactions (
        cancellation_request_id, refund_amount, transaction_reference, admin_notes
      ) VALUES ($1, $2, $3, $4);
    `, [cReq.id, cReq.eligible_refund_amount, transactionReference.trim(), adminNotes || 'Approved by Admin']);

    await client.query(`
      UPDATE cancellation_requests
      SET status = 'processed', reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $1;
    `, [cReq.id]);

    await client.query(`
      UPDATE orders
      SET status = 'refunded', updated_at = NOW()
      WHERE id = $1;
    `, [cReq.order_id]);

    await client.query(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, notes)
      VALUES ($1, $2, 'refunded', $3);
    `, [cReq.order_id, cReq.order_status, `50% Downpayment refunded. Reference: ${transactionReference.trim()}`]);

    await client.query('COMMIT');
    return res.json({ success: true, message: `Refund processed successfully for ${cReq.order_code}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Process Refund Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to process refund: ' + err.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/orders/cancellations/:id/decline
 * Declines refund request and resets order status
 */
router.post('/cancellations/:id/decline', async (req, res) => {
  const client = await db.getClient();
  try {
    const cid = parseInt(req.params.id, 10);
    const { rejectionReason } = req.body || {};

    await client.query('BEGIN');
    const cRes = await client.query(`
      SELECT cr.id, cr.order_id, o.order_code, o.status AS order_status
      FROM cancellation_requests cr
      JOIN orders o ON cr.order_id = o.id
      WHERE cr.id = $1;
    `, [cid]);

    if (cRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Cancellation request not found.' });
    }
    const cReq = cRes.rows[0];
    const reason = rejectionReason || 'Cancellation request declined by bakery management.';

    await client.query(`
      UPDATE cancellation_requests
      SET status = 'rejected', rejection_reason = $1, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $2;
    `, [reason, cReq.id]);

    await client.query(`
      UPDATE orders
      SET status = 'pending', updated_at = NOW()
      WHERE id = $1;
    `, [cReq.order_id]);

    await client.query(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, notes)
      VALUES ($1, $2, 'pending', $3);
    `, [cReq.order_id, cReq.order_status, `Cancellation declined: ${reason}`]);

    await client.query('COMMIT');
    return res.json({ success: true, message: `Cancellation declined for ${cReq.order_code}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Decline Refund Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to decline refund: ' + err.message });
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
