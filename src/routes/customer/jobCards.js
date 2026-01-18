/**
 * Job Cards Routes (Customer App)
 */

const express = require('express');
const router = express.Router();
const {verifyAuth} = require('../../middleware/auth');
const {validatePagination, validateCancellationReason, validateObjectId} = require('../../middleware/validate');
const {checkJobCardCustomer} = require('../../middleware/permissions');
const {logRequest} = require('../../middleware/logger');
const {
  getMyJobCards,
  getMyJobCardById,
  cancelJobCard,
} = require('../../controllers/customer/jobCardsController');

/**
 * GET /api/customer/jobCards
 * Get customer's job cards
 */
router.get(
  '/',
  verifyAuth,
  validatePagination,
  logRequest,
  getMyJobCards,
);

/**
 * GET /api/customer/jobCards/:jobCardId
 * Get customer's single job card
 */
router.get(
  '/:jobCardId',
  verifyAuth,
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
  verifyAuth,
  validateObjectId,
  validateCancellationReason,
  checkJobCardCustomer,
  logRequest,
  cancelJobCard,
);

module.exports = router;
