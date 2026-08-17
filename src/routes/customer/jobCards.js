/**
 * Job Cards Routes (Customer App)
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, requireRole} = require('../../middleware/auth');
const {validatePagination, validateCancellationReason, validateObjectId} = require('../../middleware/validate');
const {
  checkJobCardCustomer,
  checkJobCardCustomerCancellable,
} = require('../../middleware/permissions');
const {logRequest} = require('../../middleware/logger');
const {detectLanguage} = require('../../utils/translations');
const {
  getMyJobCards,
  getMyJobCardById,
  cancelJobCard,
  addCommentToJobCard,
} = require('../../controllers/customer/jobCardsController');
const {
  getProviderContactForJobCard,
} = require('../../controllers/contactController');

/**
 * GET /api/customer/jobCards
 * Get customer's job cards
 */
router.get(
  '/',
  detectLanguage,
  verifyAuth,
  requireRole('customer'),
  validatePagination,
  logRequest,
  getMyJobCards,
);

/**
 * GET /api/customer/jobCards/:jobCardId/provider-contact
 * Authorized provider phone after accept
 */
router.get(
  '/:jobCardId/provider-contact',
  detectLanguage,
  verifyAuth,
  requireRole('customer'),
  validateObjectId,
  checkJobCardCustomer,
  logRequest,
  getProviderContactForJobCard,
);

/**
 * GET /api/customer/jobCards/:jobCardId
 * Get customer's single job card
 */
router.get(
  '/:jobCardId',
  detectLanguage,
  verifyAuth,
  requireRole('customer'),
  validateObjectId,
  checkJobCardCustomer,
  logRequest,
  getMyJobCardById,
);

/**
 * PUT /api/customer/jobCards/:jobCardId/cancel
 * Cancel job card with reason
 */
router.put(
  '/:jobCardId/cancel',
  detectLanguage,
  verifyAuth,
  requireRole('customer'),
  validateObjectId,
  validateCancellationReason,
  checkJobCardCustomerCancellable,
  logRequest,
  cancelJobCard,
);

/**
 * POST /api/customer/jobCards/:jobCardId/comments
 */
router.post(
  '/:jobCardId/comments',
  detectLanguage,
  verifyAuth,
  requireRole('customer'),
  validateObjectId,
  checkJobCardCustomer,
  logRequest,
  addCommentToJobCard,
);

module.exports = router;
