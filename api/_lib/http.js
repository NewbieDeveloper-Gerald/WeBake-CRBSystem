/**
 * ====================================================================
 * WeBake - HTTP & Security Utility Helper (http.js)
 * Clean CORS allowlisting, method assertions, and safe error handling
 * ====================================================================
 */

const crypto = require('crypto');

/**
 * Handle CORS headers and preflight OPTIONS check
 * Allows credentials (cookies) by reflecting allowed origins
 */
function handleCors(req, res, allowedMethods = 'GET, POST, OPTIONS') {
  const origin = req.headers.origin || '';
  const allowedConfig = process.env.ALLOWED_ORIGINS || process.env.CLIENT_ORIGIN || '';
  const allowedList = allowedConfig
    ? allowedConfig.split(',').map(s => s.trim().toLowerCase())
    : [];

  const isLocal = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
  const isVercel = origin.endsWith('.vercel.app');
  const isAllowed = !allowedConfig || allowedConfig === '*' || allowedList.includes(origin.toLowerCase()) || isLocal || isVercel;

  if (origin && isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Same-origin or non-browser request
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', allowedMethods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Idempotency-Key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true; // handled
  }
  return false;
}

/**
 * Send standard JSON response
 */
function sendJson(res, statusCode, payload) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json(payload);
}

/**
 * Send sanitized client error without leaking internal server/DB details
 */
function sendError(res, statusCode, clientMessage, internalError = null) {
  const reqId = 'req_' + crypto.randomBytes(4).toString('hex');
  if (internalError) {
    console.error(`[Security Safe Log] [${reqId}] ${clientMessage}:`, internalError);
  }
  return sendJson(res, statusCode, {
    success: false,
    message: clientMessage,
    requestId: reqId
  });
}

module.exports = {
  handleCors,
  sendJson,
  sendError
};
