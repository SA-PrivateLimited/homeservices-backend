/**
 * Service Requests Routes (Customer App)
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, requireRole} = require('../../middleware/auth');
const {validatePagination, validateCancellationReason, validateObjectId} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {detectLanguage} = require('../../utils/translations');
const {
  getMyServiceRequests,
  getMyServiceRequestById,
  createServiceRequest,
  updateServiceRequest,
  cancelServiceRequest,
  requestAreaProviders,
  getActiveServiceRequestForType,
} = require('../../controllers/customer/serviceRequestsController');
const {
  getProviderContactForServiceRequest,
} = require('../../controllers/contactController');

/**
 * GET /api/customer/serviceRequests
 * Get customer's service requests
 */
router.get(
  '/',
  detectLanguage,
  verifyAuth,
  requireRole('customer'),
  validatePagination,
  logRequest,
  getMyServiceRequests,
);

/**
 * GET /api/customer/serviceRequests/active?serviceType=
 * Active request for a service type (UX helper)
 */
router.get(
  '/active',
  detectLanguage,
  verifyAuth,
  requireRole('customer'),
  logRequest,
  getActiveServiceRequestForType,
);

/**
 * POST /api/customer/serviceRequests
 * Create a new service request
 */
router.post(
  '/',
  detectLanguage,
  verifyAuth,
  requireRole('customer'),
  logRequest,
  createServiceRequest,
);

/**
 * POST /api/customer/serviceRequests/request-area-providers
 * Notify admin that providers are needed for a service type in the customer's area
 */
router.post(
  '/request-area-providers',
  detectLanguage,
  verifyAuth,
  requireRole('customer'),
  logRequest,
  requestAreaProviders,
);

/**
 * GET /api/customer/serviceRequests/:serviceRequestId/provider-contact
 * Authorized provider phone after accept
 */
router.get(
  '/:serviceRequestId/provider-contact',
  detectLanguage,
  verifyAuth,
  requireRole('customer'),
  validateObjectId,
  logRequest,
  getProviderContactForServiceRequest,
);

/**
 * GET /api/customer/serviceRequests/:serviceRequestId
 * Get customer's single service request
 */
router.get(
  '/:serviceRequestId',
  detectLanguage,
  verifyAuth,
  requireRole('customer'),
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
  requireRole('customer'),
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
  requireRole('customer'),
  validateObjectId,
  validateCancellationReason,
  logRequest,
  cancelServiceRequest,
);

module.exports = router;
