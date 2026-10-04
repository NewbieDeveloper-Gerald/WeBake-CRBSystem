const crypto = require('crypto');
const { getPool } = require('../_lib/db');
const { handleCors, sendJson, sendError } = require('../_lib/http');
const { createProofToken } = require('../_lib/session');
const { createTransporter, buildOtpEmailHtml } = require('../_lib/mailer');

const OTP_PEPPER = process.env.OTP_SECRET || process.env.SESSION_SECRET || 'webake_crb_otp_pepper_salt_2026';

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

async function handleSend(req, res, pool) {
  const { email, purpose = 'verification' } = req.body || {};

  if (!email || !isValidEmail(email)) {
    return sendJson(res, 400, {
      success: false,
      error: 'invalid_email',
      message: 'Please provide a valid email address.'
    });
  }

  const cleanEmail = email.trim().toLowerCase();

  // 1. Hourly rate limit check (Max 5 codes per hour per email)
  const hourlyCheck = await pool.query(`
    SELECT count(*)::int AS count 
    FROM otp_verifications 
    WHERE email_address = $1 AND created_at > NOW() - INTERVAL '1 hour';
  `, [cleanEmail]);

  if (hourlyCheck.rows[0]?.count >= 5) {
    return sendJson(res, 429, {
      success: false,
      error: 'rate_limited',
      message: 'Too many verification requests. Please wait an hour before requesting more codes.'
    });
  }

  // 2. 60-second cooldown check from database
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
      return sendJson(res, 429, {
        success: false,
        error: 'cooldown',
        message: `Please wait ${waitSec} second${waitSec === 1 ? '' : 's'} before requesting another code.`,
        remainingSeconds: waitSec
      });
    }
  }

  // 3. Generate cryptographically secure 6-digit OTP
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = crypto.createHash('sha256').update(otp + OTP_PEPPER).digest('hex');

  // 4. Save into Supabase otp_verifications table (Do NOT swallow errors!)
  await pool.query(`
    INSERT INTO otp_verifications (
      email_address, otp_code_hash, purpose, attempt_count, resend_available_at, expires_at
    ) VALUES (
      $1, $2, $3, 0, NOW() + INTERVAL '60 seconds', NOW() + INTERVAL '5 minutes'
    );
  `, [cleanEmail, otpHash, purpose]);

  // 5. Send email via Gmail SSL Port 465
  const transporter = createTransporter();
  const fromAddress = process.env.GMAIL_USER || 'crbwebake@gmail.com';

  await transporter.sendMail({
    from: `"WeBake — Crumbs N' Rolls Bakery" <${fromAddress}>`,
    to: cleanEmail,
    replyTo: fromAddress,
    subject: `${otp} is your WeBake verification code`,
    text: `Your WeBake verification code is: ${otp}. This code will expire in 5 minutes.`,
    html: buildOtpEmailHtml({ otp, purpose }),
    priority: 'high',
    headers: {
      'X-Priority': '1 (Highest)',
      'X-MSMail-Priority': 'High',
      'Importance': 'High'
    }
  });

  return sendJson(res, 200, {
    success: true,
    message: 'Verification code has been sent to your email.'
  });
}

async function handleVerify(req, res, pool) {
  const { email, code, purpose } = req.body || {};

  if (!email || !code) {
    return sendJson(res, 400, {
      success: false,
      error: 'missing_fields',
      message: 'Email and verification code are required.'
    });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.toString().trim().replace(/\D/g, '');
  const cleanPurpose = (purpose || '').trim();

  // Find latest unconsumed verification record
  // If purpose is supplied, enforce exact purpose match
  const querySql = cleanPurpose
    ? `SELECT id, otp_code_hash, attempt_count, expires_at, purpose
       FROM otp_verifications
       WHERE email_address = $1 AND purpose = $2 AND consumed_at IS NULL
       ORDER BY id DESC LIMIT 1;`
    : `SELECT id, otp_code_hash, attempt_count, expires_at, purpose
       FROM otp_verifications
       WHERE email_address = $1 AND consumed_at IS NULL
       ORDER BY id DESC LIMIT 1;`;

  const queryParams = cleanPurpose ? [cleanEmail, cleanPurpose] : [cleanEmail];
  const { rows } = await pool.query(querySql, queryParams);

  if (rows.length === 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'no_otp_found',
      message: 'No active verification code found. Please request a new code.'
    });
  }

  const record = rows[0];

  if (new Date() > new Date(record.expires_at)) {
    return sendJson(res, 400, {
      success: false,
      error: 'expired',
      message: 'Verification code has expired. Please request a new code.'
    });
  }

  // Atomic attempt increment and lock check (< 5 attempts)
  const attemptRes = await pool.query(`
    UPDATE otp_verifications 
    SET attempt_count = attempt_count + 1 
    WHERE id = $1 AND attempt_count < 5
    RETURNING attempt_count;
  `, [record.id]);

  if (attemptRes.rows.length === 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'too_many_attempts',
      message: 'Too many incorrect attempts. Please request a new code.'
    });
  }

  const currentAttempts = attemptRes.rows[0].attempt_count;
  const inputHash = crypto.createHash('sha256').update(cleanCode + OTP_PEPPER).digest('hex');

  const bufInput = Buffer.from(inputHash);
  const bufStored = Buffer.from(record.otp_code_hash);
  const isMatch = bufInput.length === bufStored.length && crypto.timingSafeEqual(bufInput, bufStored);

  if (!isMatch) {
    const remaining = 5 - currentAttempts;
    return sendJson(res, 400, {
      success: false,
      error: 'wrong_code',
      message: `Incorrect code. ${remaining > 0 ? remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining.' : 'Please request a new code.'}`
    });
  }

  // On success, set verified_at (token will be consumed upon registration/reset/order)
  await pool.query(`UPDATE otp_verifications SET verified_at = NOW() WHERE id = $1;`, [record.id]);

  // Generate tamper-proof signed proof token bound to this email and purpose
  const proofToken = createProofToken({
    email: cleanEmail,
    purpose: record.purpose,
    otpId: record.id,
    expMinutes: 10
  });

  return sendJson(res, 200, {
    success: true,
    verified: true,
    proofToken: proofToken,
    message: 'Email verified successfully.'
  });
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
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
    return sendError(res, 500, 'OTP service encountered an unexpected error.', error);
  }
};
