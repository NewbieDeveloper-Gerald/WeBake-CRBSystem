const path = require('path');
require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const { getPool } = require('../api/_lib/db');
const partnerHandler = require('../api/partner/index');
const syncHandler = require('../api/auth/sync');

const { createSessionToken } = require('../api/_lib/session');

function mockReqRes(options) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: options.headers || {},
    body: options.body || {},
    query: options.query || {},
    cookies: options.cookies || {}
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end(data) {
      this.body = data;
      return this;
    }
  };

  return { req, res };
}

async function runTests() {
  const pool = getPool();
  console.log('=== VERIFYING PARTNER APPLICATION SUBMISSION & USER ACCOUNT LINKING ===\n');

  const testEmail = `testpartner_${Date.now()}@gmail.com`;
  const testPhone = '09' + Math.floor(100000000 + Math.random() * 900000000);
  const testName = 'Test Partner User';
  let userId = null;
  let applicationCode = null;

  try {
    // 1. Create a registered test user
    const userRes = await pool.query(
      `INSERT INTO users (role_id, full_name, email_address, contact_number, password_hash)
       VALUES (1, $1, $2, $3, 'hashed_test_password')
       RETURNING id, full_name, email_address, contact_number, partner_status;`,
      [testName, testEmail, testPhone]
    );
    userId = userRes.rows[0].id;
    console.log(`✓ [PASS] Test user created (ID: ${userId}, Email: ${testEmail})`);

    const sessionToken = createSessionToken({ uid: userId, email: testEmail, role: 'customer' });

    // 2. Submit a partner application via /api/partner (handleApply) with field names used by form
    const { req: applyReq, res: applyRes } = mockReqRes({
      method: 'POST',
      url: '/apply',
      headers: { cookie: `weBakeSessionToken=${sessionToken}` },
      body: {
        fullName: testName,
        email: testEmail,
        phone: testPhone,
        businessName: "Gerald's Sweet Bakery",
        businessType: 'Bakery',
        yearsInOperation: '2 years',
        weeklyVolume: '50-100 bundles',
        address: '123 Baker Street, QC',
        products: ['Mamon', 'Otap'],
        notes: 'Interested in daily delivery'
      }
    });

    await partnerHandler(applyReq, applyRes);

    if ((applyRes.statusCode === 200 || applyRes.statusCode === 201) && applyRes.body && applyRes.body.success) {
      applicationCode = applyRes.body.applicationCode;
      console.log(`✓ [PASS] Partner application submitted successfully (Code: ${applicationCode}, Status: ${applyRes.body.status})`);
    } else {
      console.error(`✗ [FAIL] Partner application failed with status ${applyRes.statusCode}:`, applyRes.body);
      process.exit(1);
    }

    // 3. Verify user table was updated with partner_status = 'pending'
    const updatedUserRes = await pool.query(`SELECT partner_status FROM users WHERE id = $1;`, [userId]);
    const userPartnerStatus = updatedUserRes.rows[0]?.partner_status;
    if (userPartnerStatus === 'pending') {
      console.log(`✓ [PASS] User's partner_status updated to 'pending' in database`);
    } else {
      console.error(`✗ [FAIL] User's partner_status is '${userPartnerStatus}' instead of 'pending'`);
      process.exit(1);
    }

    // 4. Verify auth sync returns partner details
    const { req: syncReq, res: syncRes } = mockReqRes({
      method: 'GET',
      url: `/sync?email=${encodeURIComponent(testEmail)}`,
      query: { email: testEmail },
      headers: { cookie: `weBakeSessionToken=${sessionToken}` }
    });

    await syncHandler(syncReq, syncRes);

    if (syncRes.statusCode === 200 && syncRes.body?.success && syncRes.body?.user) {
      const u = syncRes.body.user;
      console.log(`✓ [PASS] /api/auth/sync returned user profile`);
      if (u.partnerStatus === 'pending') {
        console.log(`✓ [PASS] sync returned partnerStatus: 'pending'`);
      } else {
        console.error(`✗ [FAIL] sync returned partnerStatus: '${u.partnerStatus}'`);
        process.exit(1);
      }

      if (u.partnerAppId === applicationCode) {
        console.log(`✓ [PASS] sync returned partnerAppId: '${u.partnerAppId}' matching application code`);
      } else {
        console.error(`✗ [FAIL] sync returned partnerAppId: '${u.partnerAppId}' expected '${applicationCode}'`);
        process.exit(1);
      }

      if (u.partnerDetails && (u.partnerDetails['bakery-name'] === "Gerald's Sweet Bakery" || u.partnerDetails['business-name'] === "Gerald's Sweet Bakery")) {
        console.log(`✓ [PASS] sync returned complete partnerDetails with bakery-name / business-name`);
      } else {
        console.error(`✗ [FAIL] sync returned invalid partnerDetails:`, u.partnerDetails);
        process.exit(1);
      }
    } else {
      console.error(`✗ [FAIL] /api/auth/sync failed:`, syncRes.body);
      process.exit(1);
    }

    // 5. Test updating the application (re-submitting with modified address/products)
    const { req: updateReq, res: updateRes } = mockReqRes({
      method: 'POST',
      url: '/apply',
      headers: { cookie: `weBakeSessionToken=${sessionToken}` },
      body: {
        fullName: testName,
        email: testEmail,
        phone: testPhone,
        businessName: "Gerald's Sweet Bakery & Cafe",
        businessType: 'Bakery',
        yearsInOperation: '3 years',
        weeklyVolume: '100-200 bundles',
        address: '456 New Bakery Ave, QC',
        products: ['Mamon', 'Otap', 'Eggnog'],
        notes: 'Updated wholesale order request'
      }
    });

    await partnerHandler(updateReq, updateRes);

    if ((updateRes.statusCode === 200 || updateRes.statusCode === 201) && updateRes.body?.success) {
      console.log(`✓ [PASS] Existing application updated (Code: ${updateRes.body.applicationCode})`);
    } else {
      console.error(`✗ [FAIL] Updating existing application failed:`, updateRes.body);
      process.exit(1);
    }

    // Verify row count in partner_applications is still 1 (not duplicated)
    const countRes = await pool.query(`SELECT COUNT(*) FROM partner_applications WHERE applicant_email = $1;`, [testEmail]);
    if (parseInt(countRes.rows[0].count, 10) === 1) {
      console.log(`✓ [PASS] Application updated in-place without creating duplicate rows (Count: 1)`);
    } else {
      console.error(`✗ [FAIL] Duplicate applications created: count is ${countRes.rows[0].count}`);
      process.exit(1);
    }

    console.log('\n=== ALL PARTNER SUBMISSION & ACCOUNT SYNC TESTS PASSED! ===');
  } finally {
    // Cleanup
    if (testEmail) {
      await pool.query(`DELETE FROM partner_applications WHERE applicant_email = $1;`, [testEmail]).catch(() => {});
      await pool.query(`DELETE FROM users WHERE email_address = $1;`, [testEmail]).catch(() => {});
      console.log('Cleaned up test user & partner application.');
    }
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
