const { getPool } = require('../_lib/db');
const { hashPassword } = require('../_lib/authHelper');

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
    console.error('[Auth Register Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create account: ' + error.message
    });
  } finally {
    client.release();
  }
};
