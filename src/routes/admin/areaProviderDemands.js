/**
 * Admin area provider demand routes
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {validateObjectId} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {
  listAreaProviderDemands,
  updateAreaProviderDemand,
} = require('../../controllers/admin/areaProviderDemandsController');

router.get(
  '/',
  verifyAuth,
  requireRole('admin'),
  requirePermission(PERMISSIONS.PROVIDERS_VIEW),
  logRequest,
  listAreaProviderDemands,
);

router.put(
  '/:id',
  verifyAuth,
  requireRole('admin'),
  requirePermission(PERMISSIONS.PROVIDERS_UPDATE),
  validateObjectId,
  logRequest,
  updateAreaProviderDemand,
);

module.exports = router;
