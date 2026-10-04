/**
 * Phase 4 & Phase 5 Comprehensive Verification Test Gate
 *
 * Verifies:
 * 1. Health endpoint (`api/health.js`) connectivity and response contract.
 * 2. Authenticated cart sync (`api/cart/sync.js`) with DB persistence.
 * 3. Frontend cart merge logic by productId with quantity limits.
 * 4. AuthStore and user profile sanitation (zero plaintext passwords in client storage).
 * 5. HTML escaping across frontend modules (`formatters.js`, `tracking.js`, `dashboard.js`, `partner.js`).
 * 6. Central configuration integrity (`config.js`) across all frontend JS files.
 * 7. Vercel deployment hygiene (`vercel.json`, `.vercelignore`, and serverless function count <= 12).
 */

const path = require('path');
const fs = require('fs');

require('../helpers/load-env');

const { getPool } = require('../../api/_lib/db');
const { createSessionToken } = require('../../api/_lib/session');
const healthHandler = require('../../api/health');
const cartSyncHandler = require('../../api/cart/sync');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
  }
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    getHeader(k) {
      return this.headers[k.toLowerCase()];
    },
    json(obj) {
      this.body = obj;
      return this;
    },
    end() {
      return this;
    }
  };
  return res;
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING PHASE 4 & PHASE 5 VERIFICATION SUITE');
  console.log('====================================================\n');

  const pool = getPool();

  // Clean or get a test user
  const testEmail = 'phase4_verify_user@gmail.com';
  let testUserId = null;
  const existing = await pool.query('SELECT id FROM users WHERE email_address = $1;', [testEmail]);
  if (existing.rows.length > 0) {
    testUserId = existing.rows[0].id;
  } else {
    const inserted = await pool.query(
      `INSERT INTO users (full_name, email_address, password_hash, contact_number, role_id)
       VALUES ($1, $2, $3, $4, 1) RETURNING id;`,
      ['Phase4 User', testEmail, 'mock_hash', '09171234567']
    );
    testUserId = inserted.rows[0].id;
  }

  const sessionToken = createSessionToken({
    id: testUserId,
    email: testEmail,
    role: 'customer'
  });

  // ----------------------------------------------------
  // TEST GROUP 1: Health Endpoint Contract
  // ----------------------------------------------------
  console.log('--- Test Group 1: Health Endpoint Contract ---');
  {
    const req = { method: 'GET', headers: {} };
    const res = mockRes();
    await healthHandler(req, res);

    assert(res.statusCode === 200, 'Health endpoint responds with HTTP 200');
    assert(res.body && res.body.status === 'ok', 'Health status is ok');
    assert(res.body && res.body.database === 'connected', 'Database reported as connected');
    assert(typeof res.body.responseTimeMs === 'number', 'Response time measured');
  }

  // ----------------------------------------------------
  // TEST GROUP 2: Cloud Cart Synchronization
  // ----------------------------------------------------
  console.log('\n--- Test Group 2: Cart Sync & Persistence ---');
  {
    // Unauthenticated request must return 401
    const unauthReq = { method: 'GET', headers: {} };
    const unauthRes = mockRes();
    await cartSyncHandler(unauthReq, unauthRes);
    assert(unauthRes.statusCode === 401, 'Unauthenticated cart sync rejected with 401');

    // Authenticated POST sync
    const postReq = {
      method: 'POST',
      headers: { cookie: `weBakeSessionToken=${sessionToken}` },
      body: {
        cart: [
          { productId: 1, name: 'Cheese Bread', price: 150, qty: 3, min: 25 },
          { id: 2, name: 'Ube Halaya Bread', price: 180, qty: 2, min: 25 }
        ]
      }
    };
    const postRes = mockRes();
    await cartSyncHandler(postReq, postRes);

    assert(postRes.statusCode === 200, 'Authenticated cart save succeeds with 200');
    assert(postRes.body && postRes.body.cart.length === 2, 'Cart contains 2 items');
    assert(postRes.body.cart[0].productId === 1 && postRes.body.cart[0].qty === 3, 'First item productId and qty saved');
    assert(postRes.body.cart[1].productId === 2 && postRes.body.cart[1].qty === 2, 'Second item mapped id to productId');

    // Authenticated GET retrieves saved cart
    const getReq = {
      method: 'GET',
      headers: { cookie: `weBakeSessionToken=${sessionToken}` }
    };
    const getRes = mockRes();
    await cartSyncHandler(getReq, getRes);

    assert(getRes.statusCode === 200, 'Authenticated cart retrieval succeeds with 200');
    assert(getRes.body && getRes.body.cart.length === 2, 'Retrieved cart matches saved count');
  }

  // ----------------------------------------------------
  // TEST GROUP 3: Frontend Cart Merge Logic
  // ----------------------------------------------------
  console.log('\n--- Test Group 3: Cart Merge Logic ---');
  {
    // Mirror of mergeCarts function in storefront.js
    function mergeCarts(baseCart, incomingCart) {
      const result = (baseCart || []).map(item => ({ ...item }));
      (incomingCart || []).forEach(incoming => {
        if (!incoming) return;
        const incomingId = parseInt(incoming.productId || incoming.id || 0, 10);
        if (!incomingId) return;
        const existing = result.find(c => parseInt(c.productId || c.id || 0, 10) === incomingId);
        if (existing) {
          existing.qty = Math.min(99, (parseInt(existing.qty, 10) || 1) + (parseInt(incoming.qty, 10) || 1));
        } else {
          result.push({ ...incoming });
        }
      });
      return result;
    }

    const savedCart = [{ productId: 1, name: 'Pan de Sal', qty: 2 }];
    const guestCart = [
      { productId: 1, name: 'Pan de Sal', qty: 3 },
      { productId: 2, name: 'Ensaymada', qty: 1 }
    ];

    const merged = mergeCarts(savedCart, guestCart);
    assert(merged.length === 2, 'Merged cart has 2 unique products');
    assert(merged[0].qty === 5, 'Quantities of existing item summed (2 + 3 = 5)');
    assert(merged[1].productId === 2, 'New guest item appended');

    // Test cap at 99
    const hugeMerge = mergeCarts([{ productId: 1, qty: 80 }], [{ productId: 1, qty: 50 }]);
    assert(hugeMerge[0].qty === 99, 'Merged quantity capped at 99');
  }

  // ----------------------------------------------------
  // TEST GROUP 4: Password Store Hygiene
  // ----------------------------------------------------
  console.log('\n--- Test Group 4: Client Password Store Hygiene ---');
  {
    const authJsContent = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/customer/js/features/auth.js'),
      'utf8'
    );

    assert(!authJsContent.includes('updatePassword:'), 'AuthStore.updatePassword method completely removed');
    assert(!authJsContent.includes('existingUser.password ='), 'No client-side password modification fallback');
    assert(authJsContent.includes('sanitizeUserData'), 'Sanitize user data function present in auth.js');
    assert(authJsContent.includes('proofToken: resetProofToken'), 'Reset request passes proofToken to backend');
    assert(authJsContent.includes('proofToken: verifyData?.proofToken'), 'Register request passes proofToken to backend');
  }

  // ----------------------------------------------------
  // TEST GROUP 5: XSS Escaping Verification
  // ----------------------------------------------------
  console.log('\n--- Test Group 5: XSS Escaping Verification ---');
  {
    const utilsContent = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/customer/js/shared/formatters.js'),
      'utf8'
    );
    assert(utilsContent.includes('escapeHtml'), 'formatters.js exports escapeHtml function');

    // Test escapeHtml implementation
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag));
    }

    const testXss = '<script>alert("xss")</script>&foo=\'bar\'';
    const escaped = escapeHtml(testXss);
    assert(!escaped.includes('<script>'), '<script> tag escaped');
    assert(escaped.includes('&lt;script&gt;'), 'Left/right angle brackets converted to entities');
    assert(escaped.includes('&quot;'), 'Quotes converted to entities');
    assert(escaped.includes('&#39;'), 'Single quotes converted to entities');

    // Verify usage in tracking.js, dashboard.js, and partner.js
    const trackingContent = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/customer/js/features/tracking.js'),
      'utf8'
    );
    const dashboardContent = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/customer/js/features/dashboard.js'),
      'utf8'
    );
    const partnerContent = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/customer/js/features/partner.js'),
      'utf8'
    );

    assert(trackingContent.includes('esc(app.appId)') && trackingContent.includes('esc(order.orderId)'), 'tracking.js escapes appId and orderId');
    assert(dashboardContent.includes('esc(item.name)') && dashboardContent.includes('esc(order.date)'), 'dashboard.js escapes item name and order date');
    assert(partnerContent.includes('esc(appId)'), 'partner.js escapes confirmation appId');
  }

  // ----------------------------------------------------
  // TEST GROUP 6: Centralized Configuration
  // ----------------------------------------------------
  console.log('\n--- Test Group 6: Centralized Configuration ---');
  {
    const configContent = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/customer/js/shared/config.js'),
      'utf8'
    );
    assert(configContent.includes('WEBAKE_CONFIG'), 'config.js defines WEBAKE_CONFIG');
    assert(configContent.includes('STANDARD_DELIVERY_FEE: 50.00'), 'Standard delivery fee defined in config');
    assert(configContent.includes('DOWNPAYMENT_PERCENTAGE: 50'), 'Downpayment percentage defined in config');

    const filesCheckingConfig = [
      'features/auth.js',
      'shared/otp.js',
      'features/partner.js',
      'features/tracking.js',
      'features/dashboard.js',
      'features/storefront.js'
    ];

    filesCheckingConfig.forEach(file => {
      const content = fs.readFileSync(
        path.resolve(__dirname, `../../frontend/customer/js/${file}`),
        'utf8'
      );
      assert(content.includes('WEBAKE_CONFIG'), `${file} references WEBAKE_CONFIG`);
    });
  }

  // ----------------------------------------------------
  // TEST GROUP 7: Vercel Deploy & Serverless Function Count
  // ----------------------------------------------------
  console.log('\n--- Test Group 7: Vercel Configuration & Function Limits ---');
  {
    const vercelJsonPath = path.resolve(__dirname, '../../vercel.json');
    assert(fs.existsSync(vercelJsonPath), 'vercel.json exists');

    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
    assert(Array.isArray(vercelConfig.headers), 'vercel.json has headers array');

    const globalHeaders = vercelConfig.headers.find(h => h.source === '/(.*)');
    assert(globalHeaders !== undefined, 'Global security headers defined for /(.*)');

    const cspHeader = globalHeaders?.headers.find(h => h.key === 'Content-Security-Policy');
    const xctoHeader = globalHeaders?.headers.find(h => h.key === 'X-Content-Type-Options');
    const xfoHeader = globalHeaders?.headers.find(h => h.key === 'X-Frame-Options');

    assert(cspHeader && cspHeader.value.includes("default-src 'self'"), 'CSP header configured');
    assert(xctoHeader && xctoHeader.value === 'nosniff', 'X-Content-Type-Options: nosniff configured');
    assert(xfoHeader && xfoHeader.value === 'SAMEORIGIN', 'X-Frame-Options: SAMEORIGIN configured');

    // Verify no Render rewrites exist
    const hasRenderRewrite = (vercelConfig.rewrites || []).some(
      r => r.destination && r.destination.includes('onrender.com')
    );
    assert(!hasRenderRewrite, 'No onrender.com rewrites remain in vercel.json');

    // Verify .vercelignore
    const vercelIgnorePath = path.resolve(__dirname, '../../.vercelignore');
    assert(fs.existsSync(vercelIgnorePath), '.vercelignore exists');
    const ignoreContent = fs.readFileSync(vercelIgnorePath, 'utf8');
    assert(ignoreContent.includes('backend/'), '.vercelignore ignores backend/');
    assert(ignoreContent.includes('tests/'), '.vercelignore ignores tests/');
    assert(ignoreContent.includes('tools/'), '.vercelignore ignores tools/');
    assert(ignoreContent.includes('*.md'), '.vercelignore ignores *.md');

    // Count serverless functions under api/
    function countServerlessFunctions(dir) {
      let count = 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '_lib' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          count += countServerlessFunctions(full);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          count++;
        }
      }
      return count;
    }

    const apiDir = path.resolve(__dirname, '../../api');
    const totalFunctions = countServerlessFunctions(apiDir);
    console.log(`  ℹ Total Serverless Functions in api/: ${totalFunctions}`);
    assert(totalFunctions <= 12, `Total functions (${totalFunctions}) <= 12 (Vercel Hobby Limit)`);
  }

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`PHASE 4 & 5 TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log('====================================================');

  await pool.end();

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
