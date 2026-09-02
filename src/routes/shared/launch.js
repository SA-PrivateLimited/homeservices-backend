/**
 * CustomerWeb greeting gate — public status/complete; Super Admin configure.
 */

const express = require('express');
const router = express.Router();
const {requireRole, optionalAuth} = require('../../middleware/auth');
const {requireSuperAdmin} = require('../../middleware/requireSuperAdmin');
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
 * PUT /api/greeting/doodle — Super Admin only
 * Show/hide logo doodle, until when, icon, image URL.
 */
router.put(
  '/doodle',
  requireRole('admin'),
  requireSuperAdmin,
  logRequest,
  updateDoodleConfig,
);

/**
 * PUT /api/greeting — Super Admin only
 * Greeting overlay only (not the logo doodle).
 */
router.put(
  '/',
  requireRole('admin'),
  requireSuperAdmin,
  logRequest,
  updateLaunchConfig,
);

module.exports = router;
