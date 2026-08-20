/**
 * Home Services Backend API Server
 * Express.js + MongoDB Atlas
 */

require('dotenv').config();
// Optional Firebase Admin (RTDB / legacy); JWT auth does not use Firebase
try {
  require('./config/firebaseAdmin');
} catch (e) {
  /* optional */
}
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const {connectDB} = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const {
  initSocket,
  mountEmitHttpRoutes,
} = require('./realtime/socket');

// Route imports - Organized by app
const usersRoutes = require('./routes/users'); // Shared

// Customer app routes
const customerJobCardsRoutes = require('./routes/customer/jobCards');
const customerServiceRequestsRoutes = require('./routes/customer/serviceRequests');

// Provider app routes
const providerJobCardsRoutes = require('./routes/provider/jobCards');
const providerServiceRequestsRoutes = require('./routes/provider/serviceRequests');
const providerCollaborationRoutes = require('./routes/provider/partnerCollaboration');

// Admin app routes
const adminJobCardsRoutes = require('./routes/admin/jobCards');
const adminClientsRoutes = require('./routes/admin/clients');
const adminGeographyRoutes = require('./routes/admin/geography');

// Shared routes (used by multiple apps)
const providersRoutes = require('./routes/shared/providers');
const reviewsRoutes = require('./routes/shared/reviews');
const serviceCategoriesRoutes = require('./routes/shared/serviceCategories');
const contactRecommendationsRoutes = require('./routes/shared/contactRecommendations');
const brandingRoutes = require('./routes/shared/branding');
const authRoutes = require('./routes/auth');
const superAdminRoutes = require('./routes/superadmin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(
  helmet({
    // Allow Socket.IO long-polling / websocket from mobile clients
    crossOriginResourcePolicy: {policy: 'cross-origin'},
    contentSecurityPolicy: false,
  }),
);
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({extended: true})); // Parse URL-encoded bodies

const {UPLOAD_ROOT} = require('./middleware/upload');
app.use('/uploads', express.static(UPLOAD_ROOT));

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

// Auth (login/register — no Bearer token; returns JWT)
app.use('/api/auth', authRoutes);
app.use('/api/superadmin', superAdminRoutes);

// Shared routes (available to all apps)
app.use('/api/users', usersRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/serviceCategories', serviceCategoriesRoutes);
app.use('/api/contactRecommendations', contactRecommendationsRoutes);
app.use('/api/branding', brandingRoutes);
app.use('/api/launch', require('./routes/shared/launch'));
app.use('/api/geography', require('./routes/shared/geography'));
app.use('/api/assets', require('./routes/assets').router);

// Customer app routes
app.use('/api/customer/jobCards', customerJobCardsRoutes);
app.use('/api/customer/serviceRequests', customerServiceRequestsRoutes);

// Provider app routes
app.use('/api/provider/jobCards', providerJobCardsRoutes);
app.use('/api/provider/serviceRequests', providerServiceRequestsRoutes);
app.use('/api/provider', providerCollaborationRoutes);

// Admin app routes
app.use('/api/admin/jobCards', adminJobCardsRoutes);
app.use('/api/admin/clients', adminClientsRoutes);
app.use('/api/admin/geography', adminGeographyRoutes);
app.use('/api/admin/overview', require('./routes/admin/overview'));
app.use('/api/admin/settings/contact-privacy', require('./routes/admin/contactPrivacy'));
app.use('/api/admins', require('./routes/admin/admins'));
app.use(
  '/api/admin/area-provider-demands',
  require('./routes/admin/areaProviderDemands'),
);

// Realtime HTTP emit (compat with mobile clients; same host as API)
mountEmitHttpRoutes(app);

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

// HTTP server (required for Socket.IO). Vercel uses the Express export only.
const server = http.createServer(app);

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Attach Socket.IO to the same HTTP server (long-lived process only)
    initSocket(server);

    // Listen on all interfaces for emulator access
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔════════════════════════════════════════╗
║   Home Services Backend API Server    ║
╚════════════════════════════════════════╝
🚀 Server running on port ${PORT}
📡 Environment: ${process.env.NODE_ENV || 'development'}
🔌 MongoDB: Connected
📍 API Base URL: http://localhost:${PORT}/api
📚 Health Check: http://localhost:${PORT}/health
🔌 Socket.IO:   http://localhost:${PORT} (path /socket.io/)
🔐 Auth: GET  http://localhost:${PORT}/api/auth/health  (verify auth routes loaded)
   POST http://localhost:${PORT}/api/auth/register
   POST http://localhost:${PORT}/api/auth/login
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
