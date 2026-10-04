const path = require('path');
require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const { createTransporter, buildOtpEmailHtml } = require('../api/_lib/mailer');

async function main() {
  console.log('Testing createTransporter()...');
  console.log('GMAIL_USER:', process.env.GMAIL_USER);
  console.log('GMAIL_APP_PASS exists:', !!process.env.GMAIL_APP_PASS);
  const transporter = createTransporter();
  try {
    const info = await transporter.sendMail({
      from: '"WeBake — Crumbs N\' Rolls Bakery" <crbwebake@gmail.com>',
      to: 'geraldvelasco.ai@gmail.com',
      subject: '123456 is your WeBake verification code',
      text: 'Your WeBake verification code is: 123456. This code will expire in 5 minutes.',
      html: buildOtpEmailHtml({ otp: '123456', purpose: 'register' })
    });
    console.log('SEND SUCCESS:', JSON.stringify(info, null, 2));
  } catch (err) {
    console.error('SEND ERROR:', err);
  }
}

main();
