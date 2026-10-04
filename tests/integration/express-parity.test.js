/**
 * tests/integration/express-parity.test.js
 *
 * Verifies 100% parity of the Express adapter with Vercel Serverless:
 * 1. Boots Express adapter on an ephemeral port.
 * 2. Replays Register with OTP proof token over HTTP.
 * 3. Replays Login & Cookie generation over HTTP.
 * 4. Replays Auth Guarded /api/auth/sync (401 without cookie, 200 with cookie).
 * 5. Replays Cart Guarded /api/cart/sync (401 without cookie, 200 with cookie).
 * 6. Replays Order creation with client price-tamper (server overrides with catalog price).
 * 7. Replays Partner application submission over HTTP.
 * 8. Cleans up DB test artifacts.
 */

const path = require('path');
const http = require('http');

require('dotenv').config({ path: path.resolve(__dirname, '../../backend/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const app = require('../../backend/server');
const { getPool } = require('../../api/_lib/db');
const { createProofToken } = require('../../api/_lib/session');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
  }
}

async function runParityTests() {
  console.log('====================================================');
  console.log('STARTING EXPRESS SERVER PARITY INTEGRATION SUITE');
  console.log('====================================================\n');

  const pool = getPool();
  const testEmail = `parity_${Date.now()}@testparity.com`;
  const testPassword = 'P@ssword123!';
  const testPhone = '09179998877';
  let sessionCookie = '';
  let server = null;
  let baseUrl = '';

  try {
    // 1. Start Server on ephemeral port
    server = await new Promise((resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
      s.on('error', reject);
    });
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`Express test server listening on ${baseUrl}`);

    // Clean up any stale user with this email
    await pool.query('DELETE FROM users WHERE email_address = $1;', [testEmail]);

    // 2. Health Endpoint
    console.log('\n--- 1. Health Endpoint over HTTP ---');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthJson = await healthRes.json();
    assert(healthRes.status === 200, 'GET /api/health responds with HTTP 200');
    assert(healthJson.status === 'ok', 'Health status is ok');
    assert(healthJson.database === 'connected', 'Database reported connected');

    // 3. Register over HTTP
    console.log('\n--- 2. Register with Proof Token over HTTP ---');
    const otpRes = await pool.query(`
      INSERT INTO otp_verifications (email_address, purpose, otp_code_hash, resend_available_at, expires_at, verified_at)
      VALUES ($1, 'register', 'mock_hash', NOW(), NOW() + INTERVAL '10 minutes', NOW())
      RETURNING id;
    `, [testEmail]);
    const otpId = otpRes.rows[0].id;

    const registerProofToken = createProofToken({
      email: testEmail,
      purpose: 'register',
      otpId: otpId,
      expMinutes: 10
    });

    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Parity Test User',
        email: testEmail,
        password: testPassword,
        contact: testPhone,
        proofToken: registerProofToken
      })
    });
    const regJson = await regRes.json();
    assert(regRes.status === 201, 'POST /api/auth/register responds with HTTP 201');
    assert(regJson.success === true, 'User registration succeeded');

    // 4. Login & Cookie Extraction over HTTP
    console.log('\n--- 3. Login & Cookie Generation over HTTP ---');
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });
    const loginJson = await loginRes.json();
    assert(loginRes.status === 200, 'POST /api/auth/login responds with HTTP 200');
    assert(loginJson.success === true, 'Login successful');

    const rawCookie = loginRes.headers.get('set-cookie');
    assert(!!rawCookie && rawCookie.includes('weBakeSessionToken='), 'Login sets weBakeSessionToken Set-Cookie header');
    sessionCookie = (rawCookie || '').split(';')[0];

    // 5. Auth Sync: Session Guarding over HTTP
    console.log('\n--- 4. Session-Guarded /api/auth/sync over HTTP ---');
    const unauthSyncRes = await fetch(`${baseUrl}/api/auth/sync`);
    assert(unauthSyncRes.status === 401, 'Unauthenticated GET /api/auth/sync returns HTTP 401');

    const authSyncRes = await fetch(`${baseUrl}/api/auth/sync`, {
      headers: { 'Cookie': sessionCookie }
    });
    const authSyncJson = await authSyncRes.json();
    assert(authSyncRes.status === 200, 'Authenticated GET /api/auth/sync returns HTTP 200');
    assert(authSyncJson.user?.email === testEmail, 'User profile returned for valid session');

    // 6. Cart Sync: Session Guarding & Persistence over HTTP
    console.log('\n--- 5. Session-Guarded /api/cart/sync over HTTP ---');
    const unauthCartRes = await fetch(`${baseUrl}/api/cart/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: 1, quantity: 2 }] })
    });
    assert(unauthCartRes.status === 401, 'Unauthenticated POST /api/cart/sync returns HTTP 401');

    const authCartRes = await fetch(`${baseUrl}/api/cart/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      },
      body: JSON.stringify({
        cart: [
          { productId: 1, qty: 3 },
          { productId: 2, qty: 1 }
        ]
      })
    });
    const authCartJson = await authCartRes.json();
    assert(authCartRes.status === 200, 'Authenticated POST /api/cart/sync returns HTTP 200');
    assert(authCartJson.success === true, 'Cart saved successfully');

    const getCartRes = await fetch(`${baseUrl}/api/cart/sync`, {
      headers: { 'Cookie': sessionCookie }
    });
    const getCartJson = await getCartRes.json();
    assert(getCartRes.status === 200, 'GET /api/cart/sync returns HTTP 200');
    assert(Array.isArray(getCartJson.cart) && getCartJson.cart.length === 2, 'Retrieved saved cart items');

    // 7. Order Server-Side Pricing & Anti-Tamper over HTTP
    console.log('\n--- 6. Server-Side Catalog Pricing & Anti-Tamper over HTTP ---');
    // Fetch products catalog via /api/products
    const prodsRes = await fetch(`${baseUrl}/api/products`);
    const prodsJson = await prodsRes.json();
    assert(prodsRes.status === 200, 'GET /api/products responds with HTTP 200');
    const targetProduct = prodsJson.products[0];
    const realPrice = targetProduct.price;

    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      },
      body: JSON.stringify({
        customer: {
          name: 'Parity Test Customer',
          email: testEmail,
          contact: testPhone,
          address: '123 Test Street, Bulacan',
          deliveryDate: '2026-10-15',
          deliveryTime: 'morning'
        },
        items: [
          {
            id: targetProduct.id,
            name: 'Tampered Item',
            price: 1.00, // Tampered client price!
            quantity: 2
          }
        ],
        subtotal: 2.00, // Tampered
        deliveryFee: 100.00, // Tampered
        total: 102.00, // Tampered
        paymentMethod: 'gcash'
      })
    });
    const orderJson = await orderRes.json();
    assert(orderRes.status === 201, 'POST /api/orders responds with HTTP 201');
    assert(orderJson.success === true, 'Order created successfully');

    const expectedSubtotal = realPrice * 2;
    const expectedDownpayment = Math.round((expectedSubtotal * 0.5) * 100) / 100;
    assert(orderJson.grandTotal === expectedSubtotal, `Server recalculated grand total strictly from DB (₱${expectedSubtotal})`);
    assert(orderJson.downpaymentRequired === expectedDownpayment, `Server calculated 50% downpayment (₱${expectedDownpayment})`);

    // Clean up created order
    if (orderJson.orderId) {
      await pool.query('DELETE FROM order_items WHERE order_id = (SELECT id FROM orders WHERE order_code = $1);', [orderJson.orderId]);
      await pool.query('DELETE FROM orders WHERE order_code = $1;', [orderJson.orderId]);
    }

    // 8. Partner Application Submission over HTTP
    console.log('\n--- 7. Partner Application Submission over HTTP ---');
    const partnerRes = await fetch(`${baseUrl}/api/partner/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      },
      body: JSON.stringify({
        fullName: 'Parity Partner',
        email: testEmail,
        phone: testPhone,
        businessName: 'Parity Bakery Store',
        businessType: 'bakery',
        yearsInOperation: '2-3 years',
        weeklyVolume: '100-200 bundles',
        address: '456 Business Road, Bulacan',
        products: ['Mamon', 'Spanish Bread']
      })
    });
    const partnerJson = await partnerRes.json();
    assert(partnerRes.status === 201, 'POST /api/partner/apply responds with HTTP 201');
    assert(partnerJson.success === true, 'Partner application submitted');
    assert(typeof partnerJson.applicationCode === 'string' && partnerJson.applicationCode.startsWith('WB-PRT-'), 'Partner application assigned WB-PRT- code');

  } catch (err) {
    console.error('Test suite error:', err);
    assert(false, `Unexpected error during parity suite: ${err.message}`);
  } finally {
    // DB Clean up
    console.log('\nCleaning up parity test DB artifacts...');
    try {
      const uRes = await pool.query('SELECT id FROM users WHERE email_address = $1;', [testEmail]);
      if (uRes.rows.length > 0) {
        const uid = uRes.rows[0].id;
        await pool.query('DELETE FROM partner_applications WHERE user_id = $1;', [uid]);
        await pool.query('DELETE FROM users WHERE id = $1;', [uid]);
      }
    } catch (e) {
      console.warn('DB cleanup warning:', e.message);
    }

    if (server) {
      await new Promise(r => server.close(r));
    }
  }

  console.log('\n====================================================');
  console.log(`EXPRESS PARITY RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log('====================================================');

  if (passedTests !== totalTests || totalTests === 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runParityTests();
