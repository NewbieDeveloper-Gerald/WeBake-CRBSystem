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

  try {
    const { email, password } = req.body || {};

    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    // Check user exists
    const checkRes = await pool.query('SELECT id FROM users WHERE LOWER(email_address) = $1 LIMIT 1;', [cleanEmail]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No account found for this email address.'
      });
    }

    const pwdHash = hashPassword(password);

    await pool.query(`
      UPDATE users
      SET password_hash = $1, updated_at = NOW()
      WHERE LOWER(email_address) = $2;
    `, [pwdHash, cleanEmail]);

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.'
    });

  } catch (error) {
    console.error('[Auth Reset Password Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset password: ' + error.message
    });
  }
};
