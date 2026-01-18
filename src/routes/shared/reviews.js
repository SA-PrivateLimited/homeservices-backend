/**
 * Reviews Routes (Shared - all apps)
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, optionalAuth, requireRole} = require('../../middleware/auth');
const {validatePagination, validateReview, validateObjectId} = require('../../middleware/validate');
const {checkReviewOwnership, checkJobCardCompleted} = require('../../middleware/permissions');
const {logRequest} = require('../../middleware/logger');
const {
  getReviews,
  getReviewById,
  createReview,
  updateReview,
  deleteReview,
} = require('../../controllers/shared/reviewsController');

/**
 * GET /api/reviews
 * Get reviews (public)
 */
router.get(
  '/',
  optionalAuth,
  validatePagination,
  logRequest,
  getReviews,
);

/**
 * GET /api/reviews/:reviewId
 * Get single review (public)
 */
router.get(
  '/:reviewId',
  optionalAuth,
  validateObjectId,
  logRequest,
  getReviewById,
);

/**
 * POST /api/reviews
 * Create review (customer only)
 */
router.post(
  '/',
  requireRole('customer'),
  validateReview,
  checkJobCardCompleted,
  logRequest,
  createReview,
);

/**
 * PUT /api/reviews/:reviewId
 * Update review (customer)
 */
router.put(
  '/:reviewId',
  requireRole('customer'),
  validateObjectId,
  checkReviewOwnership,
  logRequest,
  updateReview,
);

/**
 * DELETE /api/reviews/:reviewId
 * Delete review (admin or customer)
 */
router.delete(
  '/:reviewId',
  verifyAuth,
  validateObjectId,
  checkReviewOwnership,
  logRequest,
  deleteReview,
);

module.exports = router;
