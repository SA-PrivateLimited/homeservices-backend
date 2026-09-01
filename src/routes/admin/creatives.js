const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requireSuperAdmin} = require('../../middleware/requireSuperAdmin');
const {logRequest} = require('../../middleware/logger');
const {handleProfileImageUpload} = require('../../middleware/upload');
const creativesController = require('../../controllers/admin/creativesController');

router.use(requireRole('admin'), requireSuperAdmin);

router.get('/', logRequest, creativesController.listCreatives);
router.post(
  '/',
  handleProfileImageUpload,
  logRequest,
  creativesController.uploadCreative,
);
router.get('/:id/download', logRequest, creativesController.downloadCreative);
router.delete('/:id', logRequest, creativesController.deleteCreative);

module.exports = router;
