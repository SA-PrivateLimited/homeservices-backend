/**
 * Authentication Middleware
 * Verifies Firebase Auth tokens from request headers
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    const serviceAccount = require('../../../firebase/serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error('⚠️  Firebase Admin initialization failed:', error.message);
    console.log('   Using environment variables for Firebase config');
  }
}

/**
 * Middleware to verify Firebase Auth token
 */
async function verifyAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
    }

    const token = authHeader.split('Bearer ')[1];

    // Verify Firebase Auth token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      phoneNumber: decodedToken.phone_number,
    };

    next();
  } catch (error) {
    console.error('❌ Auth verification error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired authentication token',
    });
  }
}

/**
 * Middleware to check user role
 */
function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      // First verify auth
      await new Promise((resolve, reject) => {
        verifyAuth(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Get user from database to check role
      const {getCollection} = require('../config/database');
      const usersCollection = getCollection('users');
      const userDoc = await usersCollection.findOne({_id: req.user.uid});

      if (!userDoc) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          message: 'User document does not exist',
        });
      }

      const userRole = userDoc.role || 'customer';

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        });
      }

      // Attach full user document to request
      req.userDoc = userDoc;
      req.user.role = userRole;

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: error.message,
      });
    }
  };
}

/**
 * Optional auth - doesn't fail if no token provided
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        phoneNumber: decodedToken.phone_number,
      };
    }

    next();
  } catch (error) {
    // Continue without auth if token is invalid
    next();
  }
}

module.exports = {
  verifyAuth,
  requireRole,
  optionalAuth,
};
