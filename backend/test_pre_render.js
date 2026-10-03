/**
 * ====================================================================
 * Pre-Render Deployment Verification Suite
 * Tests every single dependency, credential, and endpoint before
 * pushing to GitHub and deploying to Render.com.
 * ====================================================================
 */

require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const db = require('./database/db');

async function runPreRenderVerification() {
  console.log('===============================================================');
  console.log('🚀 WEBAKE BACKEND — PRE-RENDER DEPLOYMENT VERIFICATION CHECKLIST');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, title, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${title} ${details ? '(' + details + ')' : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  // --- CHECK 1: package.json & Dependencies ---
  console.log('--- 1. Checking package.json & Build Config ---');
  try {
    const pkgPath = path.join(__dirname, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert(pkg.scripts && pkg.scripts.start, 'package.json has "start" script', pkg.scripts?.start);
    assert(pkg.main === 'server.js', 'package.json "main" points to server.js');
    assert(pkg.dependencies && pkg.dependencies.express, 'express dependency present', pkg.dependencies?.express);
    assert(pkg.dependencies && pkg.dependencies.pg, 'pg dependency present', pkg.dependencies?.pg);
    assert(pkg.dependencies && pkg.dependencies.cors, 'cors dependency present', pkg.dependencies?.cors);
    assert(pkg.dependencies && pkg.dependencies.nodemailer, 'nodemailer dependency present', pkg.dependencies?.nodemailer);
    assert(pkg.dependencies && pkg.dependencies.dotenv, 'dotenv dependency present', pkg.dependencies?.dotenv);
  } catch (e) {
    assert(false, 'package.json validation failed', e.message);
  }

  // --- CHECK 2: Environment Variables & Security ---
  console.log('\n--- 2. Checking Environment Variables & .gitignore ---');
  try {
    const gitignorePath = path.join(__dirname, '..', '.gitignore');
    const gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
    assert(gitignoreContent.includes('.env') || gitignoreContent.includes('backend/.env'), '.gitignore protects .env from public exposure');

    assert(!!process.env.GMAIL_USER, 'GMAIL_USER configured', process.env.GMAIL_USER);
    assert(!!process.env.GMAIL_APP_PASS, 'GMAIL_APP_PASS configured');
    assert(!!process.env.DATABASE_URL || !!process.env.DB_HOST, 'Database credentials configured');
  } catch (e) {
    assert(false, 'Environment config validation failed', e.message);
  }

  // --- CHECK 3: Supabase Database Ping & Queries ---
  console.log('\n--- 3. Testing Supabase Database Connectivity ---');
  try {
    const startTime = Date.now();
    const dbPing = await db.ping();
    const latency = Date.now() - startTime;
    assert(dbPing.connected === true, 'Supabase Pooler ping successful', `${latency}ms latency`);
    assert(dbPing.database === 'postgres', 'Database name confirmed: postgres');

    const prodCheck = await db.query('SELECT count(*) FROM products WHERE is_active = true;');
    assert(parseInt(prodCheck.rows[0].count) >= 4, 'Catalog products query succeeds', `${prodCheck.rows[0].count} active products`);

    const orderCheck = await db.query('SELECT count(*) FROM orders;');
    assert(parseInt(orderCheck.rows[0].count) >= 1, 'Orders table query succeeds', `${orderCheck.rows[0].count} orders recorded`);
  } catch (e) {
    assert(false, 'Database test failed', e.message);
  }

  // --- CHECK 4: Nodemailer Gmail SMTP Handshake ---
  console.log('\n--- 4. Testing Nodemailer Gmail SMTP Connection ---');
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: (process.env.GMAIL_APP_PASS || '').replace(/\s+/g, '')
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const isConnected = await transporter.verify();
    assert(isConnected === true, 'Gmail SMTP handshake verified', 'Ready to dispatch receipts & OTPs');
  } catch (e) {
    assert(false, 'Gmail SMTP verification failed', e.message);
  }

  // --- CHECK 5: Express Server Local Endpoints ---
  console.log('\n--- 5. Testing Local Express Server Endpoints (Port 5000) ---');
  function httpGet(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:5000${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, text: data });
          }
        });
      }).on('error', reject);
    });
  }

  try {
    const health = await httpGet('/api/health');
    assert(health.status === 200, 'GET /api/health returned HTTP 200');
    assert(health.body.status === 'healthy', 'Health check reports "healthy" status');
    assert(health.body.database?.connected === true, 'Health check database report confirms Supabase connected');

    const products = await httpGet('/api/products');
    assert(products.status === 200, 'GET /api/products returned HTTP 200');
    assert(products.body.success === true, 'Products API success: true');
    assert(Array.isArray(products.body.products) && products.body.products.length >= 4, 'Products API returned 4 products');

    const categories = await httpGet('/api/products/categories');
    assert(categories.status === 200, 'GET /api/products/categories returned HTTP 200');
    assert(categories.body.categories?.length >= 4, 'Categories API returned 4 categories');
  } catch (e) {
    assert(false, 'Express endpoint tests failed (Is server running?)', e.message);
  }

  console.log('\n===============================================================');
  console.log(`SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================');

  if (failed === 0) {
    console.log('\n🎉 ALL PRE-RENDER CHECKS PASSED! YOUR BACKEND IS 100% READY FOR RENDER.');
    process.exit(0);
  } else {
    console.error('\n⚠️ SOME CHECKS FAILED. Please resolve before deploying.');
    process.exit(1);
  }
}

runPreRenderVerification();
