/**
 * Service Requests Routes (Provider App)
 * Provider-specific service request operations
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, requireRole} = require('../../middleware/auth');
const {
  getMyPendingServiceRequests,
  getNearbyPendingServiceRequests,
  getServiceRequestById,
  acceptServiceRequest,
  rejectServiceRequest,
} = require('../../controllers/provider/serviceRequestsController');
const {
  getCustomerContactForServiceRequest,
} = require('../../controllers/contactController');

/**
 * GET /api/provider/serviceRequests/pending
 * Pending requests assigned specifically to this provider
 */
router.get(
  '/pending',
  verifyAuth,
  requireRole('provider'),
  getMyPendingServiceRequests,
);

/**
 * GET /api/provider/serviceRequests/nearby-pending
 * Open pending requests in provider's area (poll fallback for accept cards)
 */
router.get(
  '/nearby-pending',
  verifyAuth,
  requireRole('provider'),
  getNearbyPendingServiceRequests,
);

/**
 * GET /api/provider/serviceRequests/:serviceRequestId/customer-contact
 * Authorized customer phone after accept
 */
router.get(
  '/:serviceRequestId/customer-contact',
  verifyAuth,
  requireRole('provider'),
  getCustomerContactForServiceRequest,
);

/**
 * GET /api/provider/serviceRequests/:serviceRequestId
 * Get service request by ID (assigned / pending open)
 */
router.get(
  '/:serviceRequestId',
  verifyAuth,
  requireRole('provider'),
  getServiceRequestById,
);

/**
 * PUT /api/provider/serviceRequests/:serviceRequestId/accept
 * Accept a service request (provider endpoint)
 */
router.put(
  '/:serviceRequestId/accept',
  verifyAuth,
  requireRole('provider'),
  acceptServiceRequest,
);

/**
 * PUT /api/provider/serviceRequests/:serviceRequestId/reject
 * Reject a service request (provider endpoint)
 */
router.put(
  '/:serviceRequestId/reject',
  verifyAuth,
  requireRole('provider'),
  rejectServiceRequest,
);

module.exports = router;
