/**
 * Job Cards Routes (Admin App)
 */

const express = require('express');
const router = express.Router();
const {requireRole} = require('../../middleware/auth');
const {validatePagination, validateObjectId, validateJobCardStatus} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {
  getAllJobCards,
  getJobCardById,
  updateJobCard,
  deleteJobCard,
} = require('../../controllers/admin/jobCardsController');

/**
 * GET /api/admin/jobCards
 * Get all job cards
 */
router.get(
  '/',
  requireRole('admin'),
  validatePagination,
  logRequest,
  getAllJobCards,
);

/**
 * GET /api/admin/jobCards/:jobCardId
 * Get single job card
 */
router.get(
  '/:jobCardId',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  getJobCardById,
);

/**
 * PUT /api/admin/jobCards/:jobCardId
 * Update job card
 */
router.put(
  '/:jobCardId',
  requireRole('admin'),
  validateObjectId,
  validateJobCardStatus,
  logRequest,
  updateJobCard,
);

/**
 * DELETE /api/admin/jobCards/:jobCardId
 * Delete job card
 */
router.delete(
  '/:jobCardId',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  deleteJobCard,
);

module.exports = router;
