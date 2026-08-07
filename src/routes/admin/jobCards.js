/**
 * Job Cards Routes (Admin App)
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {validatePagination, validateObjectId, validateJobCardStatus} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {
  getAllJobCards,
  getJobCardById,
  updateJobCard,
  deleteJobCard,
  assignProviderToJobCard,
  unassignProviderFromJobCard,
  addCommentToJobCard,
} = require('../../controllers/admin/jobCardsController');

const admin = requireRole('admin');

router.get(
  '/',
  admin,
  requirePermission(PERMISSIONS.JOBS_VIEW),
  validatePagination,
  logRequest,
  getAllJobCards,
);

router.get(
  '/:jobCardId',
  admin,
  requirePermission(PERMISSIONS.JOBS_VIEW),
  validateObjectId,
  logRequest,
  getJobCardById,
);

router.post(
  '/:jobCardId/assign',
  admin,
  requirePermission(PERMISSIONS.JOBS_ASSIGN),
  validateObjectId,
  logRequest,
  assignProviderToJobCard,
);

router.post(
  '/:jobCardId/unassign',
  admin,
  requirePermission(PERMISSIONS.JOBS_ASSIGN),
  validateObjectId,
  logRequest,
  unassignProviderFromJobCard,
);

router.post(
  '/:jobCardId/comments',
  admin,
  requirePermission(PERMISSIONS.JOBS_UPDATE),
  validateObjectId,
  logRequest,
  addCommentToJobCard,
);

router.put(
  '/:jobCardId',
  admin,
  requirePermission(PERMISSIONS.JOBS_UPDATE),
  validateObjectId,
  validateJobCardStatus,
  logRequest,
  updateJobCard,
);

router.delete(
  '/:jobCardId',
  admin,
  requirePermission(PERMISSIONS.JOBS_DELETE),
  validateObjectId,
  logRequest,
  deleteJobCard,
);

module.exports = router;
