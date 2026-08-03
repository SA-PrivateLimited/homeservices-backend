/**
 * Super Admin routes — elevate with 4-digit key; update key while elevated.
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../middleware/auth');
const {requireSuperAdmin} = require('../middleware/requireSuperAdmin');
const {logRequest} = require('../middleware/logger');
const {elevate, updateKey} = require('../controllers/superAdminController');

router.post('/elevate', requireRole('admin'), logRequest, elevate);
router.put(
  '/key',
  requireRole('admin'),
  requireSuperAdmin,
  logRequest,
  updateKey,
);

module.exports = router;
