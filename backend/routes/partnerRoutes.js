/**
 * ====================================================================
 * WeBake - Wholesale Partner Routes (Supabase PostgreSQL Backed)
 * Handles partner reseller applications and application tracking
 * ====================================================================
 */

const express = require('express');
const db = require('../database/db');
const { sendPartnerStatusEmail } = require('../services/mailer');

const router = express.Router();

function normalizeBusinessType(type) {
  const t = (type || '').toLowerCase().trim();
  if (t.includes('sari')) return 'sari_sari';
  if (t.includes('cafe') || t.includes('coffee')) return 'cafe';
  if (t.includes('direct')) return 'direct_selling';
  if (t.includes('online')) return 'online_shop';
  if (t.includes('bakery')) return 'bakery';
  return 'other';
}

/**
 * POST /api/partner/apply
 * Submits and persists wholesale partner application into Supabase
 */
router.post('/apply', async (req, res) => {
  try {
    const data = req.body || {};

    const applicantName = (data.fullName || data.name || '').trim();
    const applicantEmail = (data.email || '').trim().toLowerCase();
    const applicantPhone = (data.phone || data.contact || '').trim().replace(/\D/g, '');
    const businessName = (data.businessName || data.storeName || data['business-name'] || data['bakery-name'] || '').trim();
    const businessType = normalizeBusinessType(data.businessType || data['business-type'] || data.type);
    const yearsInOp = data.yearsInOperation || data.experience || data.years || '1-2 years';
    const weeklyVol = data.weeklyVolume || data.volume || '50-100 bundles';
    const deliveryAddress = (data.address || 'Marilao, Bulacan').trim();
    const products = Array.isArray(data.products) && data.products.length > 0 ? data.products : ['Mamon', 'Otap'];
    const notes = data.notes || '';

    if (!applicantName || !applicantEmail || !applicantPhone || !businessName) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone number, and business name are required.'
      });
    }

    // Check if applicant is an existing user
    let userId = null;
    const userRes = await db.query('SELECT id FROM users WHERE LOWER(email_address) = $1;', [applicantEmail]);
    if (userRes.rows.length > 0) {
      userId = userRes.rows[0].id;
    }

    // Check if active application already exists (pending, under_review, approved)
    const existingRes = await db.query(
      `SELECT id, application_code, status FROM partner_applications 
       WHERE (user_id = $1 OR LOWER(applicant_email) = $2 OR applicant_phone = $3)
         AND status NOT IN ('cancelled', 'rejected')
       ORDER BY id DESC LIMIT 1;`,
      [userId || 0, applicantEmail, applicantPhone]
    );

    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      return res.status(409).json({
        success: false,
        message: `You already have an active partnership application (${existing.application_code}) with status '${existing.status}'. A customer may only have one active application at a time.`,
        applicationCode: existing.application_code,
        status: existing.status
      });
    }

    const applicationCode = `WB-PRT-${Math.floor(10000 + Math.random() * 90000)}`;
    const insertSql = `
      INSERT INTO partner_applications (
        application_code, user_id, applicant_name, applicant_email, applicant_phone,
        business_name, business_type, years_in_operation, estimated_weekly_volume,
        delivery_address, products_of_interest, additional_notes, agreed_to_terms, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, 'pending');
    `;
    await db.query(insertSql, [
      applicationCode, userId, applicantName, applicantEmail, applicantPhone,
      businessName, businessType, yearsInOp, weeklyVol, deliveryAddress,
      products, notes
    ]);

    // Update users.partner_status if user exists
    if (userId) {
      await db.query(`UPDATE users SET partner_status = 'pending' WHERE id = $1;`, [userId]);
    }

    return res.status(201).json({
      success: true,
      message: 'Wholesale partner application submitted successfully.',
      applicationCode: applicationCode,
      status: 'pending'
    });
  } catch (error) {
    console.error('[Partner Apply Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit partner application.',
      error: error.message
    });
  }
});

/**
 * GET /api/partner/my-status
 * Returns caller's own application status for polling on customer dashboard & tracking
 */
router.get('/my-status', async (req, res) => {
  try {
    const callerEmail = (req.headers['x-user-email'] || req.query.email || '').trim().toLowerCase();
    const callerCode = (req.query.code || req.query.appId || '').trim();

    if (!callerEmail && !callerCode) {
      return res.status(400).json({
        success: false,
        message: 'Authentication email or reference code is required.'
      });
    }

    let query = `
      SELECT id, application_code, applicant_name, applicant_email, business_name,
             business_type, status, admin_notes, submitted_at, updated_at, reviewed_at
      FROM partner_applications
      WHERE 1=1
    `;
    const params = [];

    if (callerCode && callerEmail) {
      // Guest or explicit reference code + verified email verification
      params.push(callerCode, callerEmail);
      query += ` AND application_code ILIKE $1 AND LOWER(applicant_email) = $2`;
    } else if (callerEmail) {
      // Logged-in session email lookup
      params.push(callerEmail);
      query += ` AND LOWER(applicant_email) = $1`;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Verified email is required to access application status.'
      });
    }

    query += ` ORDER BY updated_at DESC, id DESC LIMIT 1;`;

    const { rows } = await db.query(query, params);
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No partnership application found.'
      });
    }

    const app = rows[0];
    return res.json({
      success: true,
      application: {
        applicationCode: app.application_code,
        status: app.status,
        adminNotes: app.admin_notes || '',
        staffNotes: app.admin_notes || '',
        businessName: app.business_name,
        applicantName: app.applicant_name,
        submittedAt: app.submitted_at,
        updatedAt: app.updated_at,
        reviewedAt: app.reviewed_at
      }
    });
  } catch (error) {
    console.error('[Partner My-Status Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve application status.',
      error: error.message
    });
  }
});

/**
 * GET /api/partner/track/:code
 * Looks up partner application status by code
 */
router.get('/track/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { rows } = await db.query(`
      SELECT application_code, applicant_name, applicant_email, business_name,
             business_type, status, admin_notes, submitted_at, reviewed_at
      FROM partner_applications
      WHERE application_code ILIKE $1;
    `, [code.trim()]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Application code ${code} not found.`
      });
    }

    return res.json({
      success: true,
      application: rows[0]
    });
  } catch (error) {
    console.error('[Partner Track Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to look up application.',
      error: error.message
    });
  }
});

/**
 * GET /api/partner/all
 * Retrieves all wholesale reseller applications for Admin Partners Board
 */
router.get('/all', async (req, res) => {
  try {
    const q = `
      SELECT 
        id, application_code, user_id, applicant_name, applicant_email, applicant_phone,
        business_name, business_type, years_in_operation, estimated_weekly_volume,
        delivery_address, products_of_interest, additional_notes, status,
        admin_notes, submitted_at, reviewed_at, updated_at
      FROM partner_applications
      ORDER BY submitted_at DESC;
    `;
    const { rows } = await db.query(q);
    return res.json({
      success: true,
      count: rows.length,
      partners: rows.map(r => ({
        id: r.id,
        appId: r.application_code,
        businessName: r.business_name,
        businessType: r.business_type,
        fullName: r.applicant_name,
        email: r.applicant_email,
        phone: r.applicant_phone,
        address: r.delivery_address,
        weeklyVolume: r.estimated_weekly_volume,
        products: r.products_of_interest,
        notes: r.additional_notes,
        status: r.status,
        staffNotes: r.admin_notes || '',
        date: new Date(r.submitted_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        details: {
          'business-name': r.business_name,
          'business-type': r.business_type,
          'owner-name': r.applicant_name,
          phone: r.applicant_phone,
          email: r.applicant_email,
          address: r.delivery_address,
          volume: r.estimated_weekly_volume
        }
      }))
    });
  } catch (err) {
    console.error('[Admin Partners Query Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve partners.', error: err.message });
  }
});

/**
 * PATCH /api/partner/:code
 * Updates details of an existing pending application by the applicant
 * Enforces:
 *   - Only status === 'pending' allowed (returns 403 otherwise)
 *   - Caller must be the verified owner
 *   - Email and application code are immutable
 */
router.patch('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const cleanCode = (code || '').trim();
    const data = req.body || {};

    if (!cleanCode) {
      return res.status(400).json({ success: false, message: 'Application code is required.' });
    }

    // 1. Fetch application
    const appRes = await db.query(`
      SELECT id, application_code, user_id, applicant_name, applicant_email, applicant_phone,
             business_name, business_type, years_in_operation, estimated_weekly_volume,
             delivery_address, products_of_interest, additional_notes, status
      FROM partner_applications
      WHERE application_code ILIKE $1;
    `, [cleanCode]);

    if (appRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Application ${cleanCode} not found.` });
    }

    const app = appRes.rows[0];

    // 2. Enforce status rule: only 'pending' may be edited
    if (app.status !== 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Editing is locked while your application is being reviewed. Only applications in Pending status can be edited.',
        currentStatus: app.status
      });
    }

    // 3. Ownership verification
    const callerEmail = (req.headers['x-user-email'] || data.email || '').trim().toLowerCase();
    const callerUserId = data.userId || null;
    const isOwner = (callerEmail && callerEmail === (app.applicant_email || '').toLowerCase()) ||
                    (app.user_id && callerUserId && Number(callerUserId) === Number(app.user_id));

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You may only edit your own partnership application.'
      });
    }

    // 4. Extract and validate editable fields
    const businessName = (data.businessName || data['business-name'] || data['bakery-name'] || app.business_name || '').trim();
    const applicantName = (data.fullName || data.name || data['owner-name'] || app.applicant_name || '').trim();
    const rawType = data.businessType || data['business-type'] || data.type || app.business_type;
    const businessType = normalizeBusinessType(rawType);
    const yearsInOp = data.yearsInOperation || data.experience || data.years || app.years_in_operation;
    const weeklyVol = data.weeklyVolume || data.volume || app.estimated_weekly_volume;
    const deliveryAddress = (data.address || data.deliveryAddress || app.delivery_address || '').trim();
    const products = Array.isArray(data.products) && data.products.length > 0 ? data.products : app.products_of_interest;
    const notes = data.notes !== undefined ? data.notes : (data.additionalNotes !== undefined ? data.additionalNotes : app.additional_notes);

    let cleanPhone = app.applicant_phone;
    if (data.phone || data.contact) {
      const p = String(data.phone || data.contact).replace(/\D/g, '');
      if (p.length !== 11 || !p.startsWith('09')) {
        return res.status(400).json({ success: false, message: 'Contact number must be 11 digits starting with 09.' });
      }
      cleanPhone = p;
    }

    if (!businessName || !applicantName) {
      return res.status(400).json({ success: false, message: 'Business name and applicant name cannot be empty.' });
    }

    // 5. Update database (applicant_email and application_code remain untouched)
    await db.query(`
      UPDATE partner_applications
      SET business_name = $1,
          applicant_name = $2,
          business_type = $3,
          years_in_operation = $4,
          estimated_weekly_volume = $5,
          delivery_address = $6,
          products_of_interest = $7,
          additional_notes = $8,
          applicant_phone = $9,
          updated_at = NOW()
      WHERE id = $10;
    `, [
      businessName, applicantName, businessType, yearsInOp, weeklyVol,
      deliveryAddress, products, notes, cleanPhone, app.id
    ]);

    return res.json({
      success: true,
      message: 'Application updated successfully.',
      applicationCode: app.application_code,
      status: 'pending'
    });
  } catch (error) {
    console.error('[Partner Edit Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update application.',
      error: error.message
    });
  }
});

/**
 * PATCH /api/partner/:code/status
 * Updates reseller application status and synchronizes user role/status (Admin Only)
 */
router.patch('/:code/status', async (req, res) => {
  const client = await db.getClient();
  try {
    const { code } = req.params;
    let { status, staffNotes } = req.body || {};

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required.' });
    }

    // Standardize status values
    if (status === 'reviewing') status = 'under_review';
    if (status === 'declined') status = 'rejected';

    const allowedStatuses = ['under_review', 'approved', 'rejected', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status '${status}'. Allowed statuses: ${allowedStatuses.join(', ')}.`
      });
    }

    // Role check: Only admin/owner/staff can change application status
    const callerEmail = (req.headers['x-user-email'] || req.body.adminEmail || '').trim().toLowerCase();
    const adminRoleHeader = (req.headers['x-admin-role'] || '').trim().toLowerCase();

    const recognizedAdmins = [
      (process.env.GMAIL_USER || 'crbwebake@gmail.com').toLowerCase(),
      'crbwebake@gmail.com',
      'geraldvelasco550@gmail.com'
    ];

    const isRecognizedAdmin = recognizedAdmins.includes(callerEmail) ||
                              adminRoleHeader === 'owner' ||
                              adminRoleHeader === 'admin' ||
                              adminRoleHeader === 'staff';

    if (callerEmail && !isRecognizedAdmin) {
      const adminCheck = await client.query('SELECT role_id FROM users WHERE LOWER(email_address) = $1 LIMIT 1;', [callerEmail]);
      if (adminCheck.rows.length > 0 && adminCheck.rows[0].role_id !== 3 && adminCheck.rows[0].role_id !== 4) {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access required.' });
      }
    }

    await client.query('BEGIN');
    const appRes = await client.query(`
      SELECT id, user_id, applicant_name, applicant_email, business_name, status FROM partner_applications
      WHERE application_code = $1;
    `, [code.trim()]);

    if (appRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }
    const app = appRes.rows[0];

    await client.query(`
      UPDATE partner_applications
      SET status = $1, admin_notes = COALESCE($2, admin_notes), reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $3;
    `, [status, staffNotes, app.id]);

    // Synchronize user role and partner_status in users table
    if (status === 'approved') {
      await client.query(`
        UPDATE users
        SET partner_status = 'active', role_id = 2, updated_at = NOW()
        WHERE id = $1 OR LOWER(email_address) = $2;
      `, [app.user_id || 0, (app.applicant_email || '').toLowerCase()]);
    } else if (status === 'rejected') {
      await client.query(`
        UPDATE users
        SET partner_status = 'rejected', role_id = 1, updated_at = NOW()
        WHERE id = $1 OR LOWER(email_address) = $2;
      `, [app.user_id || 0, (app.applicant_email || '').toLowerCase()]);
    } else if (status === 'under_review') {
      await client.query(`
        UPDATE users
        SET partner_status = 'under_review', role_id = 1, updated_at = NOW()
        WHERE id = $1 OR LOWER(email_address) = $2;
      `, [app.user_id || 0, (app.applicant_email || '').toLowerCase()]);
    } else if (status === 'cancelled') {
      await client.query(`
        UPDATE users
        SET partner_status = 'cancelled', role_id = 1, updated_at = NOW()
        WHERE (id = $1 OR LOWER(email_address) = $2) AND role_id != 4;
      `, [app.user_id || 0, (app.applicant_email || '').toLowerCase()]);
    }

    await client.query('COMMIT');

    // Trigger transactional email notification asynchronously
    if (app.applicant_email) {
      sendPartnerStatusEmail({
        applicantName: app.applicant_name,
        applicantEmail: app.applicant_email,
        applicationCode: code.trim(),
        businessName: app.business_name,
        status: status,
        staffNotes: staffNotes || ''
      }).then(info => {
        console.log(`[Partner Email] Sent ${status} notification to ${app.applicant_email} (MsgID: ${info?.messageId})`);
      }).catch(err => {
        console.warn(`[Partner Email Warning] Failed to send email to ${app.applicant_email}:`, err.message);
      });
    }

    return res.json({
      success: true,
      message: `Application ${code} updated to ${status}. Notification sent to applicant.`,
      status
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Update Partner Application Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to update application.', error: err.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/partner/cancel
 * Cancels a wholesale partner application or active partnership by customer or guest
 */
router.post('/cancel', async (req, res) => {
  const client = await db.getClient();
  try {
    const { email, appId, reason } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanAppId = (appId || '').trim();

    if (!cleanEmail && !cleanAppId) {
      return res.status(400).json({
        success: false,
        message: 'Email address or Application ID is required to cancel partnership.'
      });
    }

    await client.query('BEGIN');

    // 1. Locate partner application
    let query = `
      SELECT id, application_code, user_id, applicant_name, applicant_email, business_name, status
      FROM partner_applications
      WHERE 1=1
    `;
    const params = [];
    if (cleanAppId && cleanEmail) {
      params.push(cleanAppId, cleanEmail);
      query += ` AND (application_code ILIKE $1 OR LOWER(applicant_email) = $2)`;
    } else if (cleanAppId) {
      params.push(cleanAppId);
      query += ` AND application_code ILIKE $1`;
    } else {
      params.push(cleanEmail);
      query += ` AND LOWER(applicant_email) = $1`;
    }
    // Prioritize active, approved, or pending applications over already finished ones
    query += ` ORDER BY CASE WHEN status IN ('approved', 'under_review', 'pending') THEN 1 ELSE 2 END ASC, id DESC LIMIT 1;`;

    const appRes = await client.query(query, params);

    let app = null;
    const cancelNote = reason ? ` [Cancelled by customer: ${reason}]` : ' [Cancelled by customer]';

    if (appRes.rows.length > 0) {
      app = appRes.rows[0];
    }

    const userTargetEmail = (cleanEmail || (app ? app.applicant_email : '')).trim().toLowerCase();
    let userTargetId = app ? app.user_id : null;
    if (!userTargetId && userTargetEmail) {
      const uRes = await client.query('SELECT id FROM users WHERE LOWER(email_address) = $1 LIMIT 1;', [userTargetEmail]);
      if (uRes.rows.length > 0) userTargetId = uRes.rows[0].id;
    }
    const targetAppCode = cleanAppId || (app ? app.application_code : '');

    // Cancel all matching applications for this applicant/code
    await client.query(`
      UPDATE partner_applications
      SET status = 'cancelled',
          admin_notes = COALESCE(admin_notes, '') || $1,
          reviewed_at = NOW(),
          updated_at = NOW()
      WHERE ((application_code IS NOT NULL AND application_code != '' AND application_code ILIKE $2)
          OR (applicant_email IS NOT NULL AND LOWER(applicant_email) = $3)
          OR (user_id IS NOT NULL AND user_id = $4))
        AND status NOT IN ('cancelled');
    `, [cancelNote, targetAppCode, userTargetEmail, userTargetId || 0]);

    // 2. Synchronize user in users table
    if (userTargetEmail || userTargetId) {
      await client.query(`
        UPDATE users
        SET partner_status = 'cancelled',
            role_id = CASE WHEN role_id = 4 THEN 4 ELSE 1 END,
            updated_at = NOW()
        WHERE (id = $1 OR LOWER(email_address) = $2) AND role_id != 4;
      `, [userTargetId || 0, userTargetEmail]);
    }

    await client.query('COMMIT');

    // Trigger transactional cancellation confirmation email asynchronously
    const targetEmail = (app && app.applicant_email) || cleanEmail;
    if (targetEmail) {
      sendPartnerStatusEmail({
        applicantName: (app && app.applicant_name) || 'Customer',
        applicantEmail: targetEmail,
        applicationCode: (app && app.application_code) || cleanAppId || 'WB-PRT',
        businessName: (app && app.business_name) || '',
        status: 'cancelled',
        staffNotes: reason || 'Customer requested partnership cancellation.'
      }).then(info => {
        console.log(`[Partner Email] Sent cancellation notice to ${targetEmail} (MsgID: ${info?.messageId})`);
      }).catch(err => {
        console.warn(`[Partner Email Warning] Failed to send cancel notice:`, err.message);
      });
    }

    return res.json({
      success: true,
      message: 'Partnership request cancelled successfully.',
      appId: app ? app.application_code : cleanAppId,
      status: 'cancelled'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Partner Cancel Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel partnership.',
      error: error.message
    });
  } finally {
    client.release();
  }
});

module.exports = router;
