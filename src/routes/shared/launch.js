/**
 * CustomerWeb launch gate — public status/complete; Super Admin configure.
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requireSuperAdmin} = require('../../middleware/requireSuperAdmin');
const {logRequest} = require('../../middleware/logger');
const {
  getLaunchStatus,
  completeLaunch,
  updateLaunchConfig,
} = require('../../controllers/shared/launchController');

/** GET /api/launch — public launch status + tribute config */
router.get('/', logRequest, getLaunchStatus);

/** POST /api/launch/complete — public idempotent LAUNCH → NORMAL */
router.post('/complete', logRequest, completeLaunch);

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
