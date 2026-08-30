/**
 * Admin — job-card chat (comments) policy.
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {logRequest} = require('../../middleware/logger');
const {
  getJobCommentsSettings,
  updateJobCommentsSettings,
} = require('../../controllers/admin/jobCommentsController');

router.get(
  '/',
  requireRole('admin'),
  requirePermission(PERMISSIONS.JOBS_VIEW),
  logRequest,
  getJobCommentsSettings,
);

router.put(
  '/',
  requireRole('admin'),
  requirePermission(PERMISSIONS.JOBS_UPDATE),
  logRequest,
  updateJobCommentsSettings,
);

module.exports = router;
