/**
 * Employee Portal — /api/employee/*
 * Authenticated self-service only (not Admin).
 */

const express = require('express');
const router = express.Router();
const {logRequest} = require('../middleware/logger');
const {requireEmployee} = require('../middleware/requireEmployee');
const ctrl = require('../controllers/employeePortalController');

router.get('/me', logRequest, requireEmployee, ctrl.getMyProfile);
router.get(
  '/me/documents/:documentId/access',
  logRequest,
  requireEmployee,
  ctrl.getMyDocumentAccess,
);

module.exports = router;
