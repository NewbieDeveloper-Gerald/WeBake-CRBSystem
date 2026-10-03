/**
 * ====================================================================
 * WeBake - Session & Token Security Helper (session.js)
 * Cryptographically signed HttpOnly cookie sessions and OTP proof tokens
 * Uses node:crypto HMAC-SHA256 with timingSafeEqual comparison
 * ====================================================================
 */

const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'weBakeSessionToken';
const SESSION_SECRET = process.env.SESSION_SECRET || 'webake_crb_production_hmac_secret_key_2026_x89';
const PROOF_SECRET = process.env.OTP_SECRET || (SESSION_SECRET + '_proof_salt');

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64').toString('utf8');
}

function signPayload(payloadObj, secretKey) {
  const jsonStr = JSON.stringify(payloadObj);
  const encodedPayload = base64UrlEncode(jsonStr);
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyAndDecode(token, secretKey) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(encodedPayload)
    .digest('base64url');

  const bufProvided = Buffer.from(providedSignature);
  const bufExpected = Buffer.from(expectedSignature);

  if (bufProvided.length !== bufExpected.length) return null;
  if (!crypto.timingSafeEqual(bufProvided, bufExpected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * 1. User Session Management (7 days expiry)
 */
function createSessionToken(user) {
  const payload = {
    uid: user.id || user.uid,
    email: (user.email || user.email_address || '').trim().toLowerCase(),
    roleId: user.role_id || user.roleId || 1,
    role: user.role_name || user.role || 'customer',
    name: user.name || user.full_name || '',
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  };
  return signPayload(payload, SESSION_SECRET);
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;

  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const key = parts.shift().trim();
    const val = decodeURIComponent(parts.join('='));
    if (key) list[key] = val;
  });
  return list;
}

function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieFlags = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${7 * 24 * 60 * 60}`
  ];
  if (isProd) {
    cookieFlags.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieFlags.join('; '));
}

function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieFlags = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ];
  if (isProd) {
    cookieFlags.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieFlags.join('; '));
}

function readSession(req) {
  const cookies = parseCookies(req);
  let token = cookies[SESSION_COOKIE_NAME];

  // Fallback to Authorization: Bearer <token>
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) return null;
  return verifyAndDecode(token, SESSION_SECRET);
}

/**
 * 2. OTP Verification Proof Token (10 minutes expiry)
 * Returned upon successful OTP verification to authorize registration, password reset, or checkout
 */
function createProofToken({ email, purpose, otpId, expMinutes = 10 }) {
  const payload = {
    email: (email || '').trim().toLowerCase(),
    purpose,
    otpId,
    type: 'otp_proof',
    exp: Date.now() + expMinutes * 60 * 1000
  };
  return signPayload(payload, PROOF_SECRET);
}

function verifyProofToken(token, expectedPurpose = null, expectedEmail = null) {
  const payload = verifyAndDecode(token, PROOF_SECRET);
  if (!payload || payload.type !== 'otp_proof') return null;

  if (expectedPurpose && payload.purpose !== expectedPurpose) {
    return null;
  }
  if (expectedEmail && payload.email !== expectedEmail.trim().toLowerCase()) {
    return null;
  }
  return payload;
}

module.exports = {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  readSession,
  createProofToken,
  verifyProofToken
};
