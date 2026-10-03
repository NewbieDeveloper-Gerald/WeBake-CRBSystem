const { getPool } = require('../_lib/db');
const { handleCors, sendJson, sendError } = require('../_lib/http');
const { hashPassword, verifyPassword } = require('../_lib/authHelper');
const { createSessionToken, setSessionCookie } = require('../_lib/session');
const { fetchUserProfile } = require('../_lib/userProfile');

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
  }

  const pool = getPool();

  try {
    const { email, password } = req.body || {};

    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return sendJson(res, 400, { success: false, message: 'Please enter a valid email address.' });
    }
    if (!password) {
      return sendJson(res, 400, { success: false, message: 'Please enter your password.' });
    }

    // 1. Query user by email
    const userQuery = `
      SELECT u.id, u.role_id, r.role_name, u.full_name, u.email_address, u.contact_number,
             u.password_hash, u.partner_status, u.is_active
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE LOWER(u.email_address) = $1
      LIMIT 1;
    `;
    const userRes = await pool.query(userQuery, [cleanEmail]);

    // Uniform authentication failure message to prevent account enumeration (Fixes H9)
    const AUTH_FAILED_MSG = 'Invalid email address or password. Please try again.';

    if (userRes.rows.length === 0) {
      return sendJson(res, 401, {
        success: false,
        error: 'invalid_credentials',
        message: AUTH_FAILED_MSG
      });
    }

    const user = userRes.rows[0];

    // 2. Check if active
    if (user.is_active === false) {
      return sendJson(res, 403, {
        success: false,
        error: 'account_deactivated',
        message: 'This account has been deactivated. Please contact support.'
      });
    }

    // 3. Verify password with constant-time check & re-hash detection
    const verifyResult = await verifyPassword(password, user.password_hash);
    if (!verifyResult.valid) {
      return sendJson(res, 401, {
        success: false,
        error: 'invalid_credentials',
        message: AUTH_FAILED_MSG
      });
    }

    // 4. Upgrade password hash to 210,000 iterations if needed
    if (verifyResult.needsRehash) {
      hashPassword(password)
        .then(newHash => pool.query('UPDATE users SET password_hash = $1 WHERE id = $2;', [newHash, user.id]))
        .catch(err => console.error('[Password Rehash Warning]:', err));
    }

    // 5. Update last_login_at timestamp
    pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1;', [user.id]).catch(e => console.error(e));

    // 6. Create session token & set HttpOnly cookie
    const sessionToken = createSessionToken({
      id: user.id,
      email: user.email_address,
      role_id: user.role_id,
      role_name: user.role_name
    });
    setSessionCookie(res, sessionToken);

    // 7. Retrieve complete user profile & history
    const userProfile = await fetchUserProfile(pool, user.id, cleanEmail);

    return sendJson(res, 200, {
      success: true,
      message: `Welcome back, ${user.full_name}!`,
      user: userProfile
    });

  } catch (error) {
    return sendError(res, 500, 'Authentication service encountered an error.', error);
  }
};
