/**
 * CustomerWeb launch gate — public status/complete; Super Admin configure.
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
} = require('../../controllers/shared/launchController');

/** GET /api/launch — public; optional JWT so per-person “already seen” works */
router.get('/', optionalAuth, logRequest, getLaunchStatus);

/** POST /api/launch/complete — GLOBAL closes for all; PER_PERSON marks this visitor */
router.post('/complete', optionalAuth, logRequest, completeLaunch);

/**
 * PUT /api/launch — Super Admin only
 * Configure state / name / message (CustomerWeb cannot set arbitrary state).
 */
router.put(
  '/',
  requireRole('admin'),
  requireSuperAdmin,
  logRequest,
  updateLaunchConfig,
);

module.exports = router;
