/**
 * ====================================================================
 * WeBake - Backend API Server (Node.js & Express)
 * Crumbs N' Rolls Bakery — Core Service
 * ====================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const otpRoutes = require('./routes/otpRoutes');
const orderRoutes = require('./routes/orderRoutes');

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

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'WeBake Bakery API',
    mailer: process.env.GMAIL_USER || 'crbwebake@gmail.com',
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/otp', otpRoutes);
app.use('/api/orders', orderRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred.'
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` 🍞 WeBake API Server running on port ${PORT}`);
  console.log(` 📧 Sender Account: ${process.env.GMAIL_USER || 'crbwebake@gmail.com'}`);
  console.log(` 🔗 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);
});
