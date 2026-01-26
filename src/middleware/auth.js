/**
 * Authentication Middleware
 * Verifies Firebase Auth tokens from request headers
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    // Try multiple possible paths for service account key
    const path = require('path');
    const fs = require('fs');
    
    let serviceAccountPath = null;
    const possiblePaths = [
      path.join(__dirname, '../../serviceAccountsKey.json'), // In homeServicesBackend root
      path.join(__dirname, '../../../serviceAccountsKey.json'), // In project root
      path.join(__dirname, '../../../firebase/serviceAccountKey.json'), // In firebase folder
      process.env.SERVICE_ACCOUNT_KEY_PATH, // From environment variable
    ];
    
    for (const possiblePath of possiblePaths) {
      if (possiblePath && fs.existsSync(possiblePath)) {
        serviceAccountPath = possiblePath;
        break;
      }
    }
    
    if (serviceAccountPath) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized with service account key:', serviceAccountPath);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Try parsing from environment variable (JSON string)
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log('✅ Firebase Admin initialized from environment variable');
      } catch (parseError) {
        console.error('⚠️  Failed to parse FIREBASE_SERVICE_ACCOUNT from env:', parseError.message);
      }
    } else {
      throw new Error('Service account key not found. Please provide serviceAccountsKey.json or set FIREBASE_SERVICE_ACCOUNT env variable.');
    }
  } catch (error) {
    console.error('⚠️  Firebase Admin initialization failed:', error.message);
    console.log('   Make sure serviceAccountsKey.json exists or FIREBASE_SERVICE_ACCOUNT env variable is set');
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

    // Fetch user role from database
    try {
      const {getCollection, connectDB} = require('../config/database');
      // Ensure database is connected
      await connectDB();
      const usersCollection = await getCollection('users');
      const userDoc = await usersCollection.findOne({_id: decodedToken.uid});
      if (userDoc) {
        req.user.role = userDoc.role || 'customer';
        req.userDoc = userDoc;
      } else {
        // If user doesn't exist in database, default to customer
        req.user.role = 'customer';
      }
    } catch (dbError) {
      // Continue with default role if database lookup fails
      console.warn('⚠️  Failed to fetch user role from database:', dbError.message);
      req.user.role = 'customer'; // Default to customer
    }

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
      const {getCollection, connectDB} = require('../config/database');
      // Ensure database is connected
      await connectDB();
      const usersCollection = await getCollection('users');
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
 * Also fetches user role from database if token is valid
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

      // Fetch user role from database
      try {
        const {getCollection, connectDB} = require('../config/database');
        // Ensure database is connected
        await connectDB();
        const usersCollection = await getCollection('users');
        const userDoc = await usersCollection.findOne({_id: req.user.uid});
        if (userDoc) {
          req.user.role = userDoc.role || 'customer';
          req.userDoc = userDoc;
        }
      } catch (dbError) {
        // Continue without role if database lookup fails
        console.warn('Failed to fetch user role:', dbError.message);
      }
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
