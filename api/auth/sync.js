const { getPool } = require('../_lib/db');
const { handleCors, sendJson, sendError } = require('../_lib/http');
const { readSession, clearSessionCookie } = require('../_lib/session');
const { fetchUserProfile } = require('../_lib/user-profile');

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'GET, POST, OPTIONS')) return;

  const session = readSession(req);

  // Require active authentication session (Fixes C3)
  if (!session || !session.uid) {
    return sendJson(res, 401, {
      success: false,
      error: 'unauthorized',
      message: 'Active session required to synchronize user profile.'
    });
  }

  const pool = getPool();

  try {
    const userProfile = await fetchUserProfile(pool, session.uid, session.email);

    if (!userProfile) {
      clearSessionCookie(res);
      return sendJson(res, 404, {
        success: false,
        error: 'user_not_found',
        message: 'Account associated with this session no longer exists.'
      });
    }

    return sendJson(res, 200, {
      success: true,
      user: userProfile
    });

  } catch (error) {
    return sendError(res, 500, 'Failed to synchronize account data.', error);
  }
};
