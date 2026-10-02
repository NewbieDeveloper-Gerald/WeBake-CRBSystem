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

module.exports = {
  sendOtpEmail
};
