/**
 * ====================================================================
 * WeBake - Mailer Service (Nodemailer + Gmail)
 * Minimalist, elegant transactional email templates for CRB
 * ====================================================================
 */

const nodemailer = require('nodemailer');

function createTransporter() {
  const user = process.env.GMAIL_USER || 'crbwebake@gmail.com';
  const pass = (process.env.GMAIL_APP_PASS || '').replace(/\s+/g, '');

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user,
      pass: pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Builds the minimalist HTML template for OTP verification
 */
function buildOtpEmailHtml({ otp, purpose }) {
  let purposeTitle = 'Email Verification';
  let purposeText = 'Please enter the 6-digit verification code below to verify your email address.';

  if (purpose === 'register' || purpose === 'registration') {
    purposeTitle = 'Welcome to WeBake!';
    purposeText = 'Thank you for registering. Please enter the verification code below to activate your wholesale account:';
  } else if (purpose === 'checkout' || purpose === 'checkout_verification') {
    purposeTitle = 'Confirm Your Order';
    purposeText = 'Thank you for choosing Crumbs N\' Rolls Bakery. Please verify your email address to confirm your bread order:';
  } else if (purpose === 'forgot' || purpose === 'forgot_password') {
    purposeTitle = 'Password Reset Request';
    purposeText = 'A password reset was requested for your WeBake account. Use this one-time verification code to proceed:';
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WeBake Verification Code</title>
</head>
<body style="margin:0; padding:0; background-color:#F5EFE6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5EFE6; padding:40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px; background-color:#FFFFFF; border-radius:12px; overflow:hidden; border:1px solid #E6D7C8; box-shadow:0 4px 20px rgba(74,46,36,0.06);">
          
          <!-- Brand Header -->
          <tr>
            <td style="padding:32px 32px 24px; text-align:center; background-color:#FAF6F0; border-bottom:1px solid #EEDBCE;">
              <span style="display:inline-block; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#B5523A; margin-bottom:8px;">
                Wholesale Bakery Since 2010
              </span>
              <div style="font-size:26px; font-weight:800; color:#4A2E24; letter-spacing:-0.5px;">
                We<span style="color:#B5523A;">Bake</span>
              </div>
              <div style="font-size:13px; color:#7A685D; margin-top:2px;">
                Crumbs N' Rolls Bakery
              </div>
            </td>
          </tr>

          <!-- Email Body -->
          <tr>
            <td style="padding:36px 32px 28px; text-align:center;">
              <h2 style="margin:0 0 12px; font-size:20px; font-weight:700; color:#2E1A14;">
                ${purposeTitle}
              </h2>
              <p style="margin:0 0 28px; font-size:14px; line-height:1.6; color:#6B584E; max-width:380px; margin-left:auto; margin-right:auto;">
                ${purposeText}
              </p>

              <!-- OTP Code Display Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block; padding:16px 28px; background-color:#FAF6F0; border:2px dashed #D9BFAB; border-radius:10px;">
                      <span style="font-family:'Courier New', Courier, monospace; font-size:34px; font-weight:800; letter-spacing:10px; color:#4A2E24; display:block; padding-left:10px;">
                        ${otp}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Information Strip -->
              <div style="background-color:#FFF8F0; border-radius:8px; padding:12px 16px; margin-bottom:20px; border-left:3px solid #B5523A; text-align:left;">
                <p style="margin:0; font-size:12.5px; color:#855038; line-height:1.5;">
                  <strong>⏳ Expires in 5 minutes.</strong> For your protection, never share this code with anyone. Crumbs N' Rolls Bakery will never ask for your verification code.
                </p>
              </div>

              <p style="margin:0; font-size:12px; color:#9E8B80; line-height:1.5;">
                If you did not initiate this request, you can safely ignore this email. No changes will be made to your account.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px; background-color:#FAF6F0; border-top:1px solid #EEDBCE; text-align:center;">
              <p style="margin:0 0 4px; font-size:12px; font-weight:600; color:#5A433A;">
                Crumbs N' Rolls Bakery
              </p>
              <p style="margin:0; font-size:11.5px; color:#8C776D; line-height:1.5;">
                1356 Cordero St., Lambakin, Marilao, Bulacan<br>
                &copy; 2026 WeBake. All Rights Reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Sends real OTP email via Gmail
 */
async function sendOtpEmail({ email, otp, purpose }) {
  const fromAddress = process.env.GMAIL_USER || 'crbwebake@gmail.com';
  const appPass = (process.env.GMAIL_APP_PASS || '').replace(/\s+/g, '');

  if (!appPass || appPass === 'your_16_digit_app_password_here') {
    throw new Error(
      'GMAIL_APP_PASS is not configured in backend/.env. Please generate a 16-character App Password from your Google Account (Security -> 2-Step Verification -> App Passwords).'
    );
  }

  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from: `"WeBake — Crumbs N' Rolls Bakery" <${fromAddress}>`,
    to: email,
    subject: `${otp} is your WeBake verification code`,
    text: `Your WeBake verification code is: ${otp}. This code will expire in 5 minutes.`,
    html: buildOtpEmailHtml({ otp, purpose })
  });

  return info;
}

/**
 * Builds the minimalist, elegant HTML digital receipt for WeBake orders
 */
function buildOrderReceiptHtml(order, hasAccount = false) {
  const orderId = order.orderId || 'WB-ORD';
  const date = order.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const customer = order.customer || {};
  const custName = customer.name || 'Valued Customer';
  const custContact = customer.contact || 'N/A';
  const custAddress = customer.address || 'N/A';

  const items = Array.isArray(order.items) ? order.items : [];
  const total = order.total || 0;
  const downpayment = order.downpayment !== undefined ? order.downpayment : Math.round(total * 0.5);
  const balance = order.balance !== undefined ? order.balance : (total - downpayment);
  const method = order.paymentMethod || 'GCash';
  const refNo = order.referenceNumber ? `(Ref: ${order.referenceNumber})` : '';

  let itemsRows = '';
  if (items.length > 0) {
    itemsRows = items.map(item => {
      const pcs = (item.qty || 1) * (item.min || 100);
      const lineTotal = (item.price || 0) * (item.qty || 1);
      return `
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #F0E6DD; font-size:13.5px; color:#3A271E;">
            <strong>${item.name}</strong><br>
            <span style="font-size:11.5px; color:#8C776D;">${item.qty} bundle (${pcs} pcs)</span>
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #F0E6DD; font-size:13px; color:#6B584E; text-align:center;">
            ${item.qty}
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #F0E6DD; font-size:13px; color:#6B584E; text-align:right;">
            &#8369;${(item.price || 0).toLocaleString()}
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #F0E6DD; font-size:13.5px; font-weight:700; color:#4A2E24; text-align:right;">
            &#8369;${lineTotal.toLocaleString()}
          </td>
        </tr>
      `;
    }).join('');
  } else {
    itemsRows = `
      <tr>
        <td colspan="4" style="padding:14px; text-align:center; color:#888; font-size:13px;">
          Fresh Bakery Selection
        </td>
      </tr>
    `;
  }

  const trackingNote = hasAccount
    ? `You can view this order, track production status, and manage past receipts directly in your <strong style="color:#B5523A;">WeBake Dashboard</strong>.`
    : `Please keep your Order ID (<strong>${orderId}</strong>) safe. You can track your bakery production and delivery status anytime via <strong style="color:#B5523A;">Track Transactions</strong> on our website.`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>WeBake Order Confirmation & Receipt - ${orderId}</title>
</head>
<body style="margin:0; padding:0; background-color:#F5EFE6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5EFE6; padding:35px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:540px; background-color:#FFFFFF; border-radius:12px; overflow:hidden; border:1px solid #E6D7C8; box-shadow:0 4px 20px rgba(74,46,36,0.06);">
          
          <!-- Brand Header -->
          <tr>
            <td style="padding:28px 28px 20px; text-align:center; background-color:#FAF6F0; border-bottom:1px solid #EEDBCE;">
              <span style="display:inline-block; font-size:10.5px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#B5523A; margin-bottom:6px;">
                Wholesale Bakery Since 2010
              </span>
              <div style="font-size:26px; font-weight:800; color:#4A2E24; letter-spacing:-0.5px;">
                We<span style="color:#B5523A;">Bake</span>
              </div>
              <div style="font-size:12.5px; color:#7A685D; margin-top:2px;">
                Crumbs N' Rolls Bakery — Marilao, Bulacan
              </div>
            </td>
          </tr>

          <!-- Receipt Banner -->
          <tr>
            <td style="padding:20px 28px 16px; background-color:#FAF2EC; border-bottom:1px dashed #E5D5C6;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; background-color:#28A745; color:#FFFFFF; text-transform:uppercase; letter-spacing:0.5px;">
                      &#10003; 50% Downpayment Confirmed
                    </span>
                    <h2 style="margin:8px 0 2px; font-size:19px; font-weight:800; color:#4A2E24;">
                      Official Digital Receipt
                    </h2>
                    <p style="margin:0; font-size:12.5px; color:#7A685D;">
                      Order Reference: <strong style="color:#B5523A; font-family:'Courier New', monospace;">${orderId}</strong> &middot; ${date}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Customer & Delivery Details -->
          <tr>
            <td style="padding:20px 28px; border-bottom:1px solid #F0E6DD;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="font-size:12.5px; color:#7A685D; line-height:1.6;">
                    <strong style="color:#4A2E24; font-size:13px;">Customer:</strong> ${custName} (${custContact})<br>
                    <strong style="color:#4A2E24; font-size:13px;">Delivery Address:</strong> ${custAddress}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Items Table -->
          <tr>
            <td style="padding:16px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:2px solid #E5D5C6;">
                    <th style="padding:8px 12px; font-size:11px; font-weight:700; text-transform:uppercase; color:#8C776D; text-align:left;">Item</th>
                    <th style="padding:8px 12px; font-size:11px; font-weight:700; text-transform:uppercase; color:#8C776D; text-align:center;">Qty</th>
                    <th style="padding:8px 12px; font-size:11px; font-weight:700; text-transform:uppercase; color:#8C776D; text-align:right;">Price</th>
                    <th style="padding:8px 12px; font-size:11px; font-weight:700; text-transform:uppercase; color:#8C776D; text-align:right;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Financial Breakdown Box -->
          <tr>
            <td style="padding:0 28px 24px;">
              <div style="background-color:#FAF6F0; border:1px dashed #D9BFAB; border-radius:8px; padding:16px 18px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:13.5px; line-height:1.7;">
                  <tr>
                    <td style="color:#6B584E;">Total Order Value:</td>
                    <td style="text-align:right; font-weight:700; color:#4A2E24;">&#8369;${total.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style="color:#28A745; font-weight:600;">
                      &#10003; 50% Downpayment Paid (${method} ${refNo}):
                    </td>
                    <td style="text-align:right; font-weight:700; color:#28A745;">&#8369;${downpayment.toLocaleString()}</td>
                  </tr>
                  <tr style="border-top:1px dashed #D9BFAB;">
                    <td style="padding-top:8px; font-size:14.5px; font-weight:800; color:#B5523A;">
                      Remaining Balance Due on Delivery:
                    </td>
                    <td style="padding-top:8px; text-align:right; font-size:16px; font-weight:800; color:#B5523A;">
                      &#8369;${balance.toLocaleString()}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Rider Handover Reminder -->
              <div style="margin-top:12px; background-color:#FFF8F0; border-radius:6px; padding:10px 14px; border-left:3px solid #B5523A; font-size:12px; color:#855038; line-height:1.5;">
                <strong>Handover Reminder:</strong> Please prepare <strong>&#8369;${balance.toLocaleString()}</strong> upon delivery. You may settle in cash with our delivery rider or scan their ${method} QR upon receiving your fresh pastries.
              </div>

              <!-- Tracking / Dashboard Note -->
              <p style="margin:16px 0 0; font-size:12px; color:#7A685D; line-height:1.5; text-align:center;">
                ${trackingNote}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 28px 24px; background-color:#FAF6F0; border-top:1px solid #EEDBCE; text-align:center;">
              <p style="margin:0 0 4px; font-size:12px; font-weight:700; color:#4A2E24;">
                Crumbs N' Rolls Bakery
              </p>
              <p style="margin:0; font-size:11px; color:#8C776D; line-height:1.5;">
                1356 Cordero St., Lambakin, Marilao, Bulacan<br>
                For orders & inquiries: crbwebake@gmail.com<br>
                &copy; 2026 WeBake. All Rights Reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function buildOrderReceiptText(order, hasAccount = false) {
  const orderId = order.orderId || 'WB-ORD';
  const date = order.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const customer = order.customer || {};
  const custName = customer.name || 'Valued Customer';
  const custContact = customer.contact || 'N/A';
  const custAddress = customer.address || 'N/A';

  const items = Array.isArray(order.items) ? order.items : [];
  const total = order.total || 0;
  const downpayment = order.downpayment !== undefined ? order.downpayment : Math.round(total * 0.5);
  const balance = order.balance !== undefined ? order.balance : (total - downpayment);
  const method = order.paymentMethod || 'GCash';
  const refNo = order.referenceNumber ? ` (Ref: ${order.referenceNumber})` : '';

  const itemsLines = items.map(item => {
    const pcs = (item.qty || 1) * (item.min || 100);
    const lineTotal = (item.price || 0) * (item.qty || 1);
    return `  - ${item.name} x ${item.qty} bundle (${pcs} pcs) - PHP ${lineTotal.toLocaleString()}`;
  }).join('\n') || '  - Fresh Bakery Pastries';

  const trackingLine = hasAccount
    ? 'You can view this order, track production status, and view past receipts directly in your WeBake Dashboard.'
    : `Please keep your Order ID (${orderId}) safe. You can track your bakery production and delivery status anytime via Track Transactions on our website.`;

  return [
    `CRUMBS N' ROLLS BAKERY (WeBake)`,
    `1356 Cordero St., Lambakin, Marilao, Bulacan`,
    `-------------------------------------------------------`,
    `OFFICIAL ORDER CONFIRMATION & DIGITAL RECEIPT`,
    `Order ID: ${orderId}`,
    `Date: ${date}`,
    `-------------------------------------------------------`,
    `Customer: ${custName} (${custContact})`,
    `Delivery Address: ${custAddress}`,
    `-------------------------------------------------------`,
    `ITEMS ORDERED:`,
    itemsLines,
    `-------------------------------------------------------`,
    `Total Order Value: PHP ${total.toLocaleString()}`,
    `50% Downpayment Confirmed (${method}${refNo}): PHP ${downpayment.toLocaleString()}`,
    `REMAINING BALANCE DUE ON DELIVERY: PHP ${balance.toLocaleString()}`,
    `-------------------------------------------------------`,
    `Handover Reminder: Please prepare PHP ${balance.toLocaleString()} upon delivery in cash or via rider ${method} QR.`,
    `-------------------------------------------------------`,
    trackingLine,
    `-------------------------------------------------------`,
    `Thank you for ordering with WeBake! For inquiries, contact crbwebake@gmail.com.`
  ].join('\n');
}

/**
 * Sends order digital receipt email via Gmail
 */
async function sendOrderReceiptEmail({ order, hasAccount = false }) {
  const fromAddress = process.env.GMAIL_USER || 'crbwebake@gmail.com';
  const recipientEmail = (order?.customer?.email || '').trim().toLowerCase();

  if (!recipientEmail) {
    throw new Error('Customer email is required to send digital receipt.');
  }

  const transporter = createTransporter();
  const orderId = order.orderId || 'WB-ORD';

  const info = await transporter.sendMail({
    from: `"WeBake Bakery" <${fromAddress}>`,
    replyTo: fromAddress,
    to: recipientEmail,
    subject: `WeBake Order Confirmation & Receipt - ${orderId}`,
    text: buildOrderReceiptText(order, hasAccount),
    html: buildOrderReceiptHtml(order, hasAccount)
  });

  return info;
}

module.exports = {
  sendOtpEmail,
  sendOrderReceiptEmail
};

