/**
 * Admin Employees (HR) — /api/admin/employees
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {logRequest} = require('../../middleware/logger');
const {handleProfileImageUpload} = require('../../middleware/upload');
const multer = require('multer');
const {
  getMaxDocumentBytes,
  ALLOWED_DOCUMENT_MIMES,
  ALLOWED_IMAGE_MIMES,
} = require('../../utils/assetValidation');

const ctrl = require('../../controllers/admin/employeesController');

const gate = [requireRole('admin')];

const uploadEmployeeDoc = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: getMaxDocumentBytes()},
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype || '';
    if (
      (ALLOWED_IMAGE_MIMES && ALLOWED_IMAGE_MIMES.has?.(mime)) ||
      (ALLOWED_DOCUMENT_MIMES && ALLOWED_DOCUMENT_MIMES.has?.(mime)) ||
      mime === 'application/pdf'
    ) {
      return cb(null, true);
    }
    cb(new Error('Only images or PDF documents are allowed'));
  },
}).single('file');

function handleEmployeeDocUpload(req, res, next) {
  uploadEmployeeDoc(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: err.message || 'Upload failed',
      });
    }
    next();
  });
}

router.get(
  '/stats',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  logRequest,
  ctrl.getEmployeeStats,
);
router.get(
  '/meta',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  logRequest,
  ctrl.getEmployeeMeta,
);
router.get(
  '/lookups',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  logRequest,
  ctrl.listLookups,
);
router.post(
  '/lookups',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_UPDATE),
  logRequest,
  ctrl.createLookup,
);
router.delete(
  '/lookups/:id',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_UPDATE),
  logRequest,
  ctrl.deleteLookup,
);
router.get(
  '/',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  logRequest,
  ctrl.listEmployees,
);
router.post(
  '/',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_CREATE),
  logRequest,
  ctrl.createEmployee,
);
router.get(
  '/:id',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  logRequest,
  ctrl.getEmployee,
);
router.patch(
  '/:id',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_UPDATE),
  logRequest,
  ctrl.updateEmployee,
);
router.patch(
  '/:id/status',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_DEACTIVATE),
  logRequest,
  ctrl.updateEmployeeStatus,
);
router.post(
  '/:id/reinstate',
  ...gate,
  // Super Admin elevation is enforced inside the controller (not a normal Edit permission).
  requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  logRequest,
  ctrl.reinstateEmployee,
);
router.post(
  '/:id/invitation',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_UPDATE),
  logRequest,
  ctrl.inviteEmployee,
);
router.post(
  '/:id/invitation/revoke',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_UPDATE),
  logRequest,
  ctrl.revokeEmployeeInvite,
);
router.patch(
  '/:id/access',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_UPDATE),
  logRequest,
  ctrl.updateEmployeeAccess,
);
router.post(
  '/:id/compensation',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_SALARY),
  logRequest,
  ctrl.addCompensation,
);
router.post(
  '/:id/photo',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_UPDATE),
  logRequest,
  handleProfileImageUpload,
  ctrl.uploadPhoto,
);
router.post(
  '/:id/documents',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_DOCUMENTS),
  logRequest,
  handleEmployeeDocUpload,
  ctrl.addDocument,
);
router.delete(
  '/:id/documents/:documentId',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_DOCUMENTS),
  logRequest,
  ctrl.deleteDocument,
);
router.post(
  '/:id/id-card',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_ID_CARD),
  logRequest,
  ctrl.generateIdCard,
);
router.delete(
  '/:id',
  ...gate,
  requirePermission(PERMISSIONS.EMPLOYEES_DELETE),
  logRequest,
  ctrl.deleteEmployee,
);

module.exports = router;
