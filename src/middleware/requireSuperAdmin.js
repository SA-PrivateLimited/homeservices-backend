/**
 * Require an active Super Admin elevation token
 * (header: X-Super-Admin-Token) after normal admin auth.
 */

const {verifySuperAdminToken} = require('../utils/jwtAuth');

function requireSuperAdmin(req, res, next) {
  try {
    const token = (
      req.headers['x-super-admin-token'] ||
      req.body?.superAdminToken ||
      ''
    )
      .toString()
      .trim();

    if (!token) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message:
          'Super Admin elevation required. Use Act as Super Admin and enter the 4-digit key.',
      });
    }

    const decoded = verifySuperAdminToken(token);
    if (req.user?.uid && decoded.sub !== req.user.uid) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Super Admin session does not match the signed-in admin',
      });
    }

    req.superAdmin = {
      uid: decoded.sub,
      email: decoded.email,
    };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: error.message || 'Invalid or expired Super Admin session',
    });
  }
}

module.exports = {requireSuperAdmin};
