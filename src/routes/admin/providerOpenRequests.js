/**
 * Admin — offline provider open-request matching policy.
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {logRequest} = require('../../middleware/logger');
const {
  getProviderOpenRequestSettings,
  updateProviderOpenRequestSettings,
} = require('../../controllers/admin/providerOpenRequestsController');

router.get(
  '/',
  requireRole('admin'),
  requirePermission(PERMISSIONS.PROVIDERS_VIEW),
  logRequest,
  getProviderOpenRequestSettings,
);

router.put(
  '/',
  requireRole('admin'),
  requirePermission(PERMISSIONS.PROVIDERS_UPDATE),
  logRequest,
  updateProviderOpenRequestSettings,
);

module.exports = router;
