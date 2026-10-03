const { getPool } = require('../_lib/db');
const { handleCors, sendJson, sendError } = require('../_lib/http');
const { readSession } = require('../_lib/session');

function normalizeBusinessType(type) {
  const t = (type || '').toLowerCase().trim();
  if (t.includes('sari')) return 'sari_sari';
  if (t.includes('cafe') || t.includes('coffee')) return 'cafe';
  if (t.includes('direct')) return 'direct_selling';
  if (t.includes('online')) return 'online_shop';
  if (t.includes('bakery')) return 'bakery';
  return 'other';
}

async function handleApply(req, res, pool) {
  const client = await pool.connect();
  try {
    const session = readSession(req);
    const data = req.body || {};

    const applicantName = (data.fullName || data.name || (session?.name) || '').trim();
    const applicantEmail = (session?.email || data.email || '').trim().toLowerCase();
    const applicantPhone = (data.phone || data.contact || '').trim().replace(/\D/g, '');
    const businessName = (data.businessName || data.storeName || '').trim();
    const businessType = normalizeBusinessType(data.businessType);
    const yearsInOp = (data.yearsInOperation || data.experience || '').trim();
    const weeklyVol = (data.weeklyVolume || '').trim();
    const deliveryAddress = (data.address || '').trim();
    const products = Array.isArray(data.products) && data.products.length > 0 ? data.products : [];
    const notes = data.notes || '';

    if (!applicantName || !applicantEmail || !applicantPhone || !businessName || !deliveryAddress) {
      return sendJson(res, 400, {
        success: false,
        message: 'Full name, email address, contact number, business name, and delivery address are required.'
      });
    }

    if (!yearsInOp || !weeklyVol) {
      return sendJson(res, 400, {
        success: false,
        message: 'Years in operation and estimated weekly volume are required.'
      });
    }

    if (products.length === 0) {
      return sendJson(res, 400, {
        success: false,
        message: 'Please select at least one product of interest.'
      });
    }

    if (applicantPhone.length !== 11 || !applicantPhone.startsWith('09')) {
      return sendJson(res, 400, {
        success: false,
        message: 'Contact number must be an 11-digit mobile number starting with 09.'
      });
    }

    await client.query('BEGIN');

    // 1. Resolve user ID from session or email
    let userId = session?.uid || null;
    if (!userId && applicantEmail) {
      const userRes = await client.query('SELECT id, partner_status FROM users WHERE LOWER(email_address) = $1;', [applicantEmail]);
      if (userRes.rows.length > 0) {
        userId = userRes.rows[0].id;
      }
    }

    // 2. Check if active application already exists
    const existingAppRes = await client.query(
      `SELECT id, application_code, user_id, status FROM partner_applications
       WHERE (user_id = $1 OR LOWER(applicant_email) = $2 OR applicant_phone = $3) 
         AND status NOT IN ('cancelled', 'rejected')
       ORDER BY id DESC LIMIT 1;`,
      [userId || 0, applicantEmail, applicantPhone]
    );

    let finalAppCode = null;
    let finalStatus = 'pending';

    if (existingAppRes.rows.length > 0) {
      const existing = existingAppRes.rows[0];

      // Ownership authorization check (Fixes C3, H8)
      if (session && existing.user_id && existing.user_id !== session.uid) {
        await client.query('ROLLBACK');
        return sendJson(res, 403, {
          success: false,
          message: 'An application exists with these credentials belonging to another user.'
        });
      }

      finalAppCode = existing.application_code;
      finalStatus = existing.status;

      // Do NOT downgrade an already approved wholesale partner to pending (Fixes H8)
      await client.query(`
        UPDATE partner_applications
        SET applicant_name = $1, business_name = $2, business_type = $3,
            years_in_operation = $4, estimated_weekly_volume = $5,
            delivery_address = $6, products_of_interest = $7,
            additional_notes = $8, updated_at = NOW()
        WHERE id = $9;
      `, [
        applicantName, businessName, businessType,
        yearsInOp, weeklyVol,
        deliveryAddress, products, notes, existing.id
      ]);
    } else {
      // Insert new application with retry loop on application_code collision (Fixes H8)
      const crypto = require('crypto');
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidateCode = `WB-PRT-${crypto.randomInt(10000, 99999)}`;
        try {
          await client.query(`
            INSERT INTO partner_applications (
              application_code, user_id, applicant_name, applicant_email, applicant_phone,
              business_name, business_type, years_in_operation, estimated_weekly_volume,
              delivery_address, products_of_interest, additional_notes, status
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending'
            );
          `, [
            candidateCode, userId, applicantName, applicantEmail, applicantPhone,
            businessName, businessType, yearsInOp, weeklyVol,
            deliveryAddress, products, notes
          ]);
          finalAppCode = candidateCode;
          break;
        } catch (err) {
          if (err.code === '23505' && err.constraint === 'partner_applications_application_code_key') {
            continue; // collision, retry
          }
          throw err;
        }
      }

      if (!finalAppCode) {
        await client.query('ROLLBACK');
        return sendError(res, 500, 'Unable to generate unique partner application code.');
      }
    }

    // 3. Update user partner_status ONLY if not already active/approved
    if (userId) {
      await client.query(`
        UPDATE users 
        SET partner_status = 'pending' 
        WHERE id = $1 AND partner_status NOT IN ('active', 'approved');
      `, [userId]);
    }

    await client.query('COMMIT');

    return sendJson(res, 201, {
      success: true,
      message: 'Wholesale partner application submitted successfully.',
      applicationCode: finalAppCode,
      status: finalStatus
    });

  } catch (error) {
    await client.query('ROLLBACK');
    return sendError(res, 500, 'Failed to process wholesale partner application.', error);
  } finally {
    client.release();
  }
}

async function handleCancel(req, res, pool) {
  const session = readSession(req);
  const { email, appId, phone } = req.body || {};
  const cleanEmail = (session?.email || email || '').trim().toLowerCase();
  const cleanAppId = (appId || '').trim().toUpperCase();
  const cleanPhone = (phone || '').trim().replace(/\D/g, '');

  if (!cleanAppId && !cleanEmail) {
    return sendJson(res, 400, { success: false, message: 'Application ID or email is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find the target application
    let querySql = `SELECT id, application_code, user_id, status FROM partner_applications WHERE 1=1 `;
    const params = [];

    if (cleanAppId) {
      params.push(cleanAppId);
      querySql += ` AND UPPER(application_code) = $${params.length}`;
    }
    if (session) {
      params.push(session.uid);
      querySql += ` AND (user_id = $${params.length} OR LOWER(applicant_email) = $${params.length + 1})`;
      params.push(session.email);
    } else {
      // Guest cancellation requires matching both appId and (email OR phone) (Fixes C3)
      if (!cleanEmail && !cleanPhone) {
        await client.query('ROLLBACK');
        return sendJson(res, 400, { success: false, message: 'Contact email or phone is required to verify ownership.' });
      }
      if (cleanEmail) {
        params.push(cleanEmail);
        querySql += ` AND LOWER(applicant_email) = $${params.length}`;
      }
      if (cleanPhone) {
        params.push(cleanPhone);
        querySql += ` AND applicant_phone = $${params.length}`;
      }
    }

    querySql += ` LIMIT 1;`;
    const appRes = await client.query(querySql, params);

    if (appRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendJson(res, 404, { success: false, message: 'No matching partnership application found.' });
    }

    const app = appRes.rows[0];

    // Cannot cancel already approved/active reseller without admin support
    if (app.status === 'approved') {
      await client.query('ROLLBACK');
      return sendJson(res, 400, {
        success: false,
        message: 'Approved wholesale partners cannot be self-cancelled. Please contact support.'
      });
    }

    await client.query('UPDATE partner_applications SET status = $1 WHERE id = $2;', ['cancelled', app.id]);

    if (app.user_id) {
      await client.query('UPDATE users SET partner_status = $1 WHERE id = $2;', ['cancelled', app.user_id]);
    }

    await client.query('COMMIT');

    return sendJson(res, 200, {
      success: true,
      message: 'Wholesale partnership application cancelled successfully.'
    });

  } catch (e) {
    await client.query('ROLLBACK');
    return sendError(res, 500, 'Failed to cancel partnership application.', e);
  } finally {
    client.release();
  }
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
  }

  const action = req.query?.action || (req.url.split('?')[0].split('/').filter(Boolean).pop());
  const pool = getPool();

  try {
    if (action === 'cancel') {
      return await handleCancel(req, res, pool);
    } else {
      return await handleApply(req, res, pool);
    }
  } catch (error) {
    return sendError(res, 500, 'Partner operation failed.', error);
  }
};
