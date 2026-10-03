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

async function handleApply(req, res, pool) {
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
      const existing = existingAppRes.rows[0];
      finalAppCode = existing.application_code;
      finalStatus = existing.status || 'pending';

      await client.query(`
        UPDATE partner_applications
        SET applicant_name = $1, business_name = $2, business_type = $3,
            years_in_operation = $4, estimated_weekly_volume = $5,
            delivery_address = $6, products_of_interest = $7,
            additional_notes = $8, updated_at = NOW()
        WHERE id = $9;
      `, [applicantName, businessName, businessType, yearsInOp, weeklyVol, deliveryAddress, products, notes, existing.id]);
    } else {
      await client.query(`
        INSERT INTO partner_applications (
          application_code, user_id, applicant_name, applicant_email, applicant_phone,
          business_name, business_type, years_in_operation, estimated_weekly_volume,
          delivery_address, products_of_interest, additional_notes, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending'
        );
      `, [
        applicationCode, userId, applicantName, applicantEmail, applicantPhone,
        businessName, businessType, yearsInOp, weeklyVol,
        deliveryAddress, products, notes
      ]);
    }

    // 3. Update user partner_status to pending in users table
    if (userId) {
      await client.query(`UPDATE users SET partner_status = 'pending' WHERE id = $1;`, [userId]);
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
    throw error;
  } finally {
    client.release();
  }
}

async function handleCancel(req, res, pool) {
  const { email, appId } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanEmail && !appId) {
    return res.status(400).json({ success: false, message: 'Email or Application ID is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
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
    console.error('[Partner Router Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Partner operation failed: ' + error.message
    });
  }
};
