/**
 * ====================================================================
 * WeBake - Backend API Server (Node.js & Express)
 * Crumbs N' Rolls Bakery — Core Service
 * Connected to Supabase PostgreSQL Database
 * Mounts tested Serverless Handlers from /api for 100% cloud/local parity
 * ====================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');

// API Handlers (Shared between Vercel Serverless and Local Express)
const healthHandler = require('../api/health');
const authCheckHandler = require('../api/auth/check');
const authLoginHandler = require('../api/auth/login');
const authRegisterHandler = require('../api/auth/register');
const authResetHandler = require('../api/auth/reset');
const authSyncHandler = require('../api/auth/sync');
const cartSyncHandler = require('../api/cart/sync');
const ordersHandler = require('../api/orders/index');
const otpHandler = require('../api/otp/index');
const partnerHandler = require('../api/partner/index');
const productsHandler = require('../api/products/index');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration (Allows frontend requests from local dev or deployment)
app.use(cors({
  origin: (origin, callback) => {
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key']
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to adapt Express req to serverless handler
function adapt(handler, actionParam = null) {
  return async (req, res, next) => {
    try {
      if (actionParam && req.params[actionParam]) {
        req.query = req.query || {};
        req.query.action = req.params[actionParam];
      }
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };
}

// Health Check
app.all('/api/health', adapt(healthHandler));

// Auth endpoints
app.all('/api/auth/check', adapt(authCheckHandler));
app.all('/api/auth/login', adapt(authLoginHandler));
app.all('/api/auth/register', adapt(authRegisterHandler));
app.all('/api/auth/reset', adapt(authResetHandler));
app.all('/api/auth/sync', adapt(authSyncHandler));

// Cart endpoint
app.all('/api/cart/sync', adapt(cartSyncHandler));

// Products endpoint
app.all('/api/products', adapt(productsHandler));

// OTP endpoints (supports /api/otp and /api/otp/:action)
app.all('/api/otp/:action', adapt(otpHandler, 'action'));
app.all('/api/otp', adapt(otpHandler));

// Orders endpoints (supports /api/orders and /api/orders/:action)
app.all('/api/orders/:action', adapt(ordersHandler, 'action'));
app.all('/api/orders', adapt(ordersHandler));

// Partner endpoints (supports /api/partner and /api/partner/:action)
app.all('/api/partner/:action', adapt(partnerHandler, 'action'));
app.all('/api/partner', adapt(partnerHandler));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred.'
  });
});

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`=======================================================`);
    console.log(` 🍞 WeBake API Server running on port ${PORT}`);
    console.log(` 📧 Sender Account: ${process.env.GMAIL_USER || 'crbwebake@gmail.com'}`);
    console.log(` 🔗 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
