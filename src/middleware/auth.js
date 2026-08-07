/**
 * JWT (HS256 / HMAC) authentication — replaces Firebase ID tokens for API auth.
 * Optional Firebase Admin is only used elsewhere (e.g. RTDB) — see config/firebaseAdmin.js
 */

const {connectDB} = require('../config/database');
const User = require('../models/User');
const {verifyAccessToken} = require('../utils/jwtAuth');
const {resolveAdminPermissions} = require('../constants/permissions');

/**
 * Verify Bearer JWT and attach req.user / req.userDoc
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

    const token = authHeader.split('Bearer ')[1].trim();
    const decoded = verifyAccessToken(token);
    req.accessTokenPayload = decoded;

    req.user = {
      uid: decoded.sub,
      email: decoded.email,
      phoneNumber: decoded.phone,
      permissions: Array.isArray(decoded.permissions) ? decoded.permissions : [],
    };

    await connectDB();
    const userDoc = await User.findById(decoded.sub).lean();
    if (userDoc) {
      req.user.role = userDoc.role || 'customer';
      req.userDoc = userDoc;
      if (userDoc.role === 'admin') {
        // Option 1: JWT snapshot wins for enforcement; expose DB copy for UI/me
        if (!Array.isArray(decoded.permissions)) {
          req.user.permissions = resolveAdminPermissions(userDoc);
        }
      }
    } else {
      req.user.role = decoded.role || 'customer';
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
 * Require specific role(s) after JWT verification
 */
function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'No authentication token provided',
        });
      }

      const token = authHeader.split('Bearer ')[1].trim();
      const decoded = verifyAccessToken(token);
      req.accessTokenPayload = decoded;

      req.user = {
        uid: decoded.sub,
        email: decoded.email,
        phoneNumber: decoded.phone,
        permissions: Array.isArray(decoded.permissions)
          ? decoded.permissions
          : [],
      };

      await connectDB();
      const userDoc = await User.findById(decoded.sub).lean();

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

      req.userDoc = userDoc;
      req.user.role = userRole;
      if (userRole === 'admin' && !Array.isArray(decoded.permissions)) {
        req.user.permissions = resolveAdminPermissions(userDoc);
      }

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: error.message || 'Invalid token',
      });
    }
  };
}

/**
 * Optional JWT — does not fail if missing/invalid
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1].trim();
      const decoded = verifyAccessToken(token);
      req.user = {
        uid: decoded.sub,
        email: decoded.email,
        phoneNumber: decoded.phone,
      };
      await connectDB();
      const userDoc = await User.findById(decoded.sub).lean();
      if (userDoc) {
        req.user.role = userDoc.role || 'customer';
        req.userDoc = userDoc;
      }
    }
  } catch (e) {
    // continue without user
  }
  next();
}

module.exports = {
  verifyAuth,
  requireRole,
  optionalAuth,
};
