/**
 * Admin Partner verification policy settings.
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {logRequest} = require('../../middleware/logger');
const {
  getPartnerVerificationSettings,
  updatePartnerVerificationSettings,
} = require('../../controllers/admin/partnerVerificationController');

router.get(
  '/',
  requireRole('admin'),
  requirePermission(PERMISSIONS.PROVIDERS_VIEW),
  logRequest,
  getPartnerVerificationSettings,
);

router.put(
  '/',
  requireRole('admin'),
  requirePermission(PERMISSIONS.PROVIDERS_UPDATE),
  logRequest,
  updatePartnerVerificationSettings,
);

module.exports = router;
