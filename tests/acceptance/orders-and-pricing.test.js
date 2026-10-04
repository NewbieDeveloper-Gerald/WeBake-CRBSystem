/**
 * Phase 3 Acceptance Verification Test Suite
 * Tests Products catalog, Order creation & pricing integrity, Idempotency, Cancellation table, Receipt resend, and Partner integrity
 */
const path = require('path');
require('../helpers/load-env');
const { getPool } = require('../../api/_lib/db');
const { createSessionToken, createProofToken } = require('../../api/_lib/session');

const pool = getPool();

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

async function runPhase3Tests() {
  console.log('=== STARTING PHASE 3 ORDERS & MONEY INTEGRITY ACCEPTANCE TESTS ===\n');
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

  const productsHandler = require('../../api/products/index');
  const ordersHandler = require('../../api/orders/index');
  const partnerHandler = require('../../api/partner/index');

  // --- TEST 1: Products Catalog & Settings ---
  console.log('1. Read-Only Products Catalog & Store Settings (Step 3.1)');
  const prodReq = mockReqRes({ method: 'GET' });
  await productsHandler(prodReq.req, prodReq.res);
  const prodData = prodReq.getData();

  assert(prodReq.getStatus() === 200, 'GET /api/products returns 200');
  assert(Array.isArray(prodData?.products) && prodData.products.length >= 4, 'Catalog returns active products');
  assert(prodData?.settings?.standardDeliveryFee === 50 && prodData?.settings?.downpaymentPercentage === 50, 'Store settings returns delivery fee 50 and downpayment 50%');

  // --- TEST 2: Pricing & Catalog Integrity (Step 3.1) ---
  console.log('\n2. Server-Side Catalog & Pricing Integrity (Step 3.1)');
  const testEmail = `phase3_cust_${Date.now()}@example.com`;

  // Seed an OTP record in DB for checkout verification
  const otpRes = await pool.query(`
    INSERT INTO otp_verifications (email_address, purpose, otp_code_hash, resend_available_at, expires_at, verified_at)
    VALUES ($1, 'checkout', 'mock_hash', NOW(), NOW() + INTERVAL '10 minutes', NOW())
    RETURNING id;
  `, [testEmail]);
  const otpId = otpRes.rows[0].id;
  const checkoutProofToken = createProofToken({ email: testEmail, purpose: 'checkout', otpId });

  // 2a. Unknown product ID with valid proof token => 400
  const unknownProdReq = mockReqRes({
    method: 'POST',
    body: {
      items: [{ productId: 999999, qty: 1 }],
      proofToken: checkoutProofToken,
      customer: {
        fullName: 'Test Customer',
        email: testEmail,
        phone: '09123456789',
        address: '123 Test St, Marilao',
        deliveryDate: new Date().toISOString().slice(0, 10)
      }
    }
  });
  await ordersHandler(unknownProdReq.req, unknownProdReq.res);
  assert(unknownProdReq.getStatus() === 400, 'Unknown product ID returns 400 rejected');

  // 2b. Guest checkout without proof token => 401
  const guestNoProofReq = mockReqRes({
    method: 'POST',
    body: {
      items: [{ productId: 1, qty: 2 }],
      customer: {
        fullName: 'Test Customer',
        email: testEmail,
        phone: '09123456789',
        address: '123 Test St, Marilao',
        deliveryDate: new Date().toISOString().slice(0, 10)
      }
    }
  });
  await ordersHandler(guestNoProofReq.req, guestNoProofReq.res);
  assert(guestNoProofReq.getStatus() === 401, 'Guest checkout without proof token returns 401');

  // 2c. Tampered price & total in body is ignored, server computes authoritative totals
  // 2 bundles of Mamon (₱105 each) = ₱210 subtotal (delivery fee is handled outside system: grand total = ₱210, ₱105 downpayment, ₱105 balance)
  const testIdempKey = `idemp_key_${Date.now()}_abc`;
  const tamperedOrderReq = mockReqRes({
    method: 'POST',
    headers: { 'idempotency-key': testIdempKey },
    body: {
      items: [{ productId: 1, qty: 2, price: 5, total: 10 }], // Tampered prices
      customer: {
        fullName: 'Test Customer',
        email: testEmail,
        phone: '09123456789',
        address: '123 Test St, Marilao',
        deliveryDate: new Date().toISOString().slice(0, 10)
      },
      paymentMethod: 'GCash',
      referenceNumber: '1000123456789',
      proofToken: checkoutProofToken,
      total: 10, // Tampered total
      downpayment: 5,
      balance: 5
    }
  });
  await ordersHandler(tamperedOrderReq.req, tamperedOrderReq.res);
  const createdOrder = tamperedOrderReq.getData();

  assert(tamperedOrderReq.getStatus() === 201, 'Valid order creation returns 201');
  assert(createdOrder?.subtotal === 210.00, 'Server computed correct subtotal (₱210) ignoring tampered client price');
  assert(createdOrder?.deliveryFee === 0.00, 'Server delivery fee is 0.00 (handled outside system)');
  assert(createdOrder?.grandTotal === 210.00, 'Server computed grand total = subtotal (₱210, no delivery fee)');
  assert(createdOrder?.downpaymentRequired === 105.00, 'Server computed 50% downpayment (₱105)');
  assert(createdOrder?.balanceDue === 105.00, 'Server computed balance due (₱105)');

  const createdOrderCode = createdOrder?.orderId;
  const createdDbId = createdOrder?.databaseId;

  // --- TEST 3: Idempotency Key (Step 3.2) ---
  console.log('\n3. Idempotency Key Prevents Duplicate Orders (Step 3.2)');
  const duplicateReq = mockReqRes({
    method: 'POST',
    headers: { 'idempotency-key': testIdempKey },
    body: {
      items: [{ productId: 1, qty: 2 }],
      customer: {
        fullName: 'Test Customer',
        email: testEmail,
        phone: '09123456789',
        address: '123 Test St, Marilao',
        deliveryDate: new Date().toISOString().slice(0, 10)
      }
    }
  });
  await ordersHandler(duplicateReq.req, duplicateReq.res);
  const dupData = duplicateReq.getData();

  assert(duplicateReq.getStatus() === 200 && dupData?.duplicate === true, 'Duplicate request with same idempotency key returns 200 with duplicate: true');
  assert(dupData?.orderId === createdOrderCode, 'Returned order code matches original order code');

  // Verify DB count has exactly 1 order with this idempotency key
  const countRes = await pool.query('SELECT count(*)::int AS count FROM orders WHERE idempotency_key = $1;', [testIdempKey]);
  assert(countRes.rows[0].count === 1, 'Database contains exactly 1 order row for this idempotency key');

  // --- TEST 4: Receipt Resend Hardening (Step 3.5) ---
  console.log('\n4. Receipt Resend & Rate Limiting (Step 3.5)');
  // 4a. Resend without authorization / wrong contact => 404
  const receiptWrongContact = mockReqRes({
    method: 'POST',
    query: { action: 'receipt' },
    body: { orderId: createdOrderCode, contact: '09000000000' }
  });
  await ordersHandler(receiptWrongContact.req, receiptWrongContact.res);
  assert(receiptWrongContact.getStatus() === 404, 'Receipt resend with wrong contact returns 404');

  // 4b. Resend with matching email succeeds
  const receiptSuccess1 = mockReqRes({
    method: 'POST',
    query: { action: 'receipt' },
    body: { orderId: createdOrderCode, email: testEmail }
  });
  await ordersHandler(receiptSuccess1.req, receiptSuccess1.res);
  assert(receiptSuccess1.getStatus() === 200, 'Receipt resend with matching email returns 200');

  // 4c. Rate limit: 2nd and 3rd succeed, 4th resend is refused with 429 (Step 3.5)
  const receiptSuccess2 = mockReqRes({
    method: 'POST',
    query: { action: 'receipt' },
    body: { orderId: createdOrderCode, email: testEmail }
  });
  await ordersHandler(receiptSuccess2.req, receiptSuccess2.res);

  const receiptSuccess3 = mockReqRes({
    method: 'POST',
    query: { action: 'receipt' },
    body: { orderId: createdOrderCode, email: testEmail }
  });
  await ordersHandler(receiptSuccess3.req, receiptSuccess3.res);

  const receiptRateLimited = mockReqRes({
    method: 'POST',
    query: { action: 'receipt' },
    body: { orderId: createdOrderCode, email: testEmail }
  });
  await ordersHandler(receiptRateLimited.req, receiptRateLimited.res);
  assert(receiptRateLimited.getStatus() === 429, '4th receipt resend within an hour is rate-limited (429)');

  // --- TEST 5: Order Cancellation & Cancellation Requests Table (Step 3.4) ---
  console.log('\n5. Order Cancellation & cancellation_requests Table (Step 3.4)');
  // 5a. Set status to 'delivered' and try to cancel => rejected with 400
  await pool.query("UPDATE orders SET status = 'delivered' WHERE id = $1;", [createdDbId]);
  const cancelDelivered = mockReqRes({
    method: 'POST',
    query: { action: 'cancel' },
    body: { orderId: createdOrderCode, email: testEmail }
  });
  await ordersHandler(cancelDelivered.req, cancelDelivered.res);
  assert(cancelDelivered.getStatus() === 400, 'Delivered order cannot be cancelled (returns 400)');

  // 5b. Reset to 'pending' and cancel with refund details => succeeds
  await pool.query("UPDATE orders SET status = 'pending' WHERE id = $1;", [createdDbId]);
  const cancelSuccess = mockReqRes({
    method: 'POST',
    query: { action: 'cancel' },
    body: {
      orderId: createdOrderCode,
      email: testEmail,
      refundDetails: {
        wallet: 'GCash',
        accountNum: '09123456789',
        accountName: 'Test Customer',
        reason: 'Event rescheduled'
      }
    }
  });
  await ordersHandler(cancelSuccess.req, cancelSuccess.res);
  assert(cancelSuccess.getStatus() === 200 && cancelSuccess.getData()?.status === 'cancellation_requested', 'Pending order cancelled successfully');

  // Verify cancellation_requests row in DB
  const cancelRowRes = await pool.query('SELECT order_id, refund_channel, eligible_refund_amount, status FROM cancellation_requests WHERE order_id = $1;', [createdDbId]);
  assert(cancelRowRes.rows.length === 1 && parseFloat(cancelRowRes.rows[0].eligible_refund_amount) === 105.00, 'Row created in cancellation_requests table with server-side downpayment (₱105)');

  // 5c. Second cancellation request on same order => 400
  const cancelDuplicate = mockReqRes({
    method: 'POST',
    query: { action: 'cancel' },
    body: { orderId: createdOrderCode, email: testEmail }
  });
  await ordersHandler(cancelDuplicate.req, cancelDuplicate.res);
  assert(cancelDuplicate.getStatus() === 400, 'Second cancellation request rejected with 400');

  // --- TEST 6: Partner Integrity (Step 3.6) ---
  console.log('\n6. Partner Application Integrity (Step 3.6)');
  const partnerEmail = `partner_${Date.now()}@example.com`;
  const strangerEmail = `stranger_${Date.now()}@example.com`;

  const u1Res = await pool.query(`
    INSERT INTO users (full_name, email_address, contact_number, password_hash, role_id)
    VALUES ('Partner User', $1, '09187654321', 'mock_hash', 1)
    RETURNING id;
  `, [partnerEmail]);
  const u1Id = u1Res.rows[0].id;
  const partnerUserToken = createSessionToken({ id: u1Id, email: partnerEmail, role_name: 'customer', full_name: 'Partner User' });

  const u2Res = await pool.query(`
    INSERT INTO users (full_name, email_address, contact_number, password_hash, role_id)
    VALUES ('Stranger', $1, '09199999999', 'mock_hash', 1)
    RETURNING id;
  `, [strangerEmail]);
  const u2Id = u2Res.rows[0].id;
  const strangerToken = createSessionToken({ id: u2Id, email: strangerEmail, role_name: 'customer', full_name: 'Stranger' });

  // 6a. Apply for partnership
  const partnerApply = mockReqRes({
    method: 'POST',
    headers: { authorization: `Bearer ${partnerUserToken}` },
    body: {
      fullName: 'Partner User',
      email: partnerEmail,
      phone: '09187654321',
      businessName: 'Bulacan Sweet Bakery',
      businessType: 'sari_sari',
      yearsInOperation: '3 years',
      weeklyVolume: '100-200 bundles',
      address: '456 Market St, Marilao',
      products: ['Mamon', 'Otap']
    }
  });
  await partnerHandler(partnerApply.req, partnerApply.res);
  const partnerData = partnerApply.getData();
  assert(partnerApply.getStatus() === 201 && partnerData?.applicationCode?.startsWith('WB-PRT-'), 'Partner application created with WB-PRT- code');

  // 6b. Another user trying to overwrite with same phone/email => 403
  const partnerHijack = mockReqRes({
    method: 'POST',
    headers: { authorization: `Bearer ${strangerToken}` },
    body: {
      fullName: 'Stranger',
      email: partnerEmail, // targeting partner's email
      phone: '09187654321',
      businessName: 'Hijacked Store',
      businessType: 'cafe',
      yearsInOperation: '1 year',
      weeklyVolume: '50 bundles',
      address: '789 Other St',
      products: ['Mamon']
    }
  });
  await partnerHandler(partnerHijack.req, partnerHijack.res);
  assert(partnerHijack.getStatus() === 403, 'Another user cannot overwrite existing application (403)');

  // 6c. Approved partner application re-submit does not downgrade status to pending (Fixes H8)
  await pool.query("UPDATE partner_applications SET status = 'approved' WHERE application_code = $1;", [partnerData.applicationCode]);
  const partnerUpdate = mockReqRes({
    method: 'POST',
    headers: { authorization: `Bearer ${partnerUserToken}` },
    body: {
      fullName: 'Partner User Updated',
      email: partnerEmail,
      phone: '09187654321',
      businessName: 'Bulacan Sweet Bakery Updated',
      businessType: 'sari_sari',
      yearsInOperation: '4 years',
      weeklyVolume: '200+ bundles',
      address: '456 Market St, Marilao',
      products: ['Mamon', 'Otap', 'Buttertoast']
    }
  });
  await partnerHandler(partnerUpdate.req, partnerUpdate.res);
  assert(partnerUpdate.getStatus() === 201 && partnerUpdate.getData()?.status === 'approved', 'Re-submitting application preserves approved status and does not downgrade to pending');

  // --- CLEANUP ---
  console.log('\nCleaning up Phase 3 test data...');
  await pool.query('DELETE FROM cancellation_requests WHERE order_id = $1;', [createdDbId]);
  await pool.query('DELETE FROM order_items WHERE order_id = $1;', [createdDbId]);
  await pool.query('DELETE FROM payments WHERE order_id = $1;', [createdDbId]);
  await pool.query('DELETE FROM order_status_history WHERE order_id = $1;', [createdDbId]);
  await pool.query('DELETE FROM orders WHERE id = $1;', [createdDbId]);
  await pool.query('DELETE FROM otp_verifications WHERE email_address = $1;', [testEmail]);
  await pool.query('DELETE FROM partner_applications WHERE application_code = $1;', [partnerData?.applicationCode]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2);', [u1Id, u2Id]);

  console.log(`\n=== PHASE 3 TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  await pool.end();

  if (failed > 0) process.exit(1);
}

runPhase3Tests().catch(err => {
  console.error('Phase 3 Test Execution Error:', err);
  process.exit(1);
});
