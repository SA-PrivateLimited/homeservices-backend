/**
 * Contact Recommendations Routes
 * Shared routes for contact recommendations
 */

const express = require('express');
const router = express.Router();
const {verifyAuth} = require('../../middleware/auth');
const {requireRole} = require('../../middleware/auth');
const {validateObjectId} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {
  createContactRecommendation,
  getAllContactRecommendations,
  getMyContactRecommendations,
  updateRecommendationStatus,
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
 * PUT /api/contactRecommendations/:id/status
 * Update recommendation status (admin only)
 */
router.put(
  '/:id/status',
  verifyAuth,
  requireRole('admin'),
  validateObjectId,
  logRequest,
  updateRecommendationStatus,
);

module.exports = router;
