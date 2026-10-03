/**
 * ====================================================================
 * WeBake - Backend API Server (Node.js & Express)
 * Crumbs N' Rolls Bakery — Core Service
 * Connected to Supabase PostgreSQL Database
 * ====================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./database/db');
const otpRoutes = require('./routes/otpRoutes');
const orderRoutes = require('./routes/orderRoutes');
const productRoutes = require('./routes/productRoutes');
const partnerRoutes = require('./routes/partnerRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration (Allows frontend requests from local dev or Render hosting)
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint (Reports Server, Mailer & Supabase DB health)
app.get('/api/health', async (req, res) => {
  const dbStatus = await db.ping();
  res.json({
    status: dbStatus.connected ? 'healthy' : 'degraded',
    service: 'WeBake Bakery API',
    mailer: process.env.GMAIL_USER || 'crbwebake@gmail.com',
    database: {
      provider: 'Supabase PostgreSQL',
      connected: dbStatus.connected,
      name: dbStatus.database,
      dbTimestamp: dbStatus.timestamp,
      error: dbStatus.error
    },
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/otp', otpRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/partner', partnerRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred.'
  });
});

// Start Server
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(` 🍞 WeBake API Server running on port ${PORT}`);
  console.log(` 📧 Sender Account: ${process.env.GMAIL_USER || 'crbwebake@gmail.com'}`);
  console.log(` 🔗 Health Check: http://localhost:${PORT}/api/health`);

  const dbStatus = await db.ping();
  if (dbStatus.connected) {
    console.log(` 🗄️  Supabase Database: CONNECTED (${dbStatus.database})`);
  } else {
    console.error(` ❌ Supabase Database: DISCONNECTED (${dbStatus.error})`);
  }
  console.log(`=======================================================`);
});
