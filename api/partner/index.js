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
    const businessName = (data.businessName || data.storeName || data['business-name'] || data['bakery-name'] || '').trim();
    const businessType = normalizeBusinessType(data.businessType || data['business-type'] || data.type);
    const yearsInOp = (data.yearsInOperation || data.experience || data.years || '1-2 years').trim();
    const weeklyVol = (data.weeklyVolume || data.volume || '50-100 bundles').trim();
    const deliveryAddress = (data.address || data.deliveryAddress || '').trim();
    const products = Array.isArray(data.products) && data.products.length > 0 ? data.products : ['Mamon', 'Otap'];
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
            additional_notes = $8, user_id = COALESCE(user_id, $9), updated_at = NOW()
        WHERE id = $10;
      `, [
        applicantName, businessName, businessType,
        yearsInOp, weeklyVol,
        deliveryAddress, products, notes, userId, existing.id
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

    querySql += ` ORDER BY CASE WHEN status IN ('approved', 'under_review', 'pending') THEN 1 ELSE 2 END ASC, id DESC LIMIT 1;`;
    const appRes = await client.query(querySql, params);

    if (appRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendJson(res, 404, { success: false, message: 'No matching partnership application found.' });
    }

    const app = appRes.rows[0];

    let userTargetId = app.user_id;
    if (!userTargetId && cleanEmail) {
      const uRes = await client.query('SELECT id FROM users WHERE LOWER(email_address) = $1 LIMIT 1;', [cleanEmail]);
      if (uRes.rows.length > 0) userTargetId = uRes.rows[0].id;
    }

    const cancelTargetCode = app.application_code || cleanAppId || '';
    const cancelTargetEmail = (app.applicant_email || cleanEmail || '').toLowerCase();

    await client.query(`
      UPDATE partner_applications
      SET status = 'cancelled',
          admin_notes = COALESCE(admin_notes, '') || ' [Cancelled by customer]',
          reviewed_at = NOW(),
          updated_at = NOW()
      WHERE ((application_code IS NOT NULL AND application_code != '' AND application_code ILIKE $1)
          OR (applicant_email IS NOT NULL AND LOWER(applicant_email) = $2)
          OR (user_id IS NOT NULL AND user_id = $3))
        AND status NOT IN ('cancelled');
    `, [cancelTargetCode, cancelTargetEmail, userTargetId || 0]);

    if (userTargetId || cancelTargetEmail) {
      await client.query(`
        UPDATE users
        SET partner_status = 'cancelled',
            role_id = CASE WHEN role_id = 4 THEN 4 ELSE 1 END,
            updated_at = NOW()
        WHERE (id = $1 OR LOWER(email_address) = $2) AND role_id != 4;
      `, [userTargetId || 0, cancelTargetEmail]);
    }

    await client.query('COMMIT');

    return sendJson(res, 200, {
      success: true,
      message: 'Wholesale partnership application cancelled successfully.',
      appId: app.application_code || cleanAppId,
      status: 'cancelled'
    });

  } catch (e) {
    await client.query('ROLLBACK');
    return sendError(res, 500, 'Failed to cancel partnership application.', e);
  } finally {
    client.release();
  }
}

async function handleMyStatus(req, res, pool) {
  const session = readSession(req);
  const callerEmail = (req.headers['x-user-email'] || req.query?.email || session?.email || '').trim().toLowerCase();
  const callerCode = (req.query?.code || req.query?.appId || '').trim();
  const callerPhone = (req.query?.phone || req.query?.contact || '').trim().replace(/\D/g, '');

  if (!callerEmail && !callerCode && !callerPhone) {
    return sendJson(res, 400, { success: false, message: 'Authentication email, phone, or reference code is required.' });
  }

  try {
    let query = `
      SELECT id, application_code, applicant_name, applicant_email, applicant_phone, business_name,
             business_type, years_in_operation, estimated_weekly_volume, delivery_address,
             products_of_interest, additional_notes, status, admin_notes, submitted_at, updated_at, reviewed_at
      FROM partner_applications
      WHERE 1=1
    `;
    const params = [];
    if (callerCode && callerEmail) {
      params.push(callerCode, callerEmail);
      query += ` AND application_code ILIKE $1 AND (LOWER(applicant_email) = $2 OR applicant_phone = $2)`;
    } else if (callerCode && callerPhone) {
      params.push(callerCode, callerPhone);
      query += ` AND application_code ILIKE $1 AND applicant_phone = $2`;
    } else if (callerCode) {
      params.push(callerCode);
      query += ` AND application_code ILIKE $1`;
    } else if (callerEmail) {
      params.push(callerEmail);
      query += ` AND LOWER(applicant_email) = $1`;
    } else if (callerPhone) {
      params.push(callerPhone);
      query += ` AND applicant_phone = $1`;
    }
    query += ` ORDER BY updated_at DESC, id DESC LIMIT 1;`;

    const { rows } = await pool.query(query, params);
    if (rows.length === 0) {
      return sendJson(res, 404, { success: false, message: 'No partnership application found.' });
    }

    const app = rows[0];
    return sendJson(res, 200, {
      success: true,
      application: {
        applicationCode: app.application_code,
        applicantName: app.applicant_name,
        applicantEmail: app.applicant_email,
        applicantPhone: app.applicant_phone,
        businessName: app.business_name,
        businessType: app.business_type,
        yearsInOperation: app.years_in_operation,
        weeklyVolume: app.estimated_weekly_volume,
        deliveryAddress: app.delivery_address,
        products: app.products_of_interest || [],
        notes: app.additional_notes || '',
        status: app.status,
        adminNotes: app.admin_notes || '',
        staffNotes: app.admin_notes || '',
        submittedAt: app.submitted_at,
        updatedAt: app.updated_at,
        reviewedAt: app.reviewed_at
      }
    });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch partner status.', err);
  }
}

async function handleStatusPatch(req, res, pool) {
  const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
  let code = req.query?.code || '';
  if (!code && urlParts.length >= 2) {
    code = urlParts[urlParts.length - 2] === 'status' ? urlParts[urlParts.length - 3] : urlParts[urlParts.length - 2];
  }
  if (!code) code = urlParts[urlParts.length - 1] || '';

  let { status, staffNotes } = req.body || {};
  if (!status) return sendJson(res, 400, { success: false, message: 'Status is required.' });

  if (status === 'reviewing') status = 'under_review';
  if (status === 'declined') status = 'rejected';

  const allowedStatuses = ['under_review', 'approved', 'rejected', 'cancelled'];
  if (!allowedStatuses.includes(status)) {
    return sendJson(res, 400, { success: false, message: `Invalid status '${status}'.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appRes = await client.query('SELECT id, user_id, applicant_email FROM partner_applications WHERE application_code ILIKE $1 LIMIT 1;', [code.trim()]);
    if (appRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendJson(res, 404, { success: false, message: 'Application not found.' });
    }
    const app = appRes.rows[0];

    await client.query(`
      UPDATE partner_applications
      SET status = $1, admin_notes = COALESCE($2, admin_notes), reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $3;
    `, [status, staffNotes, app.id]);

    if (status === 'approved') {
      await client.query(`
        UPDATE users
        SET partner_status = 'active', role_id = CASE WHEN role_id = 4 THEN 4 ELSE 2 END, updated_at = NOW()
        WHERE id = $1 OR LOWER(email_address) = $2;
      `, [app.user_id || 0, (app.applicant_email || '').toLowerCase()]);
    } else if (status === 'rejected') {
      await client.query(`
        UPDATE users
        SET partner_status = 'rejected', role_id = CASE WHEN role_id = 4 THEN 4 ELSE 1 END, updated_at = NOW()
        WHERE id = $1 OR LOWER(email_address) = $2;
      `, [app.user_id || 0, (app.applicant_email || '').toLowerCase()]);
    } else if (status === 'under_review') {
      await client.query(`
        UPDATE users
        SET partner_status = 'under_review', role_id = CASE WHEN role_id = 4 THEN 4 ELSE 1 END, updated_at = NOW()
        WHERE id = $1 OR LOWER(email_address) = $2;
      `, [app.user_id || 0, (app.applicant_email || '').toLowerCase()]);
    } else if (status === 'cancelled') {
      await client.query(`
        UPDATE users
        SET partner_status = 'cancelled', role_id = CASE WHEN role_id = 4 THEN 4 ELSE 1 END, updated_at = NOW()
        WHERE (id = $1 OR LOWER(email_address) = $2) AND role_id != 4;
      `, [app.user_id || 0, (app.applicant_email || '').toLowerCase()]);
    }

    await client.query('COMMIT');

    return sendJson(res, 200, {
      success: true,
      message: `Application ${code} updated to ${status}.`,
      status
    });
  } catch (e) {
    await client.query('ROLLBACK');
    return sendError(res, 500, 'Failed to update partner application status.', e);
  } finally {
    client.release();
  }
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'GET, POST, PATCH, OPTIONS')) return;

  const action = req.query?.action || (req.url.split('?')[0].split('/').filter(Boolean).pop());
  const pool = getPool();

  if (req.method === 'GET' || action === 'my-status') {
    return await handleMyStatus(req, res, pool);
  }

  if (req.method === 'PATCH' || action === 'status') {
    return await handleStatusPatch(req, res, pool);
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
  }

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
