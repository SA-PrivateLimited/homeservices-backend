/**
 * Admin Overview Routes
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {logRequest} = require('../../middleware/logger');
const {getOverviewStats} = require('../../controllers/admin/overviewController');

router.get('/stats', requireRole('admin'), logRequest, getOverviewStats);

module.exports = router;
