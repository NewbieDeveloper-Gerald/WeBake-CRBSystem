/**
 * ====================================================================
 * WeBake - Wholesale Partner Routes (Supabase PostgreSQL Backed)
 * Handles partner reseller applications and application tracking
 * ====================================================================
 */

const express = require('express');
const db = require('../database/db');

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

module.exports = router;
