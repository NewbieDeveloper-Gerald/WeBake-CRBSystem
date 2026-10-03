const { getPool } = require('../_lib/db');

function normalizeBusinessType(type) {
  const t = (type || '').toLowerCase().trim();
  if (t.includes('sari')) return 'sari_sari';
  if (t.includes('cafe') || t.includes('coffee')) return 'cafe';
  if (t.includes('direct')) return 'direct_selling';
  if (t.includes('online')) return 'online_shop';
  if (t.includes('bakery')) return 'bakery';
  return 'other';
}

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
  const client = await pool.connect();

  try {
    const data = req.body || {};

    const applicantName = (data.fullName || data.name || '').trim();
    const applicantEmail = (data.email || '').trim().toLowerCase();
    const applicantPhone = (data.phone || data.contact || '').trim();
    const businessName = (data.businessName || data.storeName || '').trim();
    const businessType = normalizeBusinessType(data.businessType);
    const yearsInOp = data.yearsInOperation || data.experience || '1-2 years';
    const weeklyVol = data.weeklyVolume || '50-100 bundles';
    const deliveryAddress = (data.address || 'Marilao, Bulacan').trim();
    const products = Array.isArray(data.products) ? data.products : ['Mamon', 'Otap'];
    const notes = data.notes || '';
    const applicationCode = `WB-PRT-${Math.floor(10000 + Math.random() * 90000)}`;

    if (!applicantName || !applicantEmail || !applicantPhone || !businessName) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email address, contact number, and business name are required.'
      });
    }

    await client.query('BEGIN');

    // 1. Check if applicant is an existing user
    let userId = null;
    const userRes = await client.query('SELECT id FROM users WHERE LOWER(email_address) = $1;', [applicantEmail]);
    if (userRes.rows.length > 0) {
      userId = userRes.rows[0].id;
    }

    // 2. Check if active application already exists for this email
    const existingAppRes = await client.query(
      `SELECT id, application_code, status FROM partner_applications
       WHERE (LOWER(applicant_email) = $1 OR applicant_phone = $2) AND status NOT IN ('cancelled', 'rejected')
       ORDER BY id DESC LIMIT 1;`,
      [applicantEmail, applicantPhone]
    );

    let finalAppCode = applicationCode;
    let finalStatus = 'pending';

    if (existingAppRes.rows.length > 0) {
      // Update existing application
      const existing = existingAppRes.rows[0];
      finalAppCode = existing.application_code;
      finalStatus = existing.status;

      await client.query(`
        UPDATE partner_applications
        SET applicant_name = $1, business_name = $2, business_type = $3,
            years_in_operation = $4, estimated_weekly_volume = $5, delivery_address = $6,
            products_of_interest = $7, additional_notes = $8, updated_at = NOW()
        WHERE id = $9;
      `, [applicantName, businessName, businessType, yearsInOp, weeklyVol, deliveryAddress, products, notes, existing.id]);
    } else {
      // Insert new application
      const insertSql = `
        INSERT INTO partner_applications (
          application_code, user_id, applicant_name, applicant_email, applicant_phone,
          business_name, business_type, years_in_operation, estimated_weekly_volume,
          delivery_address, products_of_interest, additional_notes, agreed_to_terms, status,
          submitted_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, 'pending', NOW(), NOW())
        RETURNING id, application_code, status, submitted_at;
      `;
      const insertRes = await client.query(insertSql, [
        applicationCode, userId, applicantName, applicantEmail, applicantPhone,
        businessName, businessType, yearsInOp, weeklyVol, deliveryAddress,
        products, notes
      ]);
      finalAppCode = insertRes.rows[0].application_code;
      finalStatus = insertRes.rows[0].status;
    }

    // 3. Update users.partner_status
    if (userId) {
      await client.query(`UPDATE users SET partner_status = $1, updated_at = NOW() WHERE id = $2;`, [finalStatus, userId]);
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Wholesale partner application submitted successfully.',
      applicationCode: finalAppCode,
      status: finalStatus
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Vercel Partner Apply Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit partner application: ' + error.message
    });
  } finally {
    client.release();
  }
};
