/**
 * Admin activation HTTP handlers (public invitee + Super Admin invitation ops).
 */

const adminActivationService = require('../services/adminActivationService');
const {verifySuperAdminToken} = require('../utils/jwtAuth');

function requireSuperAdmin(req) {
  const token = (
    req.headers['x-super-admin-token'] ||
    req.body?.superAdminToken ||
    ''
  )
    .toString()
    .trim();
  if (!token) {
    const err = new Error(
      'Act as Super Admin and enter the 4-digit key to manage admin accounts',
    );
    err.statusCode = 403;
    throw err;
  }
  let decoded;
  try {
    decoded = verifySuperAdminToken(token);
  } catch (e) {
    const err = new Error(
      e.message || 'Invalid or expired Super Admin session',
    );
    err.statusCode = 401;
    throw err;
  }
  if (req.user?.uid && decoded.sub !== req.user.uid) {
    const err = new Error(
      'Super Admin session does not match the signed-in admin',
    );
    err.statusCode = 403;
    throw err;
  }
  return decoded;
}

function sendServiceError(res, error) {
  const status = error.statusCode || 500;
  return res.status(status).json({
    success: false,
    error:
      status === 400
        ? 'Bad Request'
        : status === 401
          ? 'Unauthorized'
          : status === 403
            ? 'Forbidden'
            : status === 404
              ? 'Not Found'
              : status === 409
                ? 'Conflict'
                : status === 410
                  ? 'Gone'
                  : 'Error',
    message: error.message || 'Request failed',
    code: error.code,
  });
}

/** GET /api/auth/activate?token= */
exports.validateActivation = async (req, res, next) => {
  try {
    const token = req.query.token || req.params.token;
    const data = await adminActivationService.validateActivationToken(token);
    res.json({success: true, data});
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    next(error);
  }
};

/** POST /api/auth/activate/password { token, password, confirmPassword } */
exports.activationSetPassword = async (req, res, next) => {
  try {
    const {token, password, confirmPassword} = req.body || {};
    const data = await adminActivationService.setActivationPassword(
      token,
      password,
      confirmPassword,
    );
    res.json({success: true, data, message: data.message});
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    next(error);
  }
};

/** POST /api/auth/activate/mfa { activationMfaToken, code } */
exports.activationVerifyMfa = async (req, res, next) => {
  try {
    const {activationMfaToken, code, totpCode} = req.body || {};
    const data = await adminActivationService.completeActivation(
      activationMfaToken,
      code || totpCode,
    );
    res.json({success: true, data: data.admin, message: data.message});
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    next(error);
  }
};

/** POST /api/users/admins/invite — Super Admin create PENDING admin */
exports.inviteAdmin = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const result = await adminActivationService.createPendingAdmin({
      name: req.body.name || req.body.displayName,
      email: req.body.email,
      permissions: req.body.permissions,
      adminWebOrigin:
        adminActivationService.resolveAdminWebOriginFromRequest(req),
    });
    res.status(201).json({
      success: true,
      data: result,
      message:
        'Admin created. Share the activation link manually (no email sent).',
    });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    next(error);
  }
};

/** POST /api/users/:userId/activation/regenerate */
exports.regenerateActivation = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const result = await adminActivationService.regenerateActivation(
      req.params.userId,
      {
        adminWebOrigin:
          adminActivationService.resolveAdminWebOriginFromRequest(req),
      },
    );
    res.json({
      success: true,
      data: result,
      message: 'New activation link issued. Previous link is invalid.',
    });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    next(error);
  }
};

/** POST /api/users/:userId/activation/cancel */
exports.cancelActivation = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const admin = await adminActivationService.cancelInvitation(
      req.params.userId,
    );
    res.json({
      success: true,
      data: admin,
      message: 'Invitation cancelled',
    });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    next(error);
  }
};

/** POST /api/users/:userId/admin-status { status, reason? } */
exports.setAdminStatus = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const status = String(req.body.status || '')
      .trim()
      .toUpperCase();
    const admin = await adminActivationService.setAdminLifecycleStatus(
      req.params.userId,
      status,
      {
        reason: req.body.reason,
        actorId: req.user?.uid,
      },
    );
    res.json({
      success: true,
      data: admin,
      message: `Admin status set to ${status}`,
    });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    next(error);
  }
};

/** PATCH /api/admins/:id/permissions or /api/users/:userId/permissions */
exports.updateAdminPermissions = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const admin = await adminActivationService.updateAdminPermissions(
      req.params.id || req.params.userId,
      req.body.permissions,
    );
    res.json({
      success: true,
      data: admin,
      message:
        'Permissions updated. Changes apply on the admin’s next login (new JWT).',
    });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    next(error);
  }
};
