/**
 * Job Cards Routes (Provider App)
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, requireRole} = require('../../middleware/auth');
const {validatePagination, validateJobCard, validateJobCardStatus, validateObjectId} = require('../../middleware/validate');
const {checkJobCardProvider} = require('../../middleware/permissions');
const {logRequest} = require('../../middleware/logger');
const {
  getMyJobCards,
  getMyJobCardById,
  createJobCard,
  updateJobCardStatus,
  addCommentToJobCard,
} = require('../../controllers/provider/jobCardsController');
const {
  getCustomerContactForJobCard,
} = require('../../controllers/contactController');

/**
 * GET /api/provider/jobCards
 * Get provider's job cards
 */
router.get(
  '/',
  verifyAuth,
  requireRole('provider'),
  validatePagination,
  logRequest,
  getMyJobCards,
);

/**
 * GET /api/provider/jobCards/:jobCardId/customer-contact
 * Authorized customer phone after accept
 */
router.get(
  '/:jobCardId/customer-contact',
  verifyAuth,
  requireRole('provider'),
  validateObjectId,
  checkJobCardProvider,
  logRequest,
  getCustomerContactForJobCard,
);

/**
 * GET /api/provider/jobCards/:jobCardId
 * Get provider's single job card
 */
router.get(
  '/:jobCardId',
  verifyAuth,
  requireRole('provider'),
  validateObjectId,
  checkJobCardProvider,
  logRequest,
  getMyJobCardById,
);

/**
 * POST /api/provider/jobCards
 * Create new job card
 */
router.post(
  '/',
  verifyAuth,
  requireRole('provider'),
  validateJobCard,
  logRequest,
  createJobCard,
);

/**
 * PUT /api/provider/jobCards/:jobCardId/status
 * Update job card status
 */
router.put(
  '/:jobCardId/status',
  verifyAuth,
  requireRole('provider'),
  validateObjectId,
  validateJobCardStatus,
  checkJobCardProvider,
  logRequest,
  updateJobCardStatus,
);

/**
 * POST /api/provider/jobCards/:jobCardId/comments
 */
router.post(
  '/:jobCardId/comments',
  verifyAuth,
  requireRole('provider'),
  validateObjectId,
  checkJobCardProvider,
  logRequest,
  addCommentToJobCard,
);

module.exports = router;
