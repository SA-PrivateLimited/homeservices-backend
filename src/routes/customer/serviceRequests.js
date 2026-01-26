/**
 * Service Requests Routes (Customer App)
 */

const express = require('express');
const router = express.Router();
const {verifyAuth} = require('../../middleware/auth');
const {validatePagination, validateCancellationReason, validateObjectId} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {detectLanguage} = require('../../utils/translations');
const {
  getMyServiceRequests,
  getMyServiceRequestById,
  createServiceRequest,
  updateServiceRequest,
  cancelServiceRequest,
} = require('../../controllers/customer/serviceRequestsController');

/**
 * GET /api/customer/serviceRequests
 * Get customer's service requests
 */
router.get(
  '/',
  detectLanguage,
  verifyAuth,
  validatePagination,
  logRequest,
  getMyServiceRequests,
);

/**
 * POST /api/customer/serviceRequests
 * Create a new service request
 */
router.post(
  '/',
  detectLanguage,
  verifyAuth,
  logRequest,
  createServiceRequest,
);

/**
 * GET /api/customer/serviceRequests/:serviceRequestId
 * Get customer's single service request
 */
router.get(
  '/:serviceRequestId',
  detectLanguage,
  verifyAuth,
  validateObjectId,
  logRequest,
  getMyServiceRequestById,
);

/**
 * PUT /api/customer/serviceRequests/:serviceRequestId
 * Update service request
 */
router.put(
  '/:serviceRequestId',
  detectLanguage,
  verifyAuth,
  validateObjectId,
  logRequest,
  updateServiceRequest,
);

/**
 * PUT /api/customer/serviceRequests/:serviceRequestId/cancel
 * Cancel service request with reason
 */
router.put(
  '/:serviceRequestId/cancel',
  detectLanguage,
  verifyAuth,
  validateObjectId,
  validateCancellationReason,
  logRequest,
  cancelServiceRequest,
);

module.exports = router;
