/**
 * Admin contact privacy settings.
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {logRequest} = require('../../middleware/logger');
const {
  getContactPrivacySettings,
  updateContactPrivacySettings,
  listContactPrivacyAudit,
} = require('../../controllers/admin/contactPrivacyController');

router.get(
  '/',
  requireRole('admin'),
  requirePermission(PERMISSIONS.CONTACTS_VIEW),
  logRequest,
  getContactPrivacySettings,
);

router.put(
  '/',
  requireRole('admin'),
  requirePermission(PERMISSIONS.CONTACTS_UPDATE),
  logRequest,
  updateContactPrivacySettings,
);

router.get(
  '/audit',
  requireRole('admin'),
  requirePermission(PERMISSIONS.CONTACTS_VIEW),
  logRequest,
  listContactPrivacyAudit,
);

module.exports = router;
