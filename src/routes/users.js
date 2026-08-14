/**
 * Users API Routes (Shared)
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, requireRole} = require('../middleware/auth');
const {validatePagination, validateObjectId} = require('../middleware/validate');
const {logRequest} = require('../middleware/logger');
const {
  getMe,
  getUserById,
  updateMe,
  updateFcmToken,
  updateUserByAdmin,
  setUserPasswordByAdmin,
  setUserPinByAdmin,
  revealUserPinByAdmin,
  resetUserMfaByAdmin,
  getAllUsers,
  createOrUpdateMe,
  createUserByAdmin,
  deleteUserByAdmin,
  deactivateUserByAdmin,
  restoreUserByAdmin,
} = require('../controllers/usersController');
const {
  inviteAdmin,
  regenerateActivation,
  cancelActivation,
  setAdminStatus,
  updateAdminPermissions,
} = require('../controllers/adminActivationController');
const {handleProfileImageUpload} = require('../middleware/upload');
const {
  uploadCustomerProfileImage,
} = require('../controllers/assetsController');

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get(
  '/me',
  verifyAuth,
  logRequest,
  getMe,
);

/**
 * POST /api/users/me/profile-image
 * Upload current user profile image → S3 + CloudFront
 */
router.post(
  '/me/profile-image',
  verifyAuth,
  logRequest,
  handleProfileImageUpload,
  uploadCustomerProfileImage,
);

/**
 * POST /api/users/admins/invite
 * Super Admin: create PENDING admin + activation link (no email)
 */
router.post(
  '/admins/invite',
  requireRole('admin'),
  logRequest,
  inviteAdmin,
);

/**
 * GET /api/users/:userId
 * Get user by ID (limited fields for non-admin)
 */
router.get(
  '/:userId',
  verifyAuth,
  validateObjectId,
  logRequest,
  getUserById,
);

/**
 * POST /api/users/me
 * Create or update current user (upsert)
 * Used during signup/login to ensure user exists
 */
router.post(
  '/me',
  verifyAuth,
  logRequest,
  createOrUpdateMe,
);

/**
 * PUT /api/users/me
 * Update current user profile
 */
router.put(
  '/me',
  verifyAuth,
  logRequest,
  updateMe,
);

/**
 * PUT /api/users/:userId/fcmToken
 * Update FCM token for push notifications
 */
router.put(
  '/:userId/fcmToken',
  verifyAuth,
  validateObjectId,
  logRequest,
  updateFcmToken,
);

/**
 * GET /api/users/:userId/pin
 * One-shot reveal login PIN (admin). Admin targets need Super Admin.
 */
router.get(
  '/:userId/pin',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  revealUserPinByAdmin,
);

/**
 * PUT /api/users/:userId/pin
 * Admin set / reset login PIN
 */
router.put(
  '/:userId/pin',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  setUserPinByAdmin,
);

/**
 * POST /api/users/:userId/mfa/reset
 * Super Admin: clear MFA so admin re-enrolls on next login
 */
router.post(
  '/:userId/mfa/reset',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  resetUserMfaByAdmin,
);

/**
 * POST /api/users/:userId/activation/regenerate
 * Super Admin: new activation link (PENDING only)
 */
router.post(
  '/:userId/activation/regenerate',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  regenerateActivation,
);

/**
 * POST /api/users/:userId/activation/cancel
 * Super Admin: cancel PENDING invitation
 */
router.post(
  '/:userId/activation/cancel',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  cancelActivation,
);

/**
 * POST /api/users/:userId/admin-status
 * Super Admin: ACTIVE | LOCKED | DISABLED | PENDING
 */
router.post(
  '/:userId/admin-status',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  setAdminStatus,
);

/**
 * PATCH /api/users/:userId/permissions
 * Super Admin: replace admin permissions (alias of PATCH /api/admins/:id/permissions)
 */
router.patch(
  '/:userId/permissions',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  updateAdminPermissions,
);

/**
 * PUT /api/users/:userId/password
 * Admin set / reset user password
 */
router.put(
  '/:userId/password',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  setUserPasswordByAdmin,
);

/**
 * PUT /api/users/:userId
 * Admin update user (role, profile fields)
 */
router.put(
  '/:userId',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  updateUserByAdmin,
);

/**
 * GET /api/users
 * Get all users (admin only)
 */
router.get(
  '/',
  requireRole('admin'),
  validatePagination,
  logRequest,
  getAllUsers,
);

/**
 * POST /api/users
 * Create user (admin only)
 */
router.post(
  '/',
  requireRole('admin'),
  logRequest,
  createUserByAdmin,
);

/**
 * POST /api/users/:userId/deactivate
 * Soft-deactivate (blocks login)
 */
router.post(
  '/:userId/deactivate',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  deactivateUserByAdmin,
);

/**
 * POST /api/users/:userId/restore
 * Restore deactivated account
 */
router.post(
  '/:userId/restore',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  restoreUserByAdmin,
);

/**
 * DELETE /api/users/:userId
 * Delete user (admin only; cannot delete self)
 */
router.delete(
  '/:userId',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  deleteUserByAdmin,
);

module.exports = router;
