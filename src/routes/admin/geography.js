/**
 * Admin Geography Routes
 * States → Districts → Providers
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {logRequest} = require('../../middleware/logger');
const {
  listStates,
  listDistrictsByState,
  listProvidersByDistrict,
  addProviderToDistrict,
  getGeographyMeta,
} = require('../../controllers/admin/geographyController');

const admin = requireRole('admin');

router.get(
  '/meta',
  admin,
  requirePermission(PERMISSIONS.GEOGRAPHY_VIEW),
  logRequest,
  getGeographyMeta,
);
router.get(
  '/states',
  admin,
  requirePermission(PERMISSIONS.GEOGRAPHY_VIEW),
  logRequest,
  listStates,
);
router.get(
  '/states/:stateId/districts',
  admin,
  requirePermission(PERMISSIONS.GEOGRAPHY_VIEW),
  logRequest,
  listDistrictsByState,
);
router.get(
  '/districts/:districtId/providers',
  admin,
  requirePermission(PERMISSIONS.GEOGRAPHY_VIEW),
  logRequest,
  listProvidersByDistrict,
);
router.post(
  '/districts/:districtId/providers',
  admin,
  requirePermission(PERMISSIONS.GEOGRAPHY_UPDATE),
  logRequest,
  addProviderToDistrict,
);

module.exports = router;
