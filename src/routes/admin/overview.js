/**
 * Admin Overview Routes
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {logRequest} = require('../../middleware/logger');
const {getOverviewStats} = require('../../controllers/admin/overviewController');

router.get(
  '/stats',
  requireRole('admin'),
  requirePermission(PERMISSIONS.OVERVIEW_VIEW),
  logRequest,
  getOverviewStats,
);

module.exports = router;
