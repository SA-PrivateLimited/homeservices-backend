/**
 * Super Admin elevation + key update (no separate Super Admin tab).
 */

const {signSuperAdminToken} = require('../utils/jwtAuth');
const {
  verifySuperAdminPin,
  updateSuperAdminPin,
} = require('../utils/superAdmin');

/** Simple per-admin in-memory rate limit for elevate attempts. */
const elevateAttempts = new Map();
const ELEVATE_WINDOW_MS = 15 * 60 * 1000;
const ELEVATE_MAX_ATTEMPTS = 8;

function checkElevateRateLimit(uid) {
  const key = String(uid || 'anon');
  const now = Date.now();
  let entry = elevateAttempts.get(key);
  if (!entry || now - entry.windowStart > ELEVATE_WINDOW_MS) {
    entry = {windowStart: now, count: 0};
    elevateAttempts.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > ELEVATE_MAX_ATTEMPTS) {
    const err = new Error(
      'Too many Super Admin elevation attempts. Try again later.',
    );
    err.statusCode = 429;
    throw err;
  }
}

/**
 * POST /api/superadmin/elevate
 * Body: { code } — 4-digit Super Admin key
 * Requires authenticated admin.
 */
exports.elevate = async (req, res, next) => {
  try {
    checkElevateRateLimit(req.user?.uid);
    const ok = await verifySuperAdminPin(req.body.code);
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid Super Admin key',
      });
    }

    const token = signSuperAdminToken({
      sub: req.user.uid,
      email: req.user.email,
      role: req.user.role || 'admin',
    });

    res.json({
      success: true,
      data: {
        superAdminToken: token,
        expiresIn: process.env.SUPER_ADMIN_TOKEN_EXPIRES_IN || '2h',
      },
      message: 'Acting as Super Admin',
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error:
          error.statusCode === 429
            ? 'Too Many Requests'
            : error.statusCode === 401
              ? 'Unauthorized'
              : 'Bad Request',
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * PUT /api/superadmin/key
 * Body: { currentCode, newCode }
 * Requires Super Admin elevation.
 */
exports.updateKey = async (req, res, next) => {
  try {
    await updateSuperAdminPin(
      req.body.currentCode || req.body.code,
      req.body.newCode,
      req.user?.uid,
    );
    res.json({
      success: true,
      data: {updated: true},
      message: 'Super Admin key updated',
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.statusCode === 401 ? 'Unauthorized' : 'Bad Request',
        message: error.message,
      });
    }
    next(error);
  }
};
