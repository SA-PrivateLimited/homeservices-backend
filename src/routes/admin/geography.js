/**
 * Admin Geography Routes
 * States → Districts → Providers
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {logRequest} = require('../../middleware/logger');
const {
  listStates,
  listDistrictsByState,
  listProvidersByDistrict,
  addProviderToDistrict,
  getGeographyMeta,
} = require('../../controllers/admin/geographyController');

router.get('/meta', requireRole('admin'), logRequest, getGeographyMeta);
router.get('/states', requireRole('admin'), logRequest, listStates);
router.get(
  '/states/:stateId/districts',
  requireRole('admin'),
  logRequest,
  listDistrictsByState,
);
router.get(
  '/districts/:districtId/providers',
  requireRole('admin'),
  logRequest,
  listProvidersByDistrict,
);
router.post(
  '/districts/:districtId/providers',
  requireRole('admin'),
  logRequest,
  addProviderToDistrict,
);

module.exports = router;
