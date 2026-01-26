/**
 * Service Requests Routes (Provider App)
 * Provider-specific service request operations
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, requireRole} = require('../../middleware/auth');
const {
  getServiceRequestById,
  acceptServiceRequest,
  rejectServiceRequest,
} = require('../../controllers/provider/serviceRequestsController');

/**
 * GET /api/provider/serviceRequests/:serviceRequestId
 * Get service request by ID (provider can view any service request)
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
