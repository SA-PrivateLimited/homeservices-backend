const express = require('express');
const multer = require('multer');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requireSuperAdmin} = require('../../middleware/requireSuperAdmin');
const {logRequest} = require('../../middleware/logger');
const backupController = require('../../controllers/admin/backupController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: 80 * 1024 * 1024},
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.json') || file.mimetype === 'application/json') {
      cb(null, true);
      return;
    }
    cb(new Error('Upload a .json backup file.'));
  },
});

router.use(requireRole('admin'), requireSuperAdmin);

router.get('/summary', logRequest, backupController.getBackupSummary);
router.get('/export', logRequest, backupController.exportBackup);
router.post(
  '/restore',
  upload.single('backup'),
  logRequest,
  backupController.restoreBackup,
);

module.exports = router;
