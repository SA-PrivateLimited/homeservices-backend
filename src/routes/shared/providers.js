/**
 * Providers Routes (Shared - all apps)
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, optionalAuth, requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {validatePagination, validateObjectId} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {
  getProviders,
  getProviderById,
  getMyProfile,
  updateMyProfile,
  updateMyServiceAvailability,
  updateMyStatus,
  updateProviderApproval,
  updateProvider,
  uploadProviderDocument,
} = require('../../controllers/shared/providersController');
const {
  handleProviderDocumentUpload,
  handleProfileImageUpload,
} = require('../../middleware/upload');
const {
  uploadProviderProfileImage,
} = require('../../controllers/assetsController');

/**
 * GET /api/providers
 * Get all approved providers (public); admins need providers.view when authenticated as admin
 */
router.get(
  '/',
  optionalAuth,
  validatePagination,
  logRequest,
  getProviders,
);

/**
 * GET /api/providers/me
 * Get current provider's profile (provider only)
 * NOTE: This must come BEFORE /:providerId to avoid 'me' being treated as an ID
 */
router.get(
  '/me',
  requireRole('provider'),
  logRequest,
  getMyProfile,
);

/**
 * GET /api/providers/:providerId
 * Get provider by ID (public)
 */
router.get(
  '/:providerId',
  optionalAuth,
  validateObjectId,
  logRequest,
  getProviderById,
);

/**
 * PUT /api/providers/me
 * Update provider profile (provider only)
 */
router.put(
  '/me',
  requireRole('provider'),
  logRequest,
  updateMyProfile,
);

/**
 * POST /api/providers/me/profile-image
 * Upload provider profile image (provider only) → S3 + CloudFront
 */
router.post(
  '/me/profile-image',
  requireRole('provider'),
  logRequest,
  handleProfileImageUpload,
  uploadProviderProfileImage,
);

/**
 * PUT /api/providers/me/service-availability
 * Toggle whether a service accepts new jobs (provider only)
 */
router.put(
  '/me/service-availability',
  requireRole('provider'),
  logRequest,
  updateMyServiceAvailability,
);

/**
 * PUT /api/providers/me/status
 * Update provider online/offline status (provider only)
 */
router.put(
  '/me/status',
  requireRole('provider'),
  logRequest,
  updateMyStatus,
);

/**
 * PUT /api/providers/:providerId/approval
 * Approve/reject provider (admin only)
 */
router.put(
  '/:providerId/approval',
  requireRole('admin'),
  requirePermission(PERMISSIONS.PROVIDERS_UPDATE),
  validateObjectId,
  logRequest,
  updateProviderApproval,
);

/**
 * POST /api/providers/:providerId/documents/:docKey
 * Upload provider document (admin only)
 */
router.post(
  '/:providerId/documents/:docKey',
  requireRole('admin'),
  requirePermission(PERMISSIONS.PROVIDERS_UPDATE),
  validateObjectId,
  logRequest,
  handleProviderDocumentUpload,
  uploadProviderDocument,
);

/**
 * PUT /api/providers/:providerId
 * Update provider details (admin only)
 */
router.put(
  '/:providerId',
  requireRole('admin'),
  requirePermission(PERMISSIONS.PROVIDERS_UPDATE),
  validateObjectId,
  logRequest,
  updateProvider,
);

module.exports = router;
