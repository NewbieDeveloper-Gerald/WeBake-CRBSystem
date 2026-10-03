const { getPool } = require('../_lib/db');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const pool = getPool();

  try {
    const { email, appId } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail && !appId) {
      return res.status(400).json({ success: false, message: 'Email or Application ID is required.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Update user partner_status
      let userId = null;
      if (cleanEmail) {
        const uRes = await client.query(
          'UPDATE users SET partner_status = $1 WHERE LOWER(email_address) = $2 RETURNING id;',
          ['none', cleanEmail]
        );
        if (uRes.rows.length > 0) {
          userId = uRes.rows[0].id;
        }
      }

      // 2. Update partner_applications table
      if (appId) {
        await client.query(
          'UPDATE partner_applications SET status = $1 WHERE application_code = $2;',
          ['cancelled', appId]
        );
      } else if (userId || cleanEmail) {
        await client.query(
          'UPDATE partner_applications SET status = $1 WHERE user_id = $2 OR LOWER(applicant_email) = $3;',
          ['cancelled', userId, cleanEmail]
        );
      }

      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        message: 'Wholesale partnership application cancelled successfully.'
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Partner Cancel Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel partnership: ' + error.message
    });
  }
};
