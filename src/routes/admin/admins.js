/**
 * Admin account management routes
 * Mounted at /api/admins
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {validateObjectId} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {
  updateAdminPermissions,
  inviteAdmin,
} = require('../../controllers/adminActivationController');

/**
 * POST /api/admins/invite
 * Super Admin invite (also available at POST /api/users/admins/invite)
 */
router.post('/invite', requireRole('admin'), logRequest, inviteAdmin);

/**
 * PATCH /api/admins/:id/permissions
 * Super Admin only (X-Super-Admin-Token). Applies on target's next login.
 */
router.patch(
  '/:id/permissions',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  updateAdminPermissions,
);

module.exports = router;
