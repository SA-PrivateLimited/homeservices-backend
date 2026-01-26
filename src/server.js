/**
 * Home Services Backend API Server
 * Express.js + MongoDB Atlas
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const {connectDB} = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// Route imports - Organized by app
const usersRoutes = require('./routes/users'); // Shared

// Customer app routes
const customerJobCardsRoutes = require('./routes/customer/jobCards');
const customerServiceRequestsRoutes = require('./routes/customer/serviceRequests');

// Provider app routes
const providerJobCardsRoutes = require('./routes/provider/jobCards');
const providerServiceRequestsRoutes = require('./routes/provider/serviceRequests');

// Admin app routes
const adminJobCardsRoutes = require('./routes/admin/jobCards');

// Shared routes (used by multiple apps)
const providersRoutes = require('./routes/shared/providers');
const reviewsRoutes = require('./routes/shared/reviews');
const serviceCategoriesRoutes = require('./routes/shared/serviceCategories');
const contactRecommendationsRoutes = require('./routes/shared/contactRecommendations');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({extended: true})); // Parse URL-encoded bodies

// Global request logging (optional - can be enabled per route)
const {logRequest} = require('./middleware/logger');
// Uncomment to enable global request logging
// app.use(logRequest);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Home Services API is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes - Organized by app

// Shared routes (available to all apps)
app.use('/api/users', usersRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/serviceCategories', serviceCategoriesRoutes);
app.use('/api/contactRecommendations', contactRecommendationsRoutes);

// Customer app routes
app.use('/api/customer/jobCards', customerJobCardsRoutes);
app.use('/api/customer/serviceRequests', customerServiceRequestsRoutes);

// Provider app routes
app.use('/api/provider/jobCards', providerJobCardsRoutes);
app.use('/api/provider/serviceRequests', providerServiceRequestsRoutes);

// Admin app routes
app.use('/api/admin/jobCards', adminJobCardsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error logging middleware (before error handler)
const {logError} = require('./middleware/logger');
app.use((err, req, res, next) => {
  logError(err, req, res, next);
  next(err); // Pass to error handler
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Start Express server - listen on all interfaces for emulator access
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔════════════════════════════════════════╗
║   Home Services Backend API Server    ║
╚════════════════════════════════════════╝
🚀 Server running on port ${PORT}
📡 Environment: ${process.env.NODE_ENV || 'development'}
🔌 MongoDB: Connected
📍 API Base URL: http://localhost:${PORT}/api
📚 Health Check: http://localhost:${PORT}/health
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  const {closeDB} = require('./config/database');
  await closeDB();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  const {closeDB} = require('./config/database');
  await closeDB();
  process.exit(0);
});

// Always export the app for Vercel serverless functions
// The api/index.js file will use this export for Vercel
module.exports = app;

// For local development: Start the server normally
if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
  startServer();
} else {
  // Vercel serverless environment - initialize database connection
  // Connection is reused across invocations in serverless environment
  connectDB().catch(err => {
    console.error('MongoDB connection error in Vercel:', err);
  });
}
