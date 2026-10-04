const path = require('path');
require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const { sendOtpEmail } = require('../backend/services/mailer');

async function main() {
  console.log('Sending email 1...');
  const res1 = await sendOtpEmail({ email: 'crbwebake@gmail.com', otp: '111111', purpose: 'register' });
  console.log('Email 1 sent:', res1.messageId);

  console.log('Waiting 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('Sending email 2...');
  const res2 = await sendOtpEmail({ email: 'crbwebake@gmail.com', otp: '222222', purpose: 'checkout_verification' });
  console.log('Email 2 sent:', res2.messageId);
}

main().catch(console.error);
