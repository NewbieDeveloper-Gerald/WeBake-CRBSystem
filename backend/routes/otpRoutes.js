/**
 * ====================================================================
 * WeBake - OTP Routes (Supabase PostgreSQL Backed with In-Memory Resilience)
 * Handles cryptographic generation, rate limiting, and signed proof tokens
 * ====================================================================
 */

const express = require('express');
const crypto = require('crypto');
const db = require('../database/db');
const { sendOtpEmail } = require('../services/mailer');

const router = express.Router();

const OTP_PEPPER = process.env.OTP_SECRET || process.env.SESSION_SECRET || 'webake_crb_otp_pepper_salt_2026';
const PROOF_SECRET = process.env.OTP_SECRET || (process.env.SESSION_SECRET ? process.env.SESSION_SECRET + '_proof_salt' : 'webake_crb_otp_proof_salt_2026');

// Helper for Base64URL Encoding & Proof Tokens
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createProofToken({ email, purpose, otpId, expMinutes = 10 }) {
  const payload = {
    email: (email || '').trim().toLowerCase(),
    purpose,
    otpId: otpId || Date.now(),
    type: 'otp_proof',
    exp: Date.now() + expMinutes * 60 * 1000
  };
  const jsonStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(jsonStr);
  const signature = crypto
    .createHmac('sha256', PROOF_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

// In-Memory store fallback
const otpStore = new Map();
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [email, record] of otpStore.entries()) {
    if (now > record.expiresAt) {
      otpStore.delete(email);
    }
  }
}, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

/**
 * POST /api/otp/send
 * Generates and emails a 6-digit OTP
 */
router.post('/send', async (req, res) => {
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

    // 1. Database Rate Limit & Cooldown Check (if DB is accessible)
    try {
      const hourlyCheck = await db.query(`
        SELECT count(*)::int AS count 
        FROM otp_verifications 
        WHERE email_address = $1 AND created_at > NOW() - INTERVAL '1 hour';
      `, [cleanEmail]);

      if (hourlyCheck.rows[0]?.count >= 10) {
        return res.status(429).json({
          success: false,
          error: 'rate_limited',
          message: 'Too many verification requests. Please wait before requesting more codes.'
        });
      }

      const cooldownCheck = await db.query(`
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
      // In-Memory Cooldown fallback
      const existing = otpStore.get(cleanEmail);
      if (existing && Date.now() < existing.resendAvailableAt) {
        const waitSec = Math.ceil((existing.resendAvailableAt - Date.now()) / 1000);
        return res.status(429).json({
          success: false,
          error: 'cooldown',
          message: `Please wait ${waitSec} second${waitSec === 1 ? '' : 's'} before requesting another code.`,
          remainingSeconds: waitSec
        });
      }
    }

    // 2. Generate secure 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(otp + OTP_PEPPER).digest('hex');

    // 3. Save into Supabase Database
    let dbOtpId = null;
    try {
      const insertRes = await db.query(`
        INSERT INTO otp_verifications (
          email_address, otp_code_hash, purpose, attempt_count, resend_available_at, expires_at
        ) VALUES (
          $1, $2, $3, 0, NOW() + INTERVAL '60 seconds', NOW() + INTERVAL '5 minutes'
        ) RETURNING id;
      `, [cleanEmail, otpHash, purpose]);
      if (insertRes.rows.length > 0) {
        dbOtpId = insertRes.rows[0].id;
      }
    } catch (dbErr) {
      console.warn('[OTP] Database insert skipped, falling back to memory store:', dbErr.message);
    }

    // Always keep in memory store as fallback
    otpStore.set(cleanEmail, {
      id: dbOtpId || Date.now(),
      code: otp,
      purpose,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      resendAvailableAt: Date.now() + 60 * 1000
    });

    // 4. Send transactional email
    try {
      await sendOtpEmail({
        email: cleanEmail,
        otp,
        purpose
      });
    } catch (mailErr) {
      otpStore.delete(cleanEmail);
      if (dbOtpId) {
        try { await db.query('DELETE FROM otp_verifications WHERE id = $1;', [dbOtpId]); } catch (_) {}
      }
      throw mailErr;
    }

    return res.json({
      success: true,
      message: 'Verification code has been sent to your email.'
    });

  } catch (error) {
    console.error('Error sending OTP email:', error.message);
    return res.status(500).json({
      success: false,
      error: 'sending_failed',
      message: error.message || 'Sending failed. Please verify the mailer configuration.'
    });
  }
});

/**
 * POST /api/otp/verify
 * Validates the 6-digit OTP code and returns an authentic signed proof token
 */
router.post('/verify', async (req, res) => {
  try {
    const { email, code, purpose } = req.body || {};

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_email',
        message: 'Please enter a valid email address.'
      });
    }

    const cleanCode = (code || '').toString().trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      return res.status(400).json({
        success: false,
        error: 'invalid_format',
        message: 'The verification code must be 6 digits.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPurpose = (purpose || '').trim();

    // 1. Try DB Verification first
    try {
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
      const { rows } = await db.query(querySql, queryParams);

      if (rows.length > 0) {
        const record = rows[0];

        if (new Date() > new Date(record.expires_at)) {
          return res.status(400).json({
            success: false,
            error: 'expired',
            message: 'Verification code has expired. Please request a new code.'
          });
        }

        const attemptRes = await db.query(`
          UPDATE otp_verifications 
          SET attempt_count = attempt_count + 1 
          WHERE id = $1 AND attempt_count < 5
          RETURNING attempt_count;
        `, [record.id]);

        if (attemptRes.rows.length === 0) {
          return res.status(400).json({
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
          return res.status(400).json({
            success: false,
            error: 'wrong_code',
            message: `Incorrect code. ${remaining > 0 ? remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining.' : 'Please request a new code.'}`
          });
        }

        // On success: mark verified
        await db.query(`UPDATE otp_verifications SET verified_at = NOW() WHERE id = $1;`, [record.id]);
        otpStore.delete(cleanEmail);

        const proofToken = createProofToken({
          email: cleanEmail,
          purpose: record.purpose,
          otpId: record.id,
          expMinutes: 10
        });

        return res.json({
          success: true,
          verified: true,
          proofToken,
          message: 'Email verified successfully.'
        });
      }
    } catch (dbErr) {
      console.warn('[OTP] DB verify fallback to memory store:', dbErr.message);
    }

    // 2. In-Memory Store Fallback
    const record = otpStore.get(cleanEmail);
    if (!record) {
      return res.status(400).json({
        success: false,
        error: 'no_otp_found',
        message: 'No active verification code found. Please request a new code.'
      });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(cleanEmail);
      return res.status(400).json({
        success: false,
        error: 'expired',
        message: 'Verification code has expired. Please request a new code.'
      });
    }

    if (record.attempts >= 5) {
      otpStore.delete(cleanEmail);
      return res.status(429).json({
        success: false,
        error: 'too_many_attempts',
        message: 'Too many incorrect attempts. Please request a new verification code.'
      });
    }

    if (record.code !== cleanCode) {
      record.attempts += 1;
      const remaining = 5 - record.attempts;
      if (remaining <= 0) {
        otpStore.delete(cleanEmail);
        return res.status(429).json({
          success: false,
          error: 'too_many_attempts',
          message: 'Too many incorrect attempts. Please request a new code.'
        });
      }
      return res.status(400).json({
        success: false,
        error: 'wrong_code',
        message: `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      });
    }

    otpStore.delete(cleanEmail);
    const proofToken = createProofToken({
      email: cleanEmail,
      purpose: record.purpose,
      otpId: record.id,
      expMinutes: 10
    });

    return res.json({
      success: true,
      verified: true,
      proofToken,
      message: 'Email verified successfully.'
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Server error during verification. Please try again.'
    });
  }
});

module.exports = router;
