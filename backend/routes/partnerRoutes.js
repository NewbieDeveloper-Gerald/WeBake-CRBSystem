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

    // Check if active application already exists
    const existingRes = await db.query(
      `SELECT id, application_code, status FROM partner_applications 
       WHERE (user_id = $1 OR LOWER(applicant_email) = $2 OR applicant_phone = $3)
         AND status NOT IN ('cancelled', 'rejected')
       ORDER BY id DESC LIMIT 1;`,
      [userId || 0, applicantEmail, applicantPhone]
    );

    let applicationCode = null;
    let status = 'pending';

    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      applicationCode = existing.application_code;
      status = existing.status;
      await db.query(`
        UPDATE partner_applications
        SET applicant_name = $1, business_name = $2, business_type = $3,
            years_in_operation = $4, estimated_weekly_volume = $5,
            delivery_address = $6, products_of_interest = $7,
            additional_notes = $8, user_id = COALESCE(user_id, $9), updated_at = NOW()
        WHERE id = $10;
      `, [
        applicantName, businessName, businessType, yearsInOp, weeklyVol,
        deliveryAddress, products, notes, userId, existing.id
      ]);
    } else {
      applicationCode = `WB-PRT-${Math.floor(10000 + Math.random() * 90000)}`;
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
    }

    // Also update users.partner_status if user exists and not approved
    if (userId) {
      await db.query(`UPDATE users SET partner_status = $1 WHERE id = $2 AND partner_status NOT IN ('active', 'approved');`, [status, userId]);
    }

    return res.status(201).json({
      success: true,
      message: 'Wholesale partner application submitted successfully.',
      applicationCode: applicationCode,
      status: status
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
        discountRate: r.status === 'approved' ? 15 : 0,
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
 * PATCH /api/partner/:code/status
 * Updates reseller application status and synchronizes user role/status
 */
router.patch('/:code/status', async (req, res) => {
  const client = await db.getClient();
  try {
    const { code } = req.params;
    const { status, staffNotes } = req.body || {};

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required.' });
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
    } else if (status === 'pending' || status === 'under_review') {
      await client.query(`
        UPDATE users
        SET partner_status = 'pending', role_id = 1, updated_at = NOW()
        WHERE id = $1 OR LOWER(email_address) = $2;
      `, [app.user_id || 0, (app.applicant_email || '').toLowerCase()]);
    }

    await client.query('COMMIT');

    // Trigger transactional email notification asynchronously
    if (app.applicant_email && (status === 'approved' || status === 'rejected')) {
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

module.exports = router;
