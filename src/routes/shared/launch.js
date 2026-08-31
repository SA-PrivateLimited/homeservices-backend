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
} = require('../../controllers/shared/launchController');

/** GET /api/greeting — public; optional JWT so per-person “already seen” works */
router.get('/', optionalAuth, logRequest, getLaunchStatus);

/** POST /api/greeting/complete — GLOBAL closes for all; PER_PERSON marks this visitor */
router.post('/complete', optionalAuth, logRequest, completeLaunch);

/**
 * PUT /api/greeting — Super Admin only
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
