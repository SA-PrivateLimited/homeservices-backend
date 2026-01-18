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
  updateMyProfile,
  updateMyStatus,
  updateProviderApproval,
} = require('../../controllers/shared/providersController');

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
 */
router.put(
  '/:providerId/approval',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  updateProviderApproval,
);

module.exports = router;
