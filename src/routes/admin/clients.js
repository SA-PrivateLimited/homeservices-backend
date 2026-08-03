/**
 * Admin Clients CRUD — Super Admin elevation required.
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requireSuperAdmin} = require('../../middleware/requireSuperAdmin');
const {logRequest} = require('../../middleware/logger');
const {
  listClients,
  createClient,
  updateClient,
  activateClient,
  deleteClient,
} = require('../../controllers/shared/clientsController');

router.get(
  '/',
  requireRole('admin'),
  requireSuperAdmin,
  logRequest,
  listClients,
);
router.post(
  '/',
  requireRole('admin'),
  requireSuperAdmin,
  logRequest,
  createClient,
);
router.put(
  '/:clientId',
  requireRole('admin'),
  requireSuperAdmin,
  logRequest,
  updateClient,
);
router.put(
  '/:clientId/activate',
  requireRole('admin'),
  requireSuperAdmin,
  logRequest,
  activateClient,
);
router.delete(
  '/:clientId',
  requireRole('admin'),
  requireSuperAdmin,
  logRequest,
  deleteClient,
);

module.exports = router;
