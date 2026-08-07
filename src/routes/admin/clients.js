/**
 * Admin Clients CRUD — Super Admin elevation required + clients.* permissions.
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requireSuperAdmin} = require('../../middleware/requireSuperAdmin');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {logRequest} = require('../../middleware/logger');
const {
  listClients,
  createClient,
  updateClient,
  activateClient,
  deleteClient,
} = require('../../controllers/shared/clientsController');

const gate = [requireRole('admin'), requireSuperAdmin];

router.get(
  '/',
  ...gate,
  requirePermission(PERMISSIONS.CLIENTS_VIEW),
  logRequest,
  listClients,
);
router.post(
  '/',
  ...gate,
  requirePermission(PERMISSIONS.CLIENTS_CREATE),
  logRequest,
  createClient,
);
router.put(
  '/:clientId',
  ...gate,
  requirePermission(PERMISSIONS.CLIENTS_UPDATE),
  logRequest,
  updateClient,
);
router.put(
  '/:clientId/activate',
  ...gate,
  requirePermission(PERMISSIONS.CLIENTS_UPDATE),
  logRequest,
  activateClient,
);
router.delete(
  '/:clientId',
  ...gate,
  requirePermission(PERMISSIONS.CLIENTS_DELETE),
  logRequest,
  deleteClient,
);

module.exports = router;
