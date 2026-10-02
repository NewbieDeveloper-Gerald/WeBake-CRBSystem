/**
 * ====================================================================
 * WeBake - OTP Routes & In-Memory Store
 * Handles cryptographic generation, rate limiting, and verification
 * ====================================================================
 */

const express = require('express');
const crypto = require('crypto');
const { sendOtpEmail } = require('../services/mailer');

const router = express.Router();

// In-Memory store for active OTPs (Key: lowercase email)
// Auto-cleans expired entries
const otpStore = new Map();

// Helper: Periodic cleanup of expired tokens every 5 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [email, record] of otpStore.entries()) {
    if (now > record.expiresAt) {
      otpStore.delete(email);
    }
  }
}, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

// Strict email format validation
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

/**
 * POST /api/otp/send
 * Sends a 6-digit OTP to the requested email
 */
router.post('/send', async (req, res) => {
  try {
    const { email, purpose } = req.body || {};

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_email',
        message: 'Please provide a valid email address.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = otpStore.get(cleanEmail);

    // Rate limiting: 60 seconds cooldown between resends
    if (existing && Date.now() < existing.resendAvailableAt) {
      const waitSec = Math.ceil((existing.resendAvailableAt - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        error: 'cooldown',
        message: `Please wait ${waitSec} second${waitSec === 1 ? '' : 's'} before requesting another code.`,
        remainingSeconds: waitSec
      });
    }

    // Cryptographically secure 6-digit OTP (100000 to 999999)
    const otp = crypto.randomInt(100000, 1000000).toString();

    // Store OTP metadata (5-minute expiry, max 5 failed attempts)
    otpStore.set(cleanEmail, {
      code: otp,
      purpose: purpose || 'verification',
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      resendAvailableAt: Date.now() + 60 * 1000
    });

    // Send real email via crbwebake@gmail.com
    try {
      await sendOtpEmail({
        email: cleanEmail,
        otp,
        purpose: purpose || 'verification'
      });
    } catch (mailErr) {
      otpStore.delete(cleanEmail);
      throw mailErr;
    }

    // IMPORTANT: Never return the OTP in the API response
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
 * Verifies the 6-digit code for the email
 */
router.post('/verify', (req, res) => {
  try {
    const { email, code } = req.body || {};

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_email',
        message: 'Please enter a valid email address.'
      });
    }

    const cleanCode = (code || '').toString().trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_format',
        message: 'The verification code must be 6 digits.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const record = otpStore.get(cleanEmail);

    // 1. Missing or already expired
    if (!record) {
      return res.status(400).json({
        success: false,
        error: 'expired',
        message: 'Verification code has expired or was not requested. Please request a new code.'
      });
    }

    // 2. Expired timestamp
    if (Date.now() > record.expiresAt) {
      otpStore.delete(cleanEmail);
      return res.status(400).json({
        success: false,
        error: 'expired',
        message: 'Verification code has expired. Please request a new code.'
      });
    }

    // 3. Rate limiting attempts (Maximum 5 attempts per OTP)
    if (record.attempts >= 5) {
      otpStore.delete(cleanEmail);
      return res.status(429).json({
        success: false,
        error: 'too_many_attempts',
        message: 'Too many incorrect attempts. For security, please request a new verification code.'
      });
    }

    // 4. Code mismatch
    if (record.code !== cleanCode) {
      record.attempts += 1;
      const remainingAttempts = 5 - record.attempts;

      if (remainingAttempts <= 0) {
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
        message: `Incorrect code. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`
      });
    }

    // 5. Successful verification: Delete immediately so it cannot be re-used
    otpStore.delete(cleanEmail);

    return res.json({
      success: true,
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
