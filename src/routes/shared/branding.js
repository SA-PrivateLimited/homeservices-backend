/**
 * Branding — public active client themeColors
 */

const express = require('express');
const router = express.Router();
const {logRequest} = require('../../middleware/logger');
const {getBranding} = require('../../controllers/shared/clientsController');

/**
 * GET /api/branding
 */
router.get('/', logRequest, getBranding);

module.exports = router;
