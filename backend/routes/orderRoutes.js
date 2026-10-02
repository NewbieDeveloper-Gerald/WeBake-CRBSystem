/**
 * ====================================================================
 * WeBake - Order Routes
 * Handles transactional order confirmations and digital receipts
 * ====================================================================
 */

const express = require('express');
const { sendOrderReceiptEmail } = require('../services/mailer');

const router = express.Router();

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

/**
 * POST /api/orders/receipt
 * Dispatches an official digital receipt email to the customer
 */
router.post('/receipt', async (req, res) => {
  try {
    const { order, hasAccount } = req.body || {};

    if (!order) {
      return res.status(400).json({
        success: false,
        message: 'Order data is required.'
      });
    }

    const customerEmail = (order.customer?.email || '').trim().toLowerCase();
    if (!customerEmail || !isValidEmail(customerEmail)) {
      return res.status(400).json({
        success: false,
        message: 'A valid customer email is required to dispatch the digital receipt.'
      });
    }

    order.customer = order.customer || {};
    order.customer.email = customerEmail;

    const info = await sendOrderReceiptEmail({
      order: order,
      hasAccount: !!hasAccount
    });

    console.log(`[Order Receipt] Dispatched receipt for ${order.orderId || 'Order'} to ${customerEmail} [${hasAccount ? 'Account' : 'Guest'}] (Message ID: ${info.messageId})`);

    return res.status(200).json({
      success: true,
      message: 'Digital receipt dispatched successfully.',
      messageId: info.messageId
    });
  } catch (error) {
    console.error('[Order Receipt Error]:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to dispatch digital receipt.'
    });
  }
});

module.exports = router;
