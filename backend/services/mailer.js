/**
 * ====================================================================
 * WeBake - Mailer Service (Nodemailer + Gmail)
 * Minimalist, elegant transactional email templates for CRB
 * ====================================================================
 */

const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter() {
  if (!cachedTransporter) {
    const user = process.env.GMAIL_USER || 'crbwebake@gmail.com';
    const pass = (process.env.GMAIL_APP_PASS || '').replace(/\s+/g, '');

    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: user,
        pass: pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return cachedTransporter;
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

  const transporter = getTransporter();

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

  const transporter = getTransporter();
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

/**
 * Builds HTML email template for Partner Application Status (Approved or Rejected)
 */
function buildPartnerStatusHtml({ applicantName, applicationCode, businessName, status, staffNotes }) {
  const isApproved = status === 'approved';
  const isCancelled = status === 'cancelled';
  const isReviewing = status === 'under_review' || status === 'reviewing' || status === 'contacted';

  let badgeBg = isApproved ? '#E8F5E9' : isReviewing ? '#E0F2FE' : isCancelled ? '#F3F4F6' : '#FFEBEE';
  let badgeColor = isApproved ? '#2E7D32' : isReviewing ? '#0369A1' : isCancelled ? '#4B5563' : '#C62828';
  let badgeBorder = isApproved ? '#A5D6A7' : isReviewing ? '#BAE6FD' : isCancelled ? '#D1D5DB' : '#FFCDD2';
  let badgeText = isApproved ? 'WHOLESALE PARTNERSHIP APPROVED' : isReviewing ? 'APPLICATION UNDER REVIEW / CONTACTED' : isCancelled ? 'PARTNERSHIP CANCELLED' : 'APPLICATION REVIEW UPDATE';
  let heading = isApproved ? 'Welcome to the WeBake Wholesale Family! 🎉' : isReviewing ? 'Your Wholesale Application is Under Review 📋' : isCancelled ? 'Wholesale Partnership Request Cancelled' : 'Wholesale Application Status Update';

  const notesBorder = isApproved ? '#28A745' : isReviewing ? '#0284C7' : isCancelled ? '#6B7280' : '#B5523A';
  const notesSection = staffNotes ? `
    <div style="margin:24px 0; background-color:#FAF6F0; border-left:4px solid ${notesBorder}; border-radius:6px; padding:14px 18px; text-align:left;">
      <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#7A685D; margin-bottom:6px;">
        Remarks from Bakery Management:
      </div>
      <div style="font-size:13.5px; color:#4A2E24; line-height:1.6; font-style:italic;">
        "${staffNotes}"
      </div>
    </div>
  ` : '';

  const mainContent = isApproved ? `
    <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#4A2E24;">
      Dear <strong>${applicantName || 'Partner'}</strong>,
    </p>
    <p style="margin:0 0 16px; font-size:14.5px; line-height:1.6; color:#6B584E;">
      We are delighted to inform you that your wholesale reseller partnership application for <strong style="color:#4A2E24;">${businessName || 'your bakery'}</strong> has been <strong style="color:#28A745;">APPROVED</strong> by Crumbs N' Rolls Bakery management!
    </p>
    <p style="margin:0 0 20px; font-size:14px; line-height:1.6; color:#6B584E;">
      You are now officially registered as an active wholesale reseller partner. Your store account has been upgraded with exclusive wholesale partner privileges.
    </p>

    <!-- Perks List -->
    <div style="background-color:#FDFBF7; border:1px solid #EEDBCE; border-radius:8px; padding:18px 20px; margin:20px 0; text-align:left;">
      <div style="font-size:13px; font-weight:800; color:#4A2E24; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px;">
        Your Wholesale Partner Benefits:
      </div>
      <ul style="margin:0; padding-left:20px; font-size:13.5px; line-height:1.8; color:#5C4B40;">
        <li><strong>Wholesale Pricing:</strong> Exclusive discounted bulk rates on Mamon, Otap, Eggnog, and Buttertoast.</li>
        <li><strong>Batch Delivery Priority:</strong> Morning production priority and scheduled direct deliveries to your shop.</li>
        <li><strong>Flexible Payment Terms:</strong> 50% downpayment terms with remaining balance settlement on handover.</li>
        <li><strong>Dashboard Management:</strong> View your active partner badge, past wholesale invoices, and order history anytime.</li>
      </ul>
    </div>
    ${notesSection}
    <p style="margin:24px 0 0; font-size:14px; line-height:1.6; color:#6B584E;">
      You can now log in to your <a href="http://localhost:5000/customer/html/dashboard.html" style="color:#B5523A; font-weight:700; text-decoration:none;">WeBake Customer Dashboard</a> to view your active partnership status and begin placing wholesale orders!
    </p>
  ` : isReviewing ? `
    <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#4A2E24;">
      Dear <strong>${applicantName || 'Applicant'}</strong>,
    </p>
    <p style="margin:0 0 16px; font-size:14.5px; line-height:1.6; color:#6B584E;">
      Thank you for submitting your wholesale reseller application for <strong style="color:#4A2E24;">${businessName || 'your business'}</strong> (Reference ID: <strong style="color:#0369A1;">${applicationCode}</strong>).
    </p>
    <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#6B584E;">
      Our wholesale management team is actively reviewing your store application and evaluating delivery logistics. We may contact you directly via phone or email to confirm weekly order volumes and schedule details.
    </p>
    ${notesSection}
    <div style="background-color:#F0F9FF; border:1px solid #BAE6FD; border-radius:8px; padding:16px 20px; margin:20px 0; text-align:left;">
      <div style="font-size:13px; font-weight:700; color:#0369A1; margin-bottom:6px;">
        Next steps:
      </div>
      <p style="margin:0 0 8px; font-size:13px; line-height:1.6; color:#0c4a6e;">
        &bull; <strong>Keep communication lines open:</strong> Our team will contact you if additional details are needed.
      </p>
      <p style="margin:0; font-size:13px; line-height:1.6; color:#0c4a6e;">
        &bull; <strong>Track status online:</strong> You can check your application progress anytime in your customer dashboard.
      </p>
    </div>
    <p style="margin:20px 0 0; font-size:14px; line-height:1.6; color:#6B584E;">
      You can track your application live on the <a href="http://localhost:5000/customer/html/dashboard.html" style="color:#B5523A; font-weight:700; text-decoration:none;">WeBake Dashboard</a>.
    </p>
  ` : isCancelled ? `
    <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#4A2E24;">
      Dear <strong>${applicantName || 'Customer'}</strong>,
    </p>
    <p style="margin:0 0 16px; font-size:14.5px; line-height:1.6; color:#6B584E;">
      This email confirms that your wholesale partnership request for <strong style="color:#4A2E24;">${businessName || 'your business'}</strong> (Reference ID: <strong style="color:#B5523A;">${applicationCode}</strong>) has been <strong>CANCELLED</strong>.
    </p>
    <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#6B584E;">
      Your account has returned to regular retail customer status. If you wish to apply again in the future, you may submit a new application anytime through your customer dashboard.
    </p>
    ${notesSection}
    <p style="margin:20px 0 0; font-size:14px; line-height:1.6; color:#6B584E;">
      You can continue ordering fresh bakery items as a customer through our store at <a href="http://localhost:5000/customer/html/home.html" style="color:#B5523A; font-weight:700; text-decoration:none;">crumbsnrolls.com</a>.
    </p>
  ` : `
    <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#4A2E24;">
      Dear <strong>${applicantName || 'Applicant'}</strong>,
    </p>
    <p style="margin:0 0 16px; font-size:14.5px; line-height:1.6; color:#6B584E;">
      Thank you for your interest in partnering with Crumbs N' Rolls Bakery and submitting a wholesale application for <strong style="color:#4A2E24;">${businessName || 'your business'}</strong> (Reference ID: <strong style="color:#B5523A;">${applicationCode}</strong>).
    </p>
    <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#6B584E;">
      After careful review of our current production logistics, delivery routes, and scheduling capacity, we regret to inform you that we are unable to approve your wholesale partnership application at this time.
    </p>
    ${notesSection}
    <div style="background-color:#FAF6F0; border:1px solid #EEDBCE; border-radius:8px; padding:16px 20px; margin:20px 0; text-align:left;">
      <div style="font-size:13px; font-weight:700; color:#4A2E24; margin-bottom:6px;">
        What you can do next:
      </div>
      <p style="margin:0 0 8px; font-size:13px; line-height:1.6; color:#6B584E;">
        &bull; <strong>Re-apply in the future:</strong> As we expand our delivery coverage and weekly baking capacity, you are welcome to submit an updated application via your customer dashboard.
      </p>
      <p style="margin:0; font-size:13px; line-height:1.6; color:#6B584E;">
        &bull; <strong>Retail Orders:</strong> You can continue ordering fresh bakery items through our website anytime.
      </p>
    </div>
  `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isApproved ? 'Partnership Approved' : isCancelled ? 'Partnership Cancelled' : 'Application Status Update'}</title>
</head>
<body style="margin:0; padding:0; background-color:#F5EFE6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5EFE6; padding:30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:540px; background-color:#FFFFFF; border-radius:12px; overflow:hidden; border:1px solid #E6D7C8; box-shadow:0 4px 20px rgba(74,46,36,0.06);">
          
          <!-- Brand Header -->
          <tr>
            <td style="padding:28px 32px 20px; text-align:center; background-color:#FAF6F0; border-bottom:1px solid #EEDBCE;">
              <span style="display:inline-block; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#B5523A; margin-bottom:6px;">
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

          <!-- Status Ribbon -->
          <tr>
            <td style="padding:20px 32px 0; text-align:center;">
              <span style="display:inline-block; padding:6px 16px; background-color:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder}; border-radius:20px; font-size:12px; font-weight:700; letter-spacing:0.8px;">
                ${badgeText}
              </span>
              <h2 style="margin:14px 0 6px; font-size:20px; font-weight:800; color:#2E1A14;">
                ${heading}
              </h2>
              <div style="font-size:13px; color:#8C776D; margin-bottom:16px;">
                Application Code: <strong>${applicationCode}</strong>
              </div>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:0 32px 28px; text-align:center;">
              ${mainContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; background-color:#FAF6F0; border-top:1px solid #EEDBCE; text-align:center;">
              <p style="margin:0 0 4px; font-size:12px; font-weight:700; color:#4A2E24;">
                Crumbs N' Rolls Bakery
              </p>
              <p style="margin:0; font-size:11px; color:#8C776D; line-height:1.5;">
                1356 Cordero St., Lambakin, Marilao, Bulacan<br>
                Direct Support: crbwebake@gmail.com &bull; 0917 123 4567<br>
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
 * Builds plain-text fallback email for Partner Status
 */
function buildPartnerStatusText({ applicantName, applicationCode, businessName, status, staffNotes }) {
  const isApproved = status === 'approved';
  const isCancelled = status === 'cancelled';
  const isReviewing = status === 'under_review' || status === 'reviewing' || status === 'contacted';
  const notesText = staffNotes ? `\nRemarks from Bakery Management:\n"${staffNotes}"\n` : '';

  if (isApproved) {
    return [
      `CRUMBS N' ROLLS BAKERY (WeBake)`,
      `1356 Cordero St., Lambakin, Marilao, Bulacan`,
      `-------------------------------------------------------`,
      `WHOLESALE RESELLER PARTNERSHIP APPROVED! 🎉`,
      `Application Code: ${applicationCode}`,
      `Business: ${businessName || 'Your Bakery'}`,
      `-------------------------------------------------------`,
      `Dear ${applicantName || 'Partner'},`,
      ``,
      `We are pleased to inform you that your wholesale reseller partnership application has been officially APPROVED by bakery management!`,
      ``,
      `YOUR WHOLESALE PARTNER BENEFITS:`,
      `- Exclusive bulk discount pricing on all bread and pastry bundles`,
      `- Priority morning baking batch queue and direct scheduled delivery`,
      `- 50% downpayment terms with balance settlement on delivery`,
      `- Active Partner badge in your customer dashboard`,
      notesText,
      `You can now log in to your WeBake customer dashboard to track your partnership and start placing wholesale orders.`,
      `-------------------------------------------------------`,
      `For inquiries: crbwebake@gmail.com | 0917 123 4567`
    ].filter(Boolean).join('\n');
  } else if (isReviewing) {
    return [
      `CRUMBS N' ROLLS BAKERY (WeBake)`,
      `1356 Cordero St., Lambakin, Marilao, Bulacan`,
      `-------------------------------------------------------`,
      `WHOLESALE APPLICATION UNDER REVIEW / CONTACTED`,
      `Application Code: ${applicationCode}`,
      `Business: ${businessName || 'Your Business'}`,
      `-------------------------------------------------------`,
      `Dear ${applicantName || 'Applicant'},`,
      ``,
      `Thank you for submitting your wholesale reseller application for ${businessName || 'your business'} (Reference ID: ${applicationCode}).`,
      ``,
      `Our management team is actively reviewing your store location and evaluating delivery logistics. We may contact you directly via phone or email to confirm weekly order volumes and schedule details.`,
      notesText,
      `You can track your application status anytime through your WeBake customer dashboard or via Track Transactions.`,
      `-------------------------------------------------------`,
      `For inquiries: crbwebake@gmail.com | 0917 123 4567`
    ].filter(Boolean).join('\n');
  } else if (isCancelled) {
    return [
      `CRUMBS N' ROLLS BAKERY (WeBake)`,
      `1356 Cordero St., Lambakin, Marilao, Bulacan`,
      `-------------------------------------------------------`,
      `WHOLESALE PARTNERSHIP CANCELLED`,
      `Application Code: ${applicationCode}`,
      `Business: ${businessName || 'Your Business'}`,
      `-------------------------------------------------------`,
      `Dear ${applicantName || 'Customer'},`,
      ``,
      `This email confirms that your wholesale partnership request (ID: ${applicationCode}) has been cancelled.`,
      notesText,
      `You may re-apply anytime through your WeBake customer dashboard or continue placing regular retail orders.`,
      `-------------------------------------------------------`,
      `For inquiries: crbwebake@gmail.com | 0917 123 4567`
    ].filter(Boolean).join('\n');
  } else {
    return [
      `CRUMBS N' ROLLS BAKERY (WeBake)`,
      `1356 Cordero St., Lambakin, Marilao, Bulacan`,
      `-------------------------------------------------------`,
      `WHOLESALE PARTNERSHIP APPLICATION UPDATE`,
      `Application Code: ${applicationCode}`,
      `Business: ${businessName || 'Your Business'}`,
      `-------------------------------------------------------`,
      `Dear ${applicantName || 'Applicant'},`,
      ``,
      `Thank you for your interest in partnering with Crumbs N' Rolls Bakery. After reviewing your application, we regret to inform you that we are unable to approve your wholesale partnership at this time.`,
      notesText,
      `You are welcome to re-apply in the future through your customer dashboard, or continue ordering fresh bread products through retail checkout anytime.`,
      `-------------------------------------------------------`,
      `For inquiries: crbwebake@gmail.com | 0917 123 4567`
    ].filter(Boolean).join('\n');
  }
}

/**
 * Sends Partner Application Status Notification Email via Gmail
 */
async function sendPartnerStatusEmail({ applicantName, applicantEmail, applicationCode, businessName, status, staffNotes }) {
  const fromAddress = process.env.GMAIL_USER || 'crbwebake@gmail.com';
  const recipientEmail = (applicantEmail || '').trim().toLowerCase();

  if (!recipientEmail) {
    throw new Error('Applicant email is required to send partner status notification.');
  }

  const transporter = getTransporter();
  const isApproved = status === 'approved';
  const isCancelled = status === 'cancelled';
  const isReviewing = status === 'under_review' || status === 'reviewing' || status === 'contacted';
  const subject = isApproved
    ? `Congratulations! Your WeBake Wholesale Partnership Has Been Approved - [${applicationCode}]`
    : isCancelled
    ? `Notice: Your WeBake Wholesale Partnership Has Been Cancelled - [${applicationCode}]`
    : isReviewing
    ? `Update: Your WeBake Wholesale Partnership Application is Under Review - [${applicationCode}]`
    : `Update on Your WeBake Wholesale Partnership Application - [${applicationCode}]`;

  const info = await transporter.sendMail({
    from: `"WeBake Bakery" <${fromAddress}>`,
    replyTo: fromAddress,
    to: recipientEmail,
    subject: subject,
    text: buildPartnerStatusText({ applicantName, applicationCode, businessName, status, staffNotes }),
    html: buildPartnerStatusHtml({ applicantName, applicationCode, businessName, status, staffNotes })
  });

  return info;
}

module.exports = {
  sendOtpEmail,
  sendOrderReceiptEmail,
  sendPartnerStatusEmail
};

