/**
 * ====================================================================
 * WeBake - Customer Authentication Routes (authRoutes.js)
 * Connected to Supabase PostgreSQL Database (Tier 1 Users Table)
 * ====================================================================
 */

const express = require('express');
const db = require('../database/db');
const { hashPassword, verifyPassword } = require('../utils/authHelper');

const router = express.Router();

/**
 * POST /api/auth/register
 * Persists a newly verified customer into Supabase
 */
router.post('/register', async (req, res) => {
  const client = await db.getClient();
  try {
    const { name, email, password, contact, address } = req.body || {};

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();
    const cleanContact = (contact || '').trim().replace(/\D/g, '');
    const cleanAddress = (address || '').trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }
    if (!cleanContact || cleanContact.length !== 11 || !cleanContact.startsWith('09')) {
      return res.status(400).json({ success: false, message: 'Contact number must be 11 digits starting with 09.' });
    }
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }

    await client.query('BEGIN');

    // 1. Check if user already exists
    const existingRes = await client.query(
      'SELECT id FROM users WHERE LOWER(email_address) = $1 LIMIT 1;',
      [cleanEmail]
    );

    if (existingRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'An account with this email is already registered. Please sign in instead.'
      });
    }

    // 2. Hash password
    const pwdHash = hashPassword(password);

    // 3. Insert into users table
    const insertUserSql = `
      INSERT INTO users (
        role_id, full_name, email_address, contact_number, password_hash,
        partner_status, is_active, email_verified_at, created_at, updated_at
      ) VALUES (
        1, $1, $2, $3, $4, 'none', TRUE, NOW(), NOW(), NOW()
      ) RETURNING id, role_id, full_name, email_address, contact_number, partner_status, created_at;
    `;
    const userRes = await client.query(insertUserSql, [
      cleanName,
      cleanEmail,
      cleanContact,
      pwdHash
    ]);
    const newUser = userRes.rows[0];

    // 4. Save address if provided
    if (cleanAddress) {
      await client.query(`
        INSERT INTO user_addresses (user_id, address_line1, is_default, created_at, updated_at)
        VALUES ($1, $2, TRUE, NOW(), NOW());
      `, [newUser.id, cleanAddress]);
    }

    // 5. Connect any existing unlinked orders matching this email
    await client.query(`
      UPDATE orders
      SET user_id = $1
      WHERE user_id IS NULL AND LOWER(customer_email) = $2;
    `, [newUser.id, cleanEmail]);

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Account created successfully in cloud database.',
      user: {
        id: newUser.id,
        name: newUser.full_name,
        email: newUser.email_address,
        contact: newUser.contact_number,
        address: cleanAddress,
        partnerStatus: newUser.partner_status || 'none',
        savedCart: [],
        orderHistory: []
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Backend Auth Register Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create account: ' + error.message
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/auth/login
 * Validates credentials against Supabase and loads user profile & order history
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: 'Please enter your password.' });
    }

    // 1. Query user by email
    const userQuery = `
      SELECT u.id, u.role_id, u.full_name, u.email_address, u.contact_number,
             u.password_hash, u.partner_status, u.is_active, u.saved_cart,
             a.address_line1 AS address
      FROM users u
      LEFT JOIN user_addresses a ON a.user_id = u.id AND a.is_default = TRUE
      WHERE LOWER(u.email_address) = $1
      LIMIT 1;
    `;
    const userRes = await db.query(userQuery, [cleanEmail]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'user_not_found',
        message: 'No account found for this email. Please check your spelling or register.'
      });
    }

    const user = userRes.rows[0];

    // 2. Check if active
    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        error: 'account_deactivated',
        message: 'This account has been deactivated. Please contact support.'
      });
    }

    // 3. Verify password
    const passwordValid = verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: 'incorrect_password',
        message: 'Incorrect password. Please try again.'
      });
    }

    // 4. Update last_login_at timestamp asynchronously
    db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1;', [user.id]).catch(e => console.error(e));

    // 5. Query user's order history from cloud database
    const ordersRes = await db.query(`
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
      const itemsRes = await db.query(`
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

    // 6. Check partner application status
    let partnerStatus = user.partner_status || 'none';
    let partnerAppId = null;
    let partnerDetails = null;

    try {
      const partnerRes = await db.query(
        `SELECT application_code, business_name, business_type, years_in_operation,
                estimated_weekly_volume, delivery_address, products_of_interest, additional_notes, status
         FROM partner_applications
         WHERE user_id = $1 OR LOWER(applicant_email) = $2
         ORDER BY 
           CASE WHEN status IN ('pending', 'under_review', 'approved') THEN 1 ELSE 2 END ASC,
           id DESC 
         LIMIT 1;`,
        [user.id, cleanEmail]
      );
      if (partnerRes.rows.length > 0) {
        const app = partnerRes.rows[0];
        partnerStatus = app.status;
        partnerAppId = app.application_code;
        partnerDetails = {
          'business-name': app.business_name,
          'bakery-name': app.business_name,
          'business-type': app.business_type,
          'type': app.business_type,
          'owner-name': user.full_name,
          email: user.email_address,
          phone: user.contact_number,
          years: app.years_in_operation,
          volume: app.estimated_weekly_volume,
          address: app.delivery_address,
          products: app.products_of_interest || [],
          notes: app.additional_notes || ''
        };
      }
    } catch (e) {
      console.warn('[Partner App Login Query Warning]:', e.message);
    }

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${user.full_name}!`,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email_address,
        contact: user.contact_number,
        address: user.address || '',
        partnerStatus: partnerStatus,
        partnerAppId: partnerAppId,
        partnerDetails: partnerDetails,
        savedCart: user.saved_cart || [],
        orderHistory: orderHistory
      }
    });

  } catch (error) {
    console.error('[Backend Auth Login Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to authenticate: ' + error.message
    });
  }
});

/**
 * POST /api/auth/reset
 * Resets user password in Supabase
 */
router.post('/reset', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const checkRes = await db.query('SELECT id FROM users WHERE LOWER(email_address) = $1 LIMIT 1;', [cleanEmail]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No account found for this email address.'
      });
    }

    const pwdHash = hashPassword(password);

    await db.query(`
      UPDATE users
      SET password_hash = $1, updated_at = NOW()
      WHERE LOWER(email_address) = $2;
    `, [pwdHash, cleanEmail]);

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.'
    });

  } catch (error) {
    console.error('[Backend Auth Reset Password Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset password: ' + error.message
    });
  }
});

/**
 * GET or POST /api/auth/check
 * Checks if email is already registered in database
 */
router.all('/check', async (req, res) => {
  try {
    const email = req.method === 'GET'
      ? (req.query?.email || '')
      : (req.body?.email || '');

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'Email query parameter is required.' });
    }

    const { rows } = await db.query(
      'SELECT id, full_name, email_address FROM users WHERE LOWER(email_address) = $1 LIMIT 1;',
      [cleanEmail]
    );

    return res.status(200).json({
      success: true,
      exists: rows.length > 0,
      user: rows.length > 0 ? { name: rows[0].full_name, email: rows[0].email_address } : null
    });

  } catch (error) {
    console.error('[Backend Auth Check Email Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check email: ' + error.message
    });
  }
});

/**
 * GET or POST /api/auth/sync
 * Returns fresh user profile, partner status, and order history
 */
router.all('/sync', async (req, res) => {
  try {
    const email = req.method === 'GET'
      ? (req.query?.email || '')
      : (req.body?.email || '');

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const userRes = await db.query(`
      SELECT u.id, u.role_id, u.full_name, u.email_address, u.contact_number,
             u.partner_status, u.is_active, u.saved_cart,
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

    const ordersRes = await db.query(`
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
      const itemsRes = await db.query(`
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
    let partnerAppId = null;
    let partnerDetails = null;

    try {
      const partnerRes = await db.query(
        `SELECT application_code, business_name, business_type, years_in_operation,
                estimated_weekly_volume, delivery_address, products_of_interest, additional_notes, status
         FROM partner_applications
         WHERE user_id = $1 OR LOWER(applicant_email) = $2
         ORDER BY 
           CASE WHEN status IN ('pending', 'under_review', 'approved') THEN 1 ELSE 2 END ASC,
           id DESC 
         LIMIT 1;`,
        [user.id, cleanEmail]
      );
      if (partnerRes.rows.length > 0) {
        const app = partnerRes.rows[0];
        partnerStatus = app.status;
        partnerAppId = app.application_code;
        partnerDetails = {
          'business-name': app.business_name,
          'bakery-name': app.business_name,
          'business-type': app.business_type,
          'type': app.business_type,
          'owner-name': user.full_name,
          email: user.email_address,
          phone: user.contact_number,
          years: app.years_in_operation,
          volume: app.estimated_weekly_volume,
          address: app.delivery_address,
          products: app.products_of_interest || [],
          notes: app.additional_notes || ''
        };
      }
    } catch (e) {
      console.warn('[Partner App Sync Query Warning]:', e.message);
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email_address,
        contact: user.contact_number,
        address: user.address || '',
        partnerStatus: partnerStatus,
        partnerAppId: partnerAppId,
        partnerDetails: partnerDetails,
        savedCart: user.saved_cart || [],
        orderHistory: orderHistory
      }
    });

  } catch (error) {
    console.error('[Backend Auth Sync Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync user: ' + error.message
    });
  }
});

module.exports = router;
