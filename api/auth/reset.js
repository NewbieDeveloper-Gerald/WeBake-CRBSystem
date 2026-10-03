const { getPool } = require('../_lib/db');
const { handleCors, sendJson, sendError } = require('../_lib/http');
const { hashPassword } = require('../_lib/authHelper');
const { verifyProofToken } = require('../_lib/session');

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
  }

  const pool = getPool();

  try {
    const { email, password, proofToken } = req.body || {};

    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return sendJson(res, 400, { success: false, message: 'A valid email address is required.' });
    }
    if (!password || password.length < 6) {
      return sendJson(res, 400, { success: false, message: 'Password must be at least 6 characters long.' });
    }

    // 1. Enforce cryptographic proof token verification (Fixes C2)
    const verifiedProof = verifyProofToken(proofToken, null, cleanEmail);
    const validPurpose = verifiedProof && (verifiedProof.purpose === 'forgot' || verifiedProof.purpose === 'forgot_password');
    if (!verifiedProof || !validPurpose) {
      return sendJson(res, 403, {
        success: false,
        error: 'verification_required',
        message: 'A verified OTP code is required to reset your password. Please request and verify a code.'
      });
    }

    // 2. Consume OTP record atomically
    const consumeRes = await pool.query(`
      UPDATE otp_verifications 
      SET consumed_at = NOW() 
      WHERE id = $1 AND verified_at IS NOT NULL AND consumed_at IS NULL AND expires_at > NOW()
      RETURNING id;
    `, [verifiedProof.otpId]);

    if (consumeRes.rows.length === 0) {
      return sendJson(res, 403, {
        success: false,
        error: 'token_consumed',
        message: 'This verification token has already been used or has expired. Please request a new code.'
      });
    }

    // 3. Check user exists
    const checkRes = await pool.query('SELECT id FROM users WHERE LOWER(email_address) = $1 LIMIT 1;', [cleanEmail]);
    if (checkRes.rows.length === 0) {
      return sendJson(res, 404, {
        success: false,
        message: 'No account found for this email address.'
      });
    }

    // 4. Hash new password with 210,000 PBKDF2 iterations
    const pwdHash = await hashPassword(password);

    await pool.query(`
      UPDATE users
      SET password_hash = $1, updated_at = NOW()
      WHERE LOWER(email_address) = $2;
    `, [pwdHash, cleanEmail]);

    return sendJson(res, 200, {
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.'
    });

  } catch (error) {
    return sendError(res, 500, 'Failed to reset password.', error);
  }
};
