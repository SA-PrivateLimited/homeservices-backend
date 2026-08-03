/**
 * Providers Routes (Shared - all apps)
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, optionalAuth, requireRole} = require('../../middleware/auth');
const {validatePagination, validateObjectId} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {
  getProviders,
  getProviderById,
  getMyProfile,
  updateMyProfile,
  updateMyStatus,
  updateProviderApproval,
  updateProvider,
  uploadProviderDocument,
} = require('../../controllers/shared/providersController');
const {uploadProviderDocument: multerUpload} = require('../../middleware/upload');

/**
 * GET /api/providers
 * Get all approved providers (public)
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
 * NOTE: This must come BEFORE /:providerId to avoid 'approval' being treated as an ID
 */
router.put(
  '/:providerId/approval',
  requireRole('admin'),
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
  validateObjectId,
  (req, res, next) => {
    multerUpload(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: err.message || 'Upload failed',
        });
      }
      next();
    });
  },
  logRequest,
  uploadProviderDocument,
);

/**
 * PUT /api/providers/:providerId
 * Update provider details (admin only)
 */
router.put(
  '/:providerId',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  updateProvider,
);

module.exports = router;
