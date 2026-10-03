/**
 * Phase 2 Acceptance Verification Test Suite
 * Tests OTP hardening, Auth hardening, Data protection, and Tracking proof of ownership
 */
const path = require('path');
require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const { getPool } = require('../api/_lib/db');
const { createSessionToken, createProofToken, verifyProofToken } = require('../api/_lib/session');
const { hashPassword, verifyPassword } = require('../api/_lib/authHelper');

const pool = getPool();

// Helper to mock req/res for Vercel serverless handlers
function mockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body || {},
    query: options.query || {},
    url: options.url || '/'
  };

  let statusCode = 200;
  let responseData = null;
  const headers = {};

  const res = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    },
    end: () => res
  };

  return { req, res, getStatus: () => statusCode, getData: () => responseData, getHeaders: () => headers };
}

async function runTests() {
  console.log('=== STARTING PHASE 2 COMPREHENSIVE ACCEPTANCE TESTS ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name}`);
      failed++;
    }
  }

  const testEmail = `phase2_test_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  // --- TEST 1: Password hashing and iteration upgrades ---
  console.log('1. Password Hashing & Upgrade (210,000 iterations)');
  const newHash = await hashPassword(testPassword);
  assert(newHash.startsWith('pbkdf2$210000$'), 'Hash uses 210,000 iterations');
  const verifyResult = await verifyPassword(testPassword, newHash);
  assert(verifyResult.valid === true, 'Valid password verifies correctly');
  assert(verifyResult.needsRehash === false, '210k hash does not need rehash');

  const legacyHash = 'pbkdf2$10000$saltsalt$fake';
  const legacyVerify = await verifyPassword('wrong', legacyHash);
  assert(legacyVerify.valid === false, 'Wrong password rejected on legacy format');

  // --- TEST 2: OTP Proof Tokens & Purpose Enforcement ---
  console.log('\n2. OTP Proof Tokens & Purpose Enforcement');
  const proofToken = createProofToken({ email: testEmail, purpose: 'registration', otpId: 99999 });
  const validProof = verifyProofToken(proofToken, 'registration', testEmail);
  assert(validProof !== null && validProof.otpId === 99999, 'Proof token valid for correct email & purpose');

  const wrongPurposeProof = verifyProofToken(proofToken, 'password_reset', testEmail);
  assert(wrongPurposeProof === null, 'Proof token rejected for wrong purpose');

  const wrongEmailProof = verifyProofToken(proofToken, 'registration', 'other@example.com');
  assert(wrongEmailProof === null, 'Proof token rejected for wrong email');

  // --- TEST 3: Auth Endpoints Hardening ---
  console.log('\n3. Register / Reset / Login Hardening');
  const registerHandler = require('../api/auth/register');
  const loginHandler = require('../api/auth/login');
  const resetHandler = require('../api/auth/reset');

  // 3a. Register without proof token => rejected (Fixes C2)
  const regNoProof = mockReqRes({
    method: 'POST',
    body: { email: testEmail, password: testPassword, name: 'Phase 2 Test User', contact: '09123456789' }
  });
  await registerHandler(regNoProof.req, regNoProof.res);
  assert(regNoProof.getStatus() === 403 && regNoProof.getData()?.error === 'verification_required', 'Register without proof token returns 403 verification_required');

  // Seed an OTP record in DB for registration
  const otpRes = await pool.query(`
    INSERT INTO otp_verifications (email_address, purpose, otp_code_hash, resend_available_at, expires_at, verified_at)
    VALUES ($1, 'register', 'mock_hash', NOW(), NOW() + INTERVAL '10 minutes', NOW())
    RETURNING id;
  `, [testEmail]);
  const otpId = otpRes.rows[0].id;
  const realProofToken = createProofToken({ email: testEmail, purpose: 'register', otpId });

  // 3b. Register with valid proof token => succeeds
  const regValid = mockReqRes({
    method: 'POST',
    body: {
      email: testEmail,
      password: testPassword,
      name: 'Phase 2 Test User',
      contact: '09123456789',
      proofToken: realProofToken
    }
  });
  await registerHandler(regValid.req, regValid.res);
  assert(regValid.getStatus() === 201 && regValid.getData()?.success === true, 'Register with valid proof token succeeds');

  // 3c. Replayed proof token => rejected (Fixes C2)
  const regReplay = mockReqRes({
    method: 'POST',
    body: {
      email: testEmail,
      password: testPassword,
      name: 'Phase 2 Test User 2',
      contact: '09123456789',
      proofToken: realProofToken
    }
  });
  await registerHandler(regReplay.req, regReplay.res);
  assert(regReplay.getStatus() === 403 && (regReplay.getData()?.error === 'token_consumed' || regReplay.getData()?.error === 'verification_invalid'), 'Replayed proof token is rejected');

  // 3d. Login uniform error on nonexistent email vs wrong password (Fixes H9)
  const loginNonexistent = mockReqRes({
    method: 'POST',
    body: { email: 'nonexistent_ghost_user@example.com', password: 'Password123!' }
  });
  await loginHandler(loginNonexistent.req, loginNonexistent.res);

  const loginWrongPass = mockReqRes({
    method: 'POST',
    body: { email: testEmail, password: 'WrongPassword123!' }
  });
  await loginHandler(loginWrongPass.req, loginWrongPass.res);

  assert(
    loginNonexistent.getStatus() === 401 &&
    loginWrongPass.getStatus() === 401 &&
    loginNonexistent.getData()?.message === loginWrongPass.getData()?.message,
    'Login returns identical uniform error message for unknown email and wrong password'
  );

  // 3e. Login with correct password => returns session cookie
  const loginSuccess = mockReqRes({
    method: 'POST',
    body: { email: testEmail, password: testPassword }
  });
  await loginHandler(loginSuccess.req, loginSuccess.res);
  const cookieHeader = loginSuccess.getHeaders()['set-cookie'] || '';
  assert(loginSuccess.getStatus() === 200 && cookieHeader.includes('weBakeSessionToken='), 'Login succeeds and sets HttpOnly weBakeSessionToken cookie');

  const createdUser = loginSuccess.getData()?.user;
  const userSessionToken = createSessionToken({
    uid: createdUser.id,
    email: createdUser.email,
    role: createdUser.role,
    name: createdUser.name
  });

  // --- TEST 4: Protect User Data (auth/sync, cart/sync, partner) ---
  console.log('\n4. Protect User Data (Session Guarding)');
  const syncHandler = require('../api/auth/sync');
  const cartSyncHandler = require('../api/cart/sync');

  // 4a. Sync without session => 401
  const syncNoSession = mockReqRes({ method: 'GET' });
  await syncHandler(syncNoSession.req, syncNoSession.res);
  assert(syncNoSession.getStatus() === 401, '/api/auth/sync returns 401 without session');

  // 4b. Sync with session => 200 with profile
  const syncWithSession = mockReqRes({
    method: 'GET',
    headers: { authorization: `Bearer ${userSessionToken}` }
  });
  await syncHandler(syncWithSession.req, syncWithSession.res);
  assert(syncWithSession.getStatus() === 200 && syncWithSession.getData()?.user?.email === testEmail, '/api/auth/sync returns user profile for valid session');

  // 4c. Cart sync without session => 401
  const cartNoSession = mockReqRes({ method: 'GET' });
  await cartSyncHandler(cartNoSession.req, cartNoSession.res);
  assert(cartNoSession.getStatus() === 401, '/api/cart/sync returns 401 without session');

  // 4d. Cart write with session => 200
  const cartWrite = mockReqRes({
    method: 'POST',
    headers: { authorization: `Bearer ${userSessionToken}` },
    body: { cart: [{ id: 1, name: 'Special Mamon', price: 105, qty: 3, min: 25 }] }
  });
  await cartSyncHandler(cartWrite.req, cartWrite.res);
  assert(cartWrite.getStatus() === 200 && cartWrite.getData()?.cart?.length === 1, '/api/cart/sync writes cart for session user');

  // --- TEST 5: Tracking Requires Proof of Ownership (orders/track) ---
  console.log('\n5. Tracking Proof of Ownership (Fixes C3)');
  const ordersHandler = require('../api/orders/index');

  // Seed an order for testEmail
  const testOrderCode = `WB-TEST-${Math.floor(10000 + Math.random() * 90000)}`;
  const orderRes = await pool.query(`
    INSERT INTO orders (
      order_code, user_id, customer_name, customer_email, customer_contact,
      delivery_address, delivery_date, delivery_time, special_notes,
      subtotal_amount, delivery_fee, grand_total, downpayment_rate,
      downpayment_required, downpayment_paid, balance_due, payment_method, status
    ) VALUES (
      $1, $2, 'Phase 2 Test User', $3, '09123456789',
      'Test Address, Marilao', CURRENT_DATE, '09:00 AM', 'None',
      210.00, 50.00, 260.00, 0.50,
      130.00, 0.00, 130.00, 'gcash', 'pending'
    ) RETURNING id, order_code;
  `, [testOrderCode, createdUser.id, testEmail]);

  // 5a. Code alone without contact => 404 (Fixes C3)
  const trackCodeAlone = mockReqRes({
    method: 'GET',
    query: { action: 'track', id: testOrderCode }
  });
  await ordersHandler(trackCodeAlone.req, trackCodeAlone.res);
  assert(trackCodeAlone.getStatus() === 404, 'Track with code alone returns 404');

  // 5b. Code + wrong contact => 404 (Fixes C3)
  const trackWrongContact = mockReqRes({
    method: 'GET',
    query: { action: 'track', id: testOrderCode, contact: '09999999999' }
  });
  await ordersHandler(trackWrongContact.req, trackWrongContact.res);
  assert(trackWrongContact.getStatus() === 404, 'Track with code + wrong contact returns 404');

  // 5c. Code + correct phone => 200 with order
  const trackCorrectPhone = mockReqRes({
    method: 'GET',
    query: { action: 'track', id: testOrderCode, contact: '09123456789' }
  });
  await ordersHandler(trackCorrectPhone.req, trackCorrectPhone.res);
  assert(trackCorrectPhone.getStatus() === 200 && trackCorrectPhone.getData()?.order?.orderId === testOrderCode, 'Track with code + matching phone returns order data');

  // 5d. Code + correct email => 200 with order
  const trackCorrectEmail = mockReqRes({
    method: 'GET',
    query: { action: 'track', id: testOrderCode, contact: testEmail }
  });
  await ordersHandler(trackCorrectEmail.req, trackCorrectEmail.res);
  assert(trackCorrectEmail.getStatus() === 200 && trackCorrectEmail.getData()?.order?.orderId === testOrderCode, 'Track with code + matching email returns order data');

  // --- TEST 6: Order Cancellation Hardening ---
  console.log('\n6. Order Cancellation & Table Integration (Fixes C3, H7)');

  // 6a. Cancel without ownership or matching contact => 404 / 403
  const cancelUnauthorized = mockReqRes({
    method: 'POST',
    query: { action: 'cancel' },
    body: { orderId: testOrderCode, email: 'stranger@example.com' }
  });
  await ordersHandler(cancelUnauthorized.req, cancelUnauthorized.res);
  assert(cancelUnauthorized.getStatus() === 404 || cancelUnauthorized.getStatus() === 403, 'Cancel without ownership returns 404/403');

  // 6b. Cancel with matching contact => succeeds and populates cancellation_requests
  const cancelAuthorized = mockReqRes({
    method: 'POST',
    query: { action: 'cancel' },
    body: {
      orderId: testOrderCode,
      email: testEmail,
      refundDetails: {
        wallet: 'GCash',
        accountNum: '09123456789',
        accountName: 'Phase 2 Test User',
        reason: 'Duplicate test order'
      }
    }
  });
  await ordersHandler(cancelAuthorized.req, cancelAuthorized.res);
  assert(cancelAuthorized.getStatus() === 200 && cancelAuthorized.getData()?.status === 'cancellation_requested', 'Cancel with matching ownership updates status to cancellation_requested');

  // Verify cancellation_requests row in DB
  const cancelDbRow = await pool.query(
    'SELECT order_id, refund_channel, eligible_refund_amount, status FROM cancellation_requests WHERE order_id = $1;',
    [orderRes.rows[0].id]
  );
  assert(cancelDbRow.rows.length === 1 && parseFloat(cancelDbRow.rows[0].eligible_refund_amount) === 130.00, 'Cancellation row created in cancellation_requests table with exact server downpayment');

  // 6c. Second cancel attempt => rejected
  const cancelDuplicate = mockReqRes({
    method: 'POST',
    query: { action: 'cancel' },
    body: { orderId: testOrderCode, email: testEmail }
  });
  await ordersHandler(cancelDuplicate.req, cancelDuplicate.res);
  assert(cancelDuplicate.getStatus() === 400, 'Duplicate cancel request is rejected with 400');

  // Clean up test data
  console.log('\nCleaning up test artifacts...');
  await pool.query('DELETE FROM cancellation_requests WHERE order_id = $1;', [orderRes.rows[0].id]);
  await pool.query('DELETE FROM orders WHERE id = $1;', [orderRes.rows[0].id]);
  await pool.query('DELETE FROM otp_verifications WHERE email_address = $1;', [testEmail]);
  await pool.query('DELETE FROM users WHERE email_address = $1;', [testEmail]);

  console.log(`\n=== TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  await pool.end();

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
