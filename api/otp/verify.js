const crypto = require('crypto');
const { getPool } = require('../_lib/db');

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { email, code } = req.body || {};

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message: 'Email and verification code are required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.toString().trim().replace(/\D/g, '');
    const pool = getPool();

    // Look up latest unconsumed OTP in Supabase
    const { rows } = await pool.query(`
      SELECT id, otp_code_hash, attempt_count, expires_at
      FROM otp_verifications
      WHERE email_address = $1 AND consumed_at IS NULL
      ORDER BY id DESC LIMIT 1;
    `, [cleanEmail]);

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'no_otp_found',
        message: 'No active verification code found. Please request a new code.'
      });
    }

    const record = rows[0];

    // Check expiry
    if (new Date() > new Date(record.expires_at)) {
      return res.status(400).json({
        success: false,
        error: 'expired',
        message: 'Verification code has expired. Please request a new code.'
      });
    }

    // Check attempt limit
    if (record.attempt_count >= 5) {
      return res.status(400).json({
        success: false,
        error: 'too_many_attempts',
        message: 'Too many incorrect attempts. Please request a new code.'
      });
    }

    // Validate hash
    const inputHash = crypto.createHash('sha256').update(cleanCode + (process.env.GMAIL_APP_PASS || 'crb')).digest('hex');

    if (inputHash !== record.otp_code_hash) {
      await pool.query(`UPDATE otp_verifications SET attempt_count = attempt_count + 1 WHERE id = $1;`, [record.id]);
      const remaining = 5 - (record.attempt_count + 1);
      return res.status(400).json({
        success: false,
        error: 'wrong_code',
        message: `Incorrect code. ${remaining > 0 ? remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining.' : 'Please request a new code.'}`
      });
    }

    // Mark as consumed
    await pool.query(`UPDATE otp_verifications SET consumed_at = NOW() WHERE id = $1;`, [record.id]);

    return res.status(200).json({
      success: true,
      verified: true,
      message: 'Email verified successfully.'
    });

  } catch (error) {
    console.error('[Vercel Serverless OTP Verify Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Verification failed: ' + error.message
    });
  }
};
