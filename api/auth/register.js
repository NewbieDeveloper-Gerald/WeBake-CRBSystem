const { getPool } = require('../_lib/db');
const { handleCors, sendJson, sendError } = require('../_lib/http');
const { hashPassword } = require('../_lib/authHelper');
const { createSessionToken, setSessionCookie, verifyProofToken } = require('../_lib/session');

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    const { name, email, password, contact, address, proofToken } = req.body || {};

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();
    const cleanContact = (contact || '').trim().replace(/\D/g, '');
    const cleanAddress = (address || '').trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return sendJson(res, 400, { success: false, message: 'A valid email address is required.' });
    }
    if (!password || password.length < 6) {
      return sendJson(res, 400, { success: false, message: 'Password must be at least 6 characters long.' });
    }
    if (!cleanContact || cleanContact.length !== 11 || !cleanContact.startsWith('09')) {
      return sendJson(res, 400, { success: false, message: 'Contact number must be 11 digits starting with 09.' });
    }
    if (!cleanName) {
      return sendJson(res, 400, { success: false, message: 'Full name is required.' });
    }

    // 1. Cryptographic proof token verification (Fixes C2)
    const decodedProof = verifyProofToken(proofToken, null, cleanEmail);
    if (!decodedProof || (decodedProof.purpose !== 'register' && decodedProof.purpose !== 'registration')) {
      return sendJson(res, 403, {
        success: false,
        error: 'verification_required',
        message: 'Email verification code is required to register. Please complete the verification step.'
      });
    }
    const verifiedProof = decodedProof;

    await client.query('BEGIN');

    // 2. Consume OTP record atomically
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
        message: 'This verification code has already been used or expired. Please request a new code.'
      });
    }

    // 3. Check if user already exists
    const existingRes = await client.query(
      'SELECT id FROM users WHERE LOWER(email_address) = $1 LIMIT 1;',
      [cleanEmail]
    );

    if (existingRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return sendJson(res, 409, {
        success: false,
        message: 'An account with this email is already registered. Please sign in instead.'
      });
    }

    // 4. Hash password with PBKDF2-SHA512 (210,000 iterations)
    const pwdHash = await hashPassword(password);

    // 5. Insert into users table
    const insertUserSql = `
      INSERT INTO users (
        role_id, full_name, email_address, contact_number, password_hash,
        partner_status, is_active, email_verified_at, saved_cart, created_at, updated_at
      ) VALUES (
        1, $1, $2, $3, $4, 'none', TRUE, NOW(), '[]'::jsonb, NOW(), NOW()
      ) RETURNING id, role_id, full_name, email_address, contact_number, partner_status, created_at;
    `;
    const userRes = await client.query(insertUserSql, [
      cleanName,
      cleanEmail,
      cleanContact,
      pwdHash
    ]);
    const newUser = userRes.rows[0];

    // 6. Save address if provided
    if (cleanAddress) {
      await client.query(`
        INSERT INTO user_addresses (user_id, address_line1, is_default, created_at, updated_at)
        VALUES ($1, $2, TRUE, NOW(), NOW());
      `, [newUser.id, cleanAddress]);
    }

    // 7. Connect any existing unlinked orders matching this email
    await client.query(`
      UPDATE orders
      SET user_id = $1
      WHERE user_id IS NULL AND LOWER(customer_email) = $2;
    `, [newUser.id, cleanEmail]);

    await client.query('COMMIT');

    // 8. Create and set HttpOnly session cookie
    const sessionToken = createSessionToken({
      id: newUser.id,
      email: newUser.email_address,
      role_id: newUser.role_id,
      role_name: 'customer'
    });
    setSessionCookie(res, sessionToken);

    return sendJson(res, 201, {
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
    return sendError(res, 500, 'Failed to create account.', error);
  } finally {
    client.release();
  }
};
