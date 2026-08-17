/**
 * Partner-to-Partner collaboration routes (Provider app).
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {logRequest} = require('../../middleware/logger');
const {validatePagination} = require('../../middleware/validate');
const {
  listCollaborationPartners,
  contactCollaborationPartner,
  createPartnerRequest,
  listOutgoingPartnerRequests,
  listIncomingPartnerRequests,
  getPartnerRequestById,
  acceptPartnerRequest,
  rejectPartnerRequest,
  cancelPartnerRequest,
  completePartnerCollaboration,
  listAssistingCollaborations,
} = require('../../controllers/provider/partnerCollaborationController');

router.get(
  '/partners',
  requireRole('provider'),
  validatePagination,
  logRequest,
  listCollaborationPartners,
);

router.post(
  '/partners/:providerId/contact',
  requireRole('provider'),
  logRequest,
  contactCollaborationPartner,
);

router.get(
  '/partnerRequests/assisting',
  requireRole('provider'),
  logRequest,
  listAssistingCollaborations,
);

router.get(
  '/partnerRequests/outgoing',
  requireRole('provider'),
  logRequest,
  listOutgoingPartnerRequests,
);

router.get(
  '/partnerRequests/incoming',
  requireRole('provider'),
  logRequest,
  listIncomingPartnerRequests,
);

router.post(
  '/partnerRequests',
  requireRole('provider'),
  logRequest,
  createPartnerRequest,
);

router.get(
  '/partnerRequests/:id',
  requireRole('provider'),
  logRequest,
  getPartnerRequestById,
);

router.put(
  '/partnerRequests/:id/accept',
  requireRole('provider'),
  logRequest,
  acceptPartnerRequest,
);

router.put(
  '/partnerRequests/:id/reject',
  requireRole('provider'),
  logRequest,
  rejectPartnerRequest,
);

router.put(
  '/partnerRequests/:id/cancel',
  requireRole('provider'),
  logRequest,
  cancelPartnerRequest,
);

router.put(
  '/partnerRequests/:id/complete',
  requireRole('provider'),
  logRequest,
  completePartnerCollaboration,
);

module.exports = router;
