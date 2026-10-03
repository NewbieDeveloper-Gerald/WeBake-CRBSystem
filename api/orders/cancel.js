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
    const { orderId, email, refundDetails } = req.body || {};
    const cleanOrderId = (orderId || '').trim().toUpperCase();

    if (!cleanOrderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        'SELECT id, status FROM orders WHERE UPPER(order_code) = $1 LIMIT 1;',
        [cleanOrderId]
      );

      if (orderRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Order not found.' });
      }

      const order = orderRes.rows[0];
      const prevStatus = order.status;

      // Update status
      await client.query(
        `UPDATE orders SET status = 'cancellation_requested' WHERE id = $1;`,
        [order.id]
      );

      // Record in order status history
      const refundNotes = refundDetails
        ? `Customer requested cancellation. Refund method: ${refundDetails.wallet || 'E-Wallet'} (${refundDetails.accountNum || ''} - ${refundDetails.accountName || ''}). Reason: ${refundDetails.reason || 'Not specified'}.`
        : 'Customer requested order cancellation and downpayment refund.';

      await client.query(
        `INSERT INTO order_status_history (order_id, previous_status, new_status, notes)
         VALUES ($1, $2, 'cancellation_requested', $3);`,
        [order.id, prevStatus, refundNotes]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        message: 'Order cancellation and refund request recorded successfully.'
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Order Cancel Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record cancellation request: ' + error.message
    });
  }
};
