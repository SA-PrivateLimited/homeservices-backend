/**
 * Public Geography Routes — states/districts meta for customer & provider apps
 */

const express = require('express');
const router = express.Router();
const {optionalAuth} = require('../../middleware/auth');
const {logRequest} = require('../../middleware/logger');
const {getGeographyMeta} = require('../../controllers/admin/geographyController');

router.get('/meta', optionalAuth, logRequest, getGeographyMeta);

module.exports = router;
