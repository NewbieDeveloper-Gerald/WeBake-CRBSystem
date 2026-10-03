const crypto = require('crypto');
const { getPool } = require('../_lib/db');
const { createTransporter, buildOtpEmailHtml } = require('../_lib/mailer');

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

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
    const { email, purpose = 'verification' } = req.body || {};

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_email',
        message: 'Please provide a valid email address.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const pool = getPool();

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

    console.log(`[Vercel Serverless OTP] Dispatched OTP to ${cleanEmail}`);

    return res.status(200).json({
      success: true,
      message: 'Verification code has been sent to your email.'
    });

  } catch (error) {
    console.error('[Vercel Serverless OTP Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'sending_failed',
      message: 'Failed to dispatch verification code. ' + error.message
    });
  }
};
