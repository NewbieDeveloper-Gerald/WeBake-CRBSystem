const { getPool } = require('../_lib/db');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const pool = getPool();

  try {
    const id = (req.method === 'GET' ? req.query?.id : req.body?.id) || '';
    const contact = (req.method === 'GET' ? req.query?.contact : req.body?.contact) || '';
    const mode = (req.method === 'GET' ? req.query?.mode : req.body?.mode) || '';

    const cleanId = id.trim().toUpperCase();
    const cleanContact = contact.trim().toLowerCase();

    if (!cleanId) {
      return res.status(400).json({ success: false, message: 'Tracking Reference ID is required.' });
    }

    const isPartner = mode === 'partner' || cleanId.includes('PRT');

    if (isPartner) {
      // Query partner_applications
      const pRes = await pool.query(`
        SELECT application_code, applicant_name, applicant_email, applicant_phone,
               business_name, business_type, years_in_operation, estimated_weekly_volume,
               delivery_address, products_of_interest, additional_notes, status, created_at
        FROM partner_applications
        WHERE UPPER(application_code) = $1
           OR (LOWER(applicant_email) = $2 OR applicant_phone = $3)
        ORDER BY id DESC LIMIT 1;
      `, [cleanId, cleanContact, cleanContact.replace(/\D/g, '')]);

      if (pRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'No matching wholesale partnership application found.' });
      }

      const p = pRes.rows[0];
      return res.status(200).json({
        success: true,
        type: 'partner',
        partner: {
          appId: p.application_code,
          email: p.applicant_email,
          phone: p.applicant_phone,
          status: p.status,
          date: new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          details: {
            'owner-name': p.applicant_name,
            'business-name': p.business_name,
            'business-type': p.business_type,
            email: p.applicant_email,
            phone: p.applicant_phone,
            years: p.years_in_operation,
            volume: p.estimated_weekly_volume,
            address: p.delivery_address,
            products: p.products_of_interest || [],
            notes: p.additional_notes || ''
          }
        }
      });
    } else {
      // Query orders
      const oRes = await pool.query(`
        SELECT id, order_code, customer_name, customer_email, customer_contact,
               delivery_address, delivery_date, delivery_time, special_notes,
               subtotal_amount, delivery_fee, grand_total, downpayment_required,
               downpayment_paid, balance_due, payment_method, status, created_at
        FROM orders
        WHERE UPPER(order_code) = $1
        LIMIT 1;
      `, [cleanId]);

      if (oRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'No matching order found for this tracking ID.' });
      }

      const o = oRes.rows[0];

      // Query order items
      const itemsRes = await pool.query(`
        SELECT product_name, pieces_per_bundle, unit_price, quantity, total_price
        FROM order_items
        WHERE order_id = $1
        ORDER BY id ASC;
      `, [o.id]);

      const items = itemsRes.rows.map(it => ({
        name: it.product_name,
        pieces: it.pieces_per_bundle,
        price: parseFloat(it.unit_price),
        qty: it.quantity,
        total: parseFloat(it.total_price)
      }));

      // Query downpayment payment reference
      const payRes = await pool.query(`
        SELECT reference_number, payment_channel
        FROM payments
        WHERE order_id = $1
        ORDER BY id DESC LIMIT 1;
      `, [o.id]);
      const refNo = payRes.rows[0]?.reference_number || '';

      return res.status(200).json({
        success: true,
        type: 'order',
        order: {
          orderId: o.order_code,
          date: new Date(o.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          total: parseFloat(o.grand_total),
          downpayment: parseFloat(o.downpayment_required),
          balance: parseFloat(o.balance_due),
          paymentMethod: o.payment_method,
          referenceNumber: refNo,
          status: o.status,
          customer: {
            name: o.customer_name,
            email: o.customer_email,
            contact: o.customer_contact,
            address: o.delivery_address,
            deliveryDate: o.delivery_date,
            deliveryTime: o.delivery_time,
            notes: o.special_notes
          },
          items: items
        }
      });
    }

  } catch (error) {
    console.error('[Track Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to look up tracking details: ' + error.message
    });
  }
};
