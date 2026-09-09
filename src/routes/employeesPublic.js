/**
 * Public employee ID verification (QR target) — no auth.
 */

const express = require('express');
const router = express.Router();
const {logRequest} = require('../middleware/logger');
const {
  verifyEmployeePublic,
} = require('../controllers/admin/employeesController');

router.get('/verify/:token', logRequest, verifyEmployeePublic);

module.exports = router;
