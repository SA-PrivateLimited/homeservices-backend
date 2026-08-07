/**
 * Contact Recommendations Routes
 * Shared routes for contact recommendations
 */

const express = require('express');
const router = express.Router();
const {verifyAuth} = require('../../middleware/auth');
const {requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {validateObjectId} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {
  createContactRecommendation,
  getAllContactRecommendations,
  getMyContactRecommendations,
  updateRecommendationStatus,
  updateContactRecommendation,
} = require('../../controllers/shared/contactRecommendationsController');

/**
 * POST /api/contactRecommendations
 * Create a new contact recommendation (customer/provider)
 */
router.post(
  '/',
  verifyAuth,
  logRequest,
  createContactRecommendation,
);

/**
 * GET /api/contactRecommendations
 * Get all contact recommendations (admin only)
 */
router.get(
  '/',
  verifyAuth,
  requireRole('admin'),
  requirePermission(PERMISSIONS.CONTACTS_VIEW),
  logRequest,
  getAllContactRecommendations,
);

/**
 * GET /api/contactRecommendations/me
 * Get my contact recommendations (customer/provider)
 */
router.get(
  '/me',
  verifyAuth,
  logRequest,
  getMyContactRecommendations,
);

/**
 * PUT /api/contactRecommendations/:id
 * Update recommendation details (admin only)
 */
router.put(
  '/:id',
  verifyAuth,
  requireRole('admin'),
  requirePermission(PERMISSIONS.CONTACTS_UPDATE),
  validateObjectId,
  logRequest,
  updateContactRecommendation,
);

/**
 * PUT /api/contactRecommendations/:id/status
 * Update recommendation status (admin only)
 */
router.put(
  '/:id/status',
  verifyAuth,
  requireRole('admin'),
  requirePermission(PERMISSIONS.CONTACTS_UPDATE),
  validateObjectId,
  logRequest,
  updateRecommendationStatus,
);

module.exports = router;
