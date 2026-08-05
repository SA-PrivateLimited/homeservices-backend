/**
 * Admin area provider demand routes
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, requireRole} = require('../../middleware/auth');
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
  logRequest,
  listAreaProviderDemands,
);

router.put(
  '/:id',
  verifyAuth,
  requireRole('admin'),
  validateObjectId,
  logRequest,
  updateAreaProviderDemand,
);

module.exports = router;
