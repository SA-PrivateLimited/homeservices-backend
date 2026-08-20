/**
 * User feedback routes
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, optionalAuth, requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {validateObjectId} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {
  createFeedback,
  listFeedback,
  updateFeedback,
} = require('../../controllers/shared/feedbackController');

/**
 * POST /api/feedback — public create (optional auth)
 */
router.post('/', optionalAuth, logRequest, createFeedback);

/**
 * GET /api/feedback — admin list
 */
router.get(
  '/',
  verifyAuth,
  requireRole('admin'),
  requirePermission(PERMISSIONS.CONTACTS_VIEW),
  logRequest,
  listFeedback,
);

/**
 * PUT /api/feedback/:id — admin update
 */
router.put(
  '/:id',
  verifyAuth,
  requireRole('admin'),
  requirePermission(PERMISSIONS.CONTACTS_UPDATE),
  validateObjectId,
  logRequest,
  updateFeedback,
);

module.exports = router;
