const nodemailer = require('nodemailer');

function createTransporter() {
  const user = process.env.GMAIL_USER || '';
  const pass = (process.env.GMAIL_APP_PASS || '').replace(/\s+/g, '');

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: user,
      pass: pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

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
  <title>WeBake Verification Code</title>
</head>
<body style="margin:0; padding:0; background-color:#F5EFE6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px; background-color:#FFFFFF; border-radius:12px; overflow:hidden; border:1px solid #E6D7C8; box-shadow:0 4px 20px rgba(74,46,36,0.06);">
          <tr>
            <td style="padding:28px 32px; background-color:#FAF6F0; border-bottom:1px solid #EEDBCE; text-align:center;">
              <h2 style="margin:0; font-size:24px; color:#A0522D; letter-spacing:0.5px;">We<span style="color:#D4A373;">Bake</span></h2>
              <span style="font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#8C776D; display:block; margin-top:3px;">Crumbs N' Rolls Bakery</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px; text-align:center;">
              <h3 style="margin:0 0 12px; font-size:18px; color:#4A2E24;">${purposeTitle}</h3>
              <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#6B584E;">${purposeText}</p>
              <div style="display:inline-block; padding:16px 28px; background-color:#FAF6F0; border:2px dashed #D9BFAB; border-radius:10px; margin-bottom:24px;">
                <span style="font-family:'Courier New', Courier, monospace; font-size:32px; font-weight:800; letter-spacing:8px; color:#4A2E24;">${otp}</span>
              </div>
              <div style="background-color:#FFF8F0; border-radius:8px; padding:12px 16px; margin-bottom:16px; border-left:3px solid #B5523A; text-align:left;">
                <p style="margin:0; font-size:12px; color:#855038; line-height:1.5;">
                  <strong>⏳ Expires in 5 minutes.</strong> Never share this code with anyone.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 20px; background-color:#FAF6F0; border-top:1px solid #EEDBCE; text-align:center;">
              <p style="margin:0; font-size:11px; color:#8C776D;">1356 Cordero St., Lambakin, Marilao, Bulacan &bull; &copy; 2026 WeBake</p>
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

module.exports = { createTransporter, buildOtpEmailHtml };
