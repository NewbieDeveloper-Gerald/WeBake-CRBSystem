const { createTransporter } = require('../_lib/mailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  try {
    const { order, hasAccount = false } = req.body || {};
    if (!order) return res.status(400).json({ success: false, message: 'Order data required' });

    const recipient = (order.customer?.email || '').trim().toLowerCase();
    if (!recipient) return res.status(400).json({ success: false, message: 'Customer email required' });

    const transporter = createTransporter();
    const fromAddress = process.env.GMAIL_USER || 'crbwebake@gmail.com';
    const orderId = order.orderId || 'WB-ORD';

    await transporter.sendMail({
      from: `"WeBake Bakery" <${fromAddress}>`,
      to: recipient,
      subject: `WeBake Order Confirmation & Receipt - ${orderId}`,
      text: `Thank you for your order with Crumbs N' Rolls Bakery! Order ID: ${orderId}. Total: PHP ${order.total || 0}. 50% Downpayment: PHP ${order.downpayment || 0}. Remaining Balance: PHP ${order.balance || 0}.`,
      html: `
        <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:20px; border:1px solid #ebd9c8; border-radius:10px; background:#fff;">
          <h2 style="color:#A0522D; text-align:center;">WeBake Order Confirmation</h2>
          <p>Thank you for choosing <strong>Crumbs N' Rolls Bakery</strong>! Your wholesale bread order has been successfully recorded.</p>
          <div style="background:#FAF6F0; padding:15px; border-radius:8px; margin:20px 0;">
            <p style="margin:5px 0;"><strong>Order ID:</strong> ${orderId}</p>
            <p style="margin:5px 0;"><strong>Total Value:</strong> &#8369;${(order.total || 0).toLocaleString()}</p>
            <p style="margin:5px 0; color:#28a745;"><strong>50% Downpayment Paid:</strong> &#8369;${(order.downpayment || 0).toLocaleString()} (${order.paymentMethod || 'GCash'})</p>
            <p style="margin:5px 0; color:#A0522D;"><strong>Remaining Balance Upon Delivery:</strong> &#8369;${(order.balance || 0).toLocaleString()}</p>
          </div>
          <p style="font-size:12px; color:#888; text-align:center;">1356 Cordero St., Lambakin, Marilao, Bulacan &bull; &copy; 2026 WeBake</p>
        </div>
      `
    });

    console.log(`[Vercel Serverless Receipt] Dispatched receipt for ${orderId} to ${recipient}`);
    return res.status(200).json({ success: true, message: 'Digital receipt dispatched successfully.' });

  } catch (error) {
    console.error('[Vercel Serverless Receipt Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to send receipt: ' + error.message });
  }
};
