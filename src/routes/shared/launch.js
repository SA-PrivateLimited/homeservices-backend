/**
 * CustomerWeb greeting gate — public status/complete; admin configure via greeting.*
 */

const express = require('express');
const router = express.Router();
const {requireRole, optionalAuth} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {logRequest} = require('../../middleware/logger');
const {
  getLaunchStatus,
  completeLaunch,
  updateLaunchConfig,
  getDoodleConfig,
  updateDoodleConfig,
} = require('../../controllers/shared/launchController');

/** GET /api/greeting — public; optional JWT so per-person “already seen” works */
router.get('/', optionalAuth, logRequest, getLaunchStatus);

/** GET /api/greeting/doodle — public logo-doodle status (admin-controlled) */
router.get('/doodle', optionalAuth, logRequest, getDoodleConfig);

/** POST /api/greeting/complete — GLOBAL closes for all; PER_PERSON marks this visitor */
router.post('/complete', optionalAuth, logRequest, completeLaunch);

/**
 * PUT /api/greeting/doodle — greeting.update
 * Show/hide logo doodle, until when, icon, image URL.
 */
router.put(
  '/doodle',
  requireRole('admin'),
  requirePermission(PERMISSIONS.GREETING_UPDATE),
  logRequest,
  updateDoodleConfig,
);

/**
 * PUT /api/greeting — greeting.update
 * Greeting overlay only (not the logo doodle).
 */
router.put(
  '/',
  requireRole('admin'),
  requirePermission(PERMISSIONS.GREETING_UPDATE),
  logRequest,
  updateLaunchConfig,
);

module.exports = router;
