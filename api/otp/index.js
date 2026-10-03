const crypto = require('crypto');
const { getPool } = require('../_lib/db');
const { createTransporter, buildOtpEmailHtml } = require('../_lib/mailer');

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

async function handleSend(req, res, pool) {
  const { email, purpose = 'verification' } = req.body || {};

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      error: 'invalid_email',
      message: 'Please provide a valid email address.'
    });
  }

  const cleanEmail = email.trim().toLowerCase();

  // 1. Check rate limit (60s cooldown) from Supabase
  try {
    const cooldownCheck = await pool.query(`
      SELECT resend_available_at 
      FROM otp_verifications 
      WHERE email_address = $1 AND consumed_at IS NULL AND expires_at > NOW()
      ORDER BY id DESC LIMIT 1;
    `, [cleanEmail]);

    if (cooldownCheck.rows.length > 0) {
      const resendAt = new Date(cooldownCheck.rows[0].resend_available_at).getTime();
      const now = Date.now();
      if (now < resendAt) {
        const waitSec = Math.ceil((resendAt - now) / 1000);
        return res.status(429).json({
          success: false,
          error: 'cooldown',
          message: `Please wait ${waitSec} second${waitSec === 1 ? '' : 's'} before requesting another code.`,
          remainingSeconds: waitSec
        });
      }
    }
  } catch (dbErr) {
    console.warn('[Vercel OTP DB Cooldown Notice]:', dbErr.message);
  }

  // 2. Generate cryptographically secure 6-digit OTP
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = crypto.createHash('sha256').update(otp + (process.env.GMAIL_APP_PASS || 'crb')).digest('hex');

  // 3. Save into Supabase otp_verifications table
  try {
    await pool.query(`
      INSERT INTO otp_verifications (
        email_address, otp_code_hash, purpose, attempt_count, resend_available_at, expires_at
      ) VALUES (
        $1, $2, $3, 0, NOW() + INTERVAL '60 seconds', NOW() + INTERVAL '5 minutes'
      );
    `, [cleanEmail, otpHash, purpose]);
  } catch (insertErr) {
    console.warn('[Vercel OTP DB Insert Notice]:', insertErr.message);
  }

  // 4. Send email via Gmail SSL Port 465 (Vercel allows Port 465)
  const transporter = createTransporter();
  const fromAddress = process.env.GMAIL_USER || 'crbwebake@gmail.com';

  await transporter.sendMail({
    from: `"WeBake — Crumbs N' Rolls Bakery" <${fromAddress}>`,
    to: cleanEmail,
    subject: `${otp} is your WeBake verification code`,
    text: `Your WeBake verification code is: ${otp}. This code will expire in 5 minutes.`,
    html: buildOtpEmailHtml({ otp, purpose })
  });

  return res.status(200).json({
    success: true,
    message: 'Verification code has been sent to your email.'
  });
}

async function handleVerify(req, res, pool) {
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

  if (new Date() > new Date(record.expires_at)) {
    return res.status(400).json({
      success: false,
      error: 'expired',
      message: 'Verification code has expired. Please request a new code.'
    });
  }

  if (record.attempt_count >= 5) {
    return res.status(400).json({
      success: false,
      error: 'too_many_attempts',
      message: 'Too many incorrect attempts. Please request a new code.'
    });
  }

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

  await pool.query(`UPDATE otp_verifications SET consumed_at = NOW() WHERE id = $1;`, [record.id]);

  return res.status(200).json({
    success: true,
    verified: true,
    message: 'Email verified successfully.'
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const action = req.query?.action || (req.url.split('?')[0].split('/').filter(Boolean).pop());
  const pool = getPool();

  try {
    if (action === 'verify') {
      return await handleVerify(req, res, pool);
    } else {
      return await handleSend(req, res, pool);
    }
  } catch (error) {
    console.error('[OTP Router Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'OTP operation failed: ' + error.message
    });
  }
};
