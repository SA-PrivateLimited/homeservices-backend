/**
 * Admin RBAC middleware — capability checks after JWT + role.
 * Super Admin elevation (X-Super-Admin-Token) bypasses all permission checks.
 *
 * Permissions are resolved from the live admin document (DB) when available so
 * View/Edit changes apply immediately without waiting for JWT re-issue.
 * JWT permissions remain a fallback when userDoc is not loaded.
 */

const {verifySuperAdminToken, verifyAccessToken} = require('../utils/jwtAuth');
const {
  hasPermission,
  hasAnyPermission,
  resolveAdminPermissions,
} = require('../constants/permissions');

function readSuperAdminHeader(req) {
  return (
    req.headers['x-super-admin-token'] ||
    req.body?.superAdminToken ||
    ''
  )
    .toString()
    .trim();
}

/**
 * True when a valid Super Admin elevation token is present for this admin.
 */
function isSuperAdminElevated(req) {
  const token = readSuperAdminHeader(req);
  if (!token || !req.user?.uid) return false;
  try {
    const decoded = verifySuperAdminToken(token);
    return decoded.sub === req.user.uid;
  } catch {
    return false;
  }
}

/**
 * Permissions effective for this request — prefer live DB over JWT snapshot.
 */
function getRequestPermissions(req) {
  if (req.userDoc) {
    return resolveAdminPermissions(req.userDoc);
  }
  if (Array.isArray(req.accessTokenPayload?.permissions)) {
    return req.accessTokenPayload.permissions;
  }
  if (Array.isArray(req.user?.permissions)) {
    return req.user.permissions;
  }
  return [];
}

function attachAccessTokenPayload(req) {
  if (req.accessTokenPayload) return;
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return;
    const token = authHeader.split('Bearer ')[1].trim();
    req.accessTokenPayload = verifyAccessToken(token);
  } catch {
    // leave unset; caller already authenticated via requireRole
  }
}

/**
 * Require one permission. Super Admin elevation bypasses.
 * Must run after requireRole('admin') (or verifyAuth with admin).
 */
function requirePermission(...required) {
  const needed = required.filter(Boolean);
  return (req, res, next) => {
    try {
      attachAccessTokenPayload(req);

      if (isSuperAdminElevated(req)) {
        req.isSuperAdmin = true;
        return next();
      }

      if ((req.user?.role || req.userDoc?.role) !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Admin role required',
        });
      }

      const perms = getRequestPermissions(req);
      const ok =
        needed.length === 0 ||
        needed.every((p) => hasPermission(perms, p));

      if (!ok) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Missing permission: ${needed.join(', ')}`,
          required: needed,
        });
      }

      next();
    } catch (error) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: error.message || 'Permission check failed',
      });
    }
  };
}

/**
 * Require any one of the listed permissions.
 */
function requireAnyPermission(...required) {
  const needed = required.filter(Boolean);
  return (req, res, next) => {
    try {
      attachAccessTokenPayload(req);

      if (isSuperAdminElevated(req)) {
        req.isSuperAdmin = true;
        return next();
      }

      if ((req.user?.role || req.userDoc?.role) !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Admin role required',
        });
      }

      const perms = getRequestPermissions(req);
      if (needed.length && !hasAnyPermission(perms, needed)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Missing one of: ${needed.join(', ')}`,
          required: needed,
        });
      }

      next();
    } catch (error) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: error.message || 'Permission check failed',
      });
    }
  };
}

module.exports = {
  isSuperAdminElevated,
  getRequestPermissions,
  requirePermission,
  requireAnyPermission,
};
