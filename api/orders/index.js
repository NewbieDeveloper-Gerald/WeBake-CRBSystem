const crypto = require('crypto');
const { getPool } = require('../_lib/db');
const { createTransporter } = require('../_lib/mailer');
const { handleCors, sendJson, sendError } = require('../_lib/http');
const { readSession, verifyProofToken } = require('../_lib/session');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

// 1. Create Order (Fixes H1, M2, M3, M8, C4, M1)
async function handleCreateOrder(req, res, pool) {
  const idempotencyKey = (
    req.headers['idempotency-key'] ||
    req.body?.idempotencyKey ||
    req.body?.order?.idempotencyKey ||
    ''
  ).trim().slice(0, 64);

  // 1a. Idempotency Check: return existing order if same key was already processed
  if (idempotencyKey) {
    const existingOrder = await pool.query(
      `SELECT id, order_code, grand_total, downpayment_required, balance_due, status
       FROM orders WHERE idempotency_key = $1 LIMIT 1;`,
      [idempotencyKey]
    );
    if (existingOrder.rows.length > 0) {
      const ex = existingOrder.rows[0];
      return sendJson(res, 200, {
        success: true,
        message: 'Order already recorded (idempotent request).',
        orderId: ex.order_code,
        databaseId: ex.id,
        status: ex.status,
        grandTotal: parseFloat(ex.grand_total),
        downpaymentRequired: parseFloat(ex.downpayment_required),
        balanceDue: parseFloat(ex.balance_due),
        duplicate: true
      });
    }
  }

  const { order, items: bodyItems, customer: bodyCustomer, paymentMethod: bodyMethod, referenceNumber: bodyRef, proofToken: bodyProof } = req.body || {};
  const cust = bodyCustomer || order?.customer || {};

  const customerEmail = (cust.email || '').trim().toLowerCase();
  const customerName = (cust.fullName || cust.name || '').trim();
  const customerContact = (cust.phone || cust.contact || '').trim().replace(/\D/g, '');
  const deliveryAddress = (cust.address || '').trim();
  const deliveryDate = (cust.deliveryDate || '').trim();
  const deliveryTime = (cust.deliveryTime || '09:00 AM - 12:00 PM').trim();
  const specialNotes = (cust.notes || '').trim().slice(0, 500);

  // 1b. Customer field validations (Fixes M3 - no fabricated defaults)
  if (!customerName) {
    return sendJson(res, 400, { success: false, message: 'Full name is required.' });
  }
  if (!isValidEmail(customerEmail)) {
    return sendJson(res, 400, { success: false, message: 'A valid email address is required.' });
  }
  if (!customerContact || customerContact.length !== 11 || !customerContact.startsWith('09')) {
    return sendJson(res, 400, { success: false, message: 'Contact number must be an 11-digit mobile number starting with 09.' });
  }
  if (!deliveryAddress || deliveryAddress.length < 5) {
    return sendJson(res, 400, { success: false, message: 'A complete delivery address is required.' });
  }
  if (!deliveryDate) {
    return sendJson(res, 400, { success: false, message: 'Delivery date is required.' });
  }

  const deliveryTimestamp = new Date(deliveryDate + 'T00:00:00').getTime();
  const todayTimestamp = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
  if (isNaN(deliveryTimestamp) || deliveryTimestamp < todayTimestamp) {
    return sendJson(res, 400, { success: false, message: 'Delivery date cannot be in the past.' });
  }

  // 1c. Authentication & Verification Proof Check (Fixes C4, M1)
  const session = readSession(req);
  let sessionVerified = false;
  let userId = null;

  if (session && session.email && session.email.toLowerCase() === customerEmail) {
    sessionVerified = true;
    userId = session.uid;
  } else {
    const userLookup = await pool.query('SELECT id FROM users WHERE LOWER(email_address) = $1 LIMIT 1;', [customerEmail]);
    if (userLookup.rows.length > 0) {
      userId = userLookup.rows[0].id;
    }
  }

  const effectiveProofToken = bodyProof || order?.proofToken;
  let verifiedProof = null;

  if (!sessionVerified) {
    if (!effectiveProofToken) {
      return sendJson(res, 401, {
        success: false,
        error: 'verification_required',
        message: 'Email verification code is required to complete checkout.'
      });
    }
    const decoded = verifyProofToken(effectiveProofToken, null, customerEmail);
    if (!decoded || (decoded.purpose !== 'checkout' && decoded.purpose !== 'checkout_verification')) {
      return sendJson(res, 403, {
        success: false,
        error: 'verification_invalid',
        message: 'Invalid or expired checkout verification code. Please request a new code.'
      });
    }
    verifiedProof = decoded;
  }

  // 1d. Cart Items & Server-Side Pricing (Fixes H1, M2, M8)
  const rawItems = Array.isArray(bodyItems) ? bodyItems : (Array.isArray(order?.items) ? order.items : []);
  if (rawItems.length === 0) {
    return sendJson(res, 400, { success: false, message: 'Cart items cannot be empty.' });
  }

  // Fetch active products and bundles from database
  const bundlesRes = await pool.query(`
    SELECT pb.id AS bundle_id, pb.product_id, pb.wholesale_price, pb.pieces_per_bundle,
           p.product_name, p.slug
    FROM product_bundles pb
    JOIN products p ON pb.product_id = p.id
    WHERE pb.is_active = TRUE AND p.is_active = TRUE;
  `);
  const activeBundles = bundlesRes.rows;

  // Fetch store downpayment rate (delivery fee is handled outside system)
  const settingsRes = await pool.query(`
    SELECT setting_key, setting_value FROM store_settings 
    WHERE setting_key = 'downpayment_percentage';
  `);
  let downpaymentRate = 0.50;
  settingsRes.rows.forEach(s => {
    if (s.setting_key === 'downpayment_percentage') downpaymentRate = (parseFloat(s.setting_value) || 50) / 100;
  });
  const deliveryFee = 0.00;

  let subtotal = 0;
  const validatedItems = [];

  for (const raw of rawItems) {
    const pId = parseInt(raw.productId || raw.id || 0, 10);
    const bId = parseInt(raw.bundleId || 0, 10);
    const qty = parseInt(raw.qty || raw.quantity || 0, 10);

    if (isNaN(qty) || qty < 1 || qty > 200) {
      return sendJson(res, 400, { success: false, message: 'Item quantity must be between 1 and 200 bundles.' });
    }

    let bundle = null;
    if (bId > 0) {
      bundle = activeBundles.find(b => b.bundle_id === bId);
    }
    if (!bundle && pId > 0) {
      bundle = activeBundles.find(b => b.product_id === pId || b.bundle_id === pId);
    }

    if (!bundle) {
      return sendJson(res, 400, {
        success: false,
        message: `Unknown or unavailable product in cart (ID: ${pId || bId}). Please refresh your cart.`
      });
    }

    const unitPrice = parseFloat(bundle.wholesale_price);
    const itemTotal = Math.round(unitPrice * qty * 100) / 100;
    subtotal += itemTotal;

    validatedItems.push({
      bundleId: bundle.bundle_id,
      name: bundle.product_name,
      pieces: bundle.pieces_per_bundle,
      price: unitPrice,
      qty: qty,
      total: itemTotal
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;
  const grandTotal = subtotal; // Delivery fee is negotiated/handled outside system
  const downpaymentRequired = Math.round((grandTotal * downpaymentRate) * 100) / 100;
  const balanceDue = Math.round((grandTotal - downpaymentRequired) * 100) / 100;
  const paymentMethod = normalizePaymentChannel(bodyMethod || order?.paymentMethod);
  const refNumber = (bodyRef || order?.referenceNumber || '').trim().slice(0, 100);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // If OTP proof token was used, consume it atomically
    if (verifiedProof) {
      const consumeRes = await client.query(`
        UPDATE otp_verifications 
        SET consumed_at = NOW() 
        WHERE id = $1 AND verified_at IS NOT NULL AND consumed_at IS NULL AND expires_at > NOW()
        RETURNING id;
      `, [verifiedProof.otpId]);

      if (consumeRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return sendJson(res, 403, {
          success: false,
          error: 'token_consumed',
          message: 'This verification code has already been used or expired. Please verify your email again.'
        });
      }
    }

    // Generate unique order code with collision retry loop (Fixes M1)
    let orderCode = null;
    let dbOrderId = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidateCode = `WB-${crypto.randomInt(100000, 999999)}`;
      try {
        const orderInsertRes = await client.query(`
          INSERT INTO orders (
            order_code, idempotency_key, user_id, customer_name, customer_email, customer_contact,
            delivery_address, delivery_date, delivery_time, special_notes,
            subtotal_amount, delivery_fee, grand_total, downpayment_rate,
            downpayment_required, downpayment_paid, balance_due, payment_method, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'pending')
          RETURNING id, order_code, created_at;
        `, [
          candidateCode,
          idempotencyKey || null,
          userId,
          customerName,
          customerEmail,
          customerContact,
          deliveryAddress,
          deliveryDate,
          deliveryTime,
          specialNotes,
          subtotal,
          deliveryFee,
          grandTotal,
          downpaymentRate,
          downpaymentRequired,
          0.00,
          balanceDue,
          paymentMethod
        ]);

        orderCode = orderInsertRes.rows[0].order_code;
        dbOrderId = orderInsertRes.rows[0].id;
        break;
      } catch (err) {
        if (err.code === '23505' && (err.constraint === 'orders_order_code_key' || err.detail?.includes('order_code'))) {
          continue; // Unique order_code collision, retry
        }
        if (err.code === '23505' && (err.constraint === 'orders_idempotency_key_key' || err.detail?.includes('idempotency_key'))) {
          await client.query('ROLLBACK');
          const exRes = await pool.query('SELECT id, order_code, grand_total, downpayment_required, balance_due, status FROM orders WHERE idempotency_key = $1 LIMIT 1;', [idempotencyKey]);
          if (exRes.rows.length > 0) {
            const ex = exRes.rows[0];
            return sendJson(res, 200, {
              success: true,
              message: 'Order already recorded (idempotent request).',
              orderId: ex.order_code,
              databaseId: ex.id,
              status: ex.status,
              grandTotal: parseFloat(ex.grand_total),
              downpaymentRequired: parseFloat(ex.downpayment_required),
              balanceDue: parseFloat(ex.balance_due),
              duplicate: true
            });
          }
        }
        throw err;
      }
    }

    if (!orderCode) {
      await client.query('ROLLBACK');
      return sendError(res, 500, 'Unable to generate unique order tracking ID. Please try again.');
    }

    // Insert order line items
    for (const item of validatedItems) {
      await client.query(`
        INSERT INTO order_items (
          order_id, product_bundle_id, product_name, pieces_per_bundle, unit_price, quantity, total_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [
        dbOrderId,
        item.bundleId,
        item.name,
        item.pieces,
        item.price,
        item.qty,
        item.total
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

    // Clear saved cart for registered user
    if (userId) {
      await client.query(`UPDATE users SET saved_cart = '[]'::jsonb WHERE id = $1;`, [userId]);
    }

    await client.query('COMMIT');

    // Send confirmation & digital receipt email in background via Port 465
    try {
      const transporter = createTransporter();
      const fromAddress = process.env.GMAIL_USER || 'crbwebake@gmail.com';
      transporter.sendMail({
        from: `"WeBake Bakery" <${fromAddress}>`,
        to: customerEmail,
        subject: `WeBake Order Confirmation & Receipt - ${orderCode}`,
        text: `Thank you for your order with Crumbs N' Rolls Bakery! Order ID: ${orderCode}. Total: PHP ${grandTotal.toFixed(2)}. 50% Downpayment (Pending verification): PHP ${downpaymentRequired.toFixed(2)}. Remaining Balance: PHP ${balanceDue.toFixed(2)}.`,
        html: `
          <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:20px; border:1px solid #ebd9c8; border-radius:10px; background:#fff;">
            <h2 style="color:#A0522D; text-align:center;">WeBake Order Confirmation</h2>
            <p>Thank you for choosing <strong>Crumbs N' Rolls Bakery</strong>! Your wholesale bread order has been successfully recorded in our system.</p>
            <div style="background:#FAF6F0; padding:15px; border-radius:8px; margin:20px 0;">
              <p style="margin:5px 0;"><strong>Order ID:</strong> ${escapeHtml(orderCode)}</p>
              <p style="margin:5px 0;"><strong>Total Order Value:</strong> &#8369;${grandTotal.toFixed(2)}</p>
              <p style="margin:5px 0; color:#28a745;"><strong>50% Downpayment (Pending verification):</strong> &#8369;${downpaymentRequired.toFixed(2)} (${escapeHtml(paymentMethod.toUpperCase())})</p>
              <p style="margin:5px 0; color:#A0522D;"><strong>Remaining Balance Upon Delivery:</strong> &#8369;${balanceDue.toFixed(2)}</p>
            </div>
            <p style="font-size:12px; color:#888; text-align:center;">1356 Cordero St., Lambakin, Marilao, Bulacan &bull; &copy; 2026 WeBake</p>
          </div>
        `
      }).catch(err => console.error('[Order Email Error]:', err.message));
    } catch (mailErr) {
      console.error('[Mailer Init Error]:', mailErr.message);
    }

    return sendJson(res, 201, {
      success: true,
      message: 'Order created and persisted successfully in cloud database.',
      orderId: orderCode,
      databaseId: dbOrderId,
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      grandTotal: grandTotal,
      downpaymentRequired: downpaymentRequired,
      balanceDue: balanceDue,
      status: 'pending'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    return sendError(res, 500, 'Failed to process bread order checkout.', error);
  } finally {
    client.release();
  }
}

// In-memory rate limiting map for receipt resends (3 resends per hour per order)
const receiptRateLimits = new Map();
function checkReceiptRateLimit(orderId) {
  const now = Date.now();
  const entry = receiptRateLimits.get(orderId);
  if (!entry || now > entry.resetAt) {
    receiptRateLimits.set(orderId, { count: 1, resetAt: now + 3600000 });
    return true;
  }
  if (entry.count >= 3) {
    return false;
  }
  entry.count++;
  return true;
}

// 2. Resend Receipt (Fixes C4, M9)
async function handleReceipt(req, res, pool) {
  const { orderId, email, contact } = req.body || req.body?.order || {};
  const cleanOrderId = (orderId || req.body?.orderId || '').trim().toUpperCase();

  if (!cleanOrderId) {
    return sendJson(res, 400, { success: false, message: 'Order ID is required to resend receipt.' });
  }

  // Lookup order from database (Fixes C4 - ignore client amounts/recipient)
  const orderRes = await pool.query(`
    SELECT id, order_code, user_id, customer_name, customer_email, customer_contact,
           subtotal_amount, delivery_fee, grand_total, downpayment_required,
           balance_due, payment_method, status
    FROM orders
    WHERE UPPER(order_code) = $1
    LIMIT 1;
  `, [cleanOrderId]);

  if (orderRes.rows.length === 0) {
    return sendJson(res, 404, { success: false, message: 'Order not found.' });
  }

  const o = orderRes.rows[0];

  // Authorization check: session owner OR tracking proof (Fixes C3)
  const session = readSession(req);
  const candidateContact = (email || contact || '').trim().toLowerCase();
  const candidateDigits = candidateContact.replace(/\D/g, '');
  const orderPhoneDigits = (o.customer_contact || '').replace(/\D/g, '');

  const sessionMatch = session && (
    (o.user_id && o.user_id === session.uid) ||
    (o.customer_email && o.customer_email.toLowerCase() === session.email.toLowerCase())
  );
  const emailMatch = o.customer_email && o.customer_email.toLowerCase() === candidateContact;
  const phoneMatch = candidateDigits.length >= 7 && (orderPhoneDigits === candidateDigits || orderPhoneDigits.endsWith(candidateDigits));

  if (!sessionMatch && !emailMatch && !phoneMatch) {
    return sendJson(res, 404, { success: false, message: 'Order not found.' });
  }

  // Rate limit check: max 3 resends per hour per order (Fixes M9)
  if (!checkReceiptRateLimit(o.order_code)) {
    return sendJson(res, 429, {
      success: false,
      message: 'Receipt resend limit reached for this order. Please check your spam folder or try again later.'
    });
  }

  const transporter = createTransporter();
  const fromAddress = process.env.GMAIL_USER || 'crbwebake@gmail.com';
  const grandTotal = parseFloat(o.grand_total);
  const downpayment = parseFloat(o.downpayment_required);
  const balance = parseFloat(o.balance_due);

  await transporter.sendMail({
    from: `"WeBake Bakery" <${fromAddress}>`,
    to: o.customer_email,
    subject: `WeBake Order Confirmation & Receipt - ${o.order_code}`,
    text: `Thank you for your order with Crumbs N' Rolls Bakery! Order ID: ${o.order_code}. Total: PHP ${grandTotal.toFixed(2)}. 50% Downpayment (Pending verification): PHP ${downpayment.toFixed(2)}. Remaining Balance: PHP ${balance.toFixed(2)}.`,
    html: `
      <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:20px; border:1px solid #ebd9c8; border-radius:10px; background:#fff;">
        <h2 style="color:#A0522D; text-align:center;">WeBake Order Confirmation</h2>
        <p>Thank you for choosing <strong>Crumbs N' Rolls Bakery</strong>! Your wholesale bread order details:</p>
        <div style="background:#FAF6F0; padding:15px; border-radius:8px; margin:20px 0;">
          <p style="margin:5px 0;"><strong>Order ID:</strong> ${escapeHtml(o.order_code)}</p>
          <p style="margin:5px 0;"><strong>Customer Name:</strong> ${escapeHtml(o.customer_name)}</p>
          <p style="margin:5px 0;"><strong>Total Value:</strong> &#8369;${grandTotal.toFixed(2)}</p>
          <p style="margin:5px 0; color:#28a745;"><strong>50% Downpayment (Pending verification):</strong> &#8369;${downpayment.toFixed(2)} (${escapeHtml(o.payment_method.toUpperCase())})</p>
          <p style="margin:5px 0; color:#A0522D;"><strong>Remaining Balance Upon Delivery:</strong> &#8369;${balance.toFixed(2)}</p>
          <p style="margin:5px 0;"><strong>Order Status:</strong> ${escapeHtml(o.status.toUpperCase())}</p>
        </div>
        <p style="font-size:12px; color:#888; text-align:center;">1356 Cordero St., Lambakin, Marilao, Bulacan &bull; &copy; 2026 WeBake</p>
      </div>
    `
  });

  return sendJson(res, 200, {
    success: true,
    message: 'Digital receipt dispatched successfully to ' + o.customer_email
  });
}


// 3. Cancel Order (Fixes C3, H7)
async function handleCancelOrder(req, res, pool) {
  const session = readSession(req);
  const { orderId, email, contact, phone, refundDetails } = req.body || {};
  const cleanOrderId = (orderId || '').trim().toUpperCase();

  if (!cleanOrderId) {
    return sendJson(res, 400, { success: false, message: 'Order ID is required.' });
  }

  const client = await pool.connect();
  try {
    const orderRes = await client.query(
      `SELECT id, user_id, customer_name, customer_email, customer_contact,
              status, downpayment_required, grand_total
       FROM orders WHERE UPPER(order_code) = $1 LIMIT 1;`,
      [cleanOrderId]
    );

    if (orderRes.rows.length === 0) {
      return sendJson(res, 404, { success: false, message: 'Order not found.' });
    }

    const order = orderRes.rows[0];

    // Authorization check (Fixes C3)
    if (session) {
      const isOwner = (order.user_id && order.user_id === session.uid) ||
                      (order.customer_email && order.customer_email.toLowerCase() === session.email.toLowerCase());
      if (!isOwner) {
        return sendJson(res, 403, { success: false, message: 'You are not authorized to cancel this order.' });
      }
    } else {
      // Guest cancellation requires matching contact or email
      const candidateContact = (email || contact || phone || '').trim().toLowerCase();
      const candidateDigits = candidateContact.replace(/\D/g, '');
      const orderDigits = (order.customer_contact || '').replace(/\D/g, '');
      const isEmailMatch = order.customer_email && order.customer_email.toLowerCase() === candidateContact;
      const isPhoneMatch = candidateDigits.length >= 7 && (orderDigits === candidateDigits || orderDigits.endsWith(candidateDigits));

      if (!isEmailMatch && !isPhoneMatch) {
        return sendJson(res, 404, { success: false, message: 'Order not found.' });
      }
    }

    // Status check: only 'pending' or 'downpayment_confirmed' can be cancelled (Fixes H7)
    if (order.status === 'cancellation_requested') {
      return sendJson(res, 400, {
        success: false,
        message: 'A cancellation request has already been submitted for this order and is pending review.'
      });
    }

    if (order.status !== 'pending' && order.status !== 'downpayment_confirmed') {
      return sendJson(res, 400, {
        success: false,
        message: 'Order cannot be cancelled at its current stage. Baking or delivery is already in progress.'
      });
    }

    // Check if cancellation request already exists
    const existingReq = await client.query(
      'SELECT id FROM cancellation_requests WHERE order_id = $1 LIMIT 1;',
      [order.id]
    );
    if (existingReq.rows.length > 0) {
      return sendJson(res, 400, {
        success: false,
        message: 'A cancellation request already exists for this order.'
      });
    }

    await client.query('BEGIN');

    // Normalize refund details
    const walletRaw = (refundDetails?.wallet || '').toLowerCase();
    const refundChannel = walletRaw.includes('maya') ? 'maya' : (walletRaw.includes('bank') ? 'bank_transfer' : 'gcash');
    const accountName = (refundDetails?.accountName || order.customer_name || 'Customer').trim();
    const accountNumber = (refundDetails?.accountNum || refundDetails?.accountNumber || order.customer_contact || '').trim();
    const reason = (refundDetails?.reason || 'Customer requested order cancellation').trim();
    const eligibleRefund = parseFloat(order.downpayment_required || (parseFloat(order.grand_total) * 0.5));

    // Insert into cancellation_requests table (Fixes H7)
    await client.query(`
      INSERT INTO cancellation_requests (
        order_id, requested_by_user_id, reason, reason_details,
        refund_channel, refund_account_name, refund_account_number,
        eligible_refund_amount, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_review');
    `, [
      order.id,
      session?.uid || null,
      reason.slice(0, 100),
      `Refund requested to ${refundChannel.toUpperCase()}: ${accountNumber} (${accountName})`,
      refundChannel,
      accountName.slice(0, 150),
      accountNumber.slice(0, 50),
      eligibleRefund
    ]);

    // Update order status
    await client.query(
      `UPDATE orders SET status = 'cancellation_requested', updated_at = NOW() WHERE id = $1;`,
      [order.id]
    );

    // Record in status history
    await client.query(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by_user_id, notes)
      VALUES ($1, $2, 'cancellation_requested', $3, $4);
    `, [
      order.id,
      order.status,
      session?.uid || null,
      `Customer initiated cancellation. Refund eligible: PHP ${eligibleRefund.toFixed(2)} to ${refundChannel.toUpperCase()} ${accountNumber}`
    ]);

    await client.query('COMMIT');

    return sendJson(res, 200, {
      success: true,
      message: 'Order cancellation and downpayment refund request recorded successfully.',
      status: 'cancellation_requested',
      eligibleRefund: eligibleRefund
    });
  } catch (e) {
    await client.query('ROLLBACK');
    return sendError(res, 500, 'Failed to process order cancellation.', e);
  } finally {
    client.release();
  }
}

// In-memory rate limiting map for tracking lookups (30 queries/minute per IP)
const trackingRateLimits = new Map();
function checkTrackingRateLimit(ip) {
  const now = Date.now();
  const entry = trackingRateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    trackingRateLimits.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 30) {
    return false;
  }
  entry.count++;
  return true;
}

// 4. Track Order
async function handleTrack(req, res, pool) {
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                   req.socket?.remoteAddress || '127.0.0.1';

  if (!checkTrackingRateLimit(clientIp)) {
    return sendJson(res, 429, {
      success: false,
      message: 'Too many tracking requests. Please wait a moment before trying again.'
    });
  }

  const id = (req.method === 'GET' ? req.query?.id : req.body?.id) || '';
  const contact = (req.method === 'GET' ? req.query?.contact : req.body?.contact) || '';

  const cleanId = id.trim().toUpperCase();
  const cleanContact = contact.trim().toLowerCase();
  const cleanDigits = cleanContact.replace(/\D/g, '');

  // Both ID and contact proof are strictly required
  if (!cleanId || !cleanContact) {
    return sendJson(res, 404, {
      success: false,
      message: 'No matching order found for this tracking ID.'
    });
  }

  // Order lookup: code AND matching contact strictly required
  const oRes = await pool.query(`
    SELECT id, order_code, user_id, customer_name, customer_email, customer_contact,
           delivery_address, delivery_date, delivery_time, special_notes,
           subtotal_amount, delivery_fee, grand_total, downpayment_required,
           downpayment_paid, balance_due, payment_method, status, created_at
    FROM orders
    WHERE UPPER(order_code) = $1
    LIMIT 1;
  `, [cleanId]);

    if (oRes.rows.length === 0) {
      return sendJson(res, 404, {
        success: false,
        message: 'No matching order found for this tracking ID.'
      });
    }

    const o = oRes.rows[0];
    const session = readSession(req);
    const sessionMatch = session && (
      (o.user_id && o.user_id === session.uid) ||
      (o.customer_email && o.customer_email.toLowerCase() === session.email.toLowerCase())
    );

    const emailMatch = o.customer_email && o.customer_email.toLowerCase() === cleanContact;
    const oPhoneDigits = (o.customer_contact || '').replace(/\D/g, '');
    const phoneMatch = cleanDigits.length >= 7 && (oPhoneDigits === cleanDigits || oPhoneDigits.endsWith(cleanDigits));

    if (!sessionMatch && !emailMatch && !phoneMatch) {
      return sendJson(res, 404, {
        success: false,
        message: 'No matching order found for this tracking ID.'
      });
    }

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

    // Check if cancellation details exist
    const cancelRes = await pool.query(`
      SELECT reason, refund_channel, refund_account_name, refund_account_number, eligible_refund_amount
      FROM cancellation_requests
      WHERE order_id = $1
      LIMIT 1;
    `, [o.id]);

    let refundDetails = null;
    if (cancelRes.rows.length > 0) {
      const cr = cancelRes.rows[0];
      refundDetails = {
        reason: cr.reason,
        wallet: cr.refund_channel === 'maya' ? 'PayMaya' : (cr.refund_channel === 'bank_transfer' ? 'Bank Transfer' : 'GCash'),
        accountNum: cr.refund_account_number,
        accountName: cr.refund_account_name,
        amount: parseFloat(cr.eligible_refund_amount)
      };
    }

    return sendJson(res, 200, {
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
        items: items,
        ...(refundDetails ? { refundDetails } : {})
      }
    });
}

// Main Dispatcher
module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'GET, POST, OPTIONS')) return;

  const action = req.query?.action || (req.url.split('?')[0].split('/').filter(Boolean).pop());
  const pool = getPool();

  try {
    if (action === 'receipt') {
      return await handleReceipt(req, res, pool);
    } else if (action === 'cancel') {
      return await handleCancelOrder(req, res, pool);
    } else if (action === 'track') {
      return await handleTrack(req, res, pool);
    } else {
      return await handleCreateOrder(req, res, pool);
    }
  } catch (error) {
    return sendError(res, 500, 'Orders operation failed.', error);
  }
};
