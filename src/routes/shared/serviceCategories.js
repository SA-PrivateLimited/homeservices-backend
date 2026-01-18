/**
 * Service Categories Routes (Shared - all apps)
 */

const express = require('express');
const router = express.Router();
const {optionalAuth, requireRole} = require('../../middleware/auth');
const {validateObjectId} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../../controllers/shared/serviceCategoriesController');

/**
 * GET /api/serviceCategories
 * Get all service categories (public)
 */
router.get(
  '/',
  optionalAuth,
  logRequest,
  getCategories,
);

/**
 * GET /api/serviceCategories/:categoryId
 * Get single category (public)
 */
router.get(
  '/:categoryId',
  optionalAuth,
  validateObjectId,
  logRequest,
  getCategoryById,
);

/**
 * POST /api/serviceCategories
 * Create category (admin only)
 */
router.post(
  '/',
  requireRole('admin'),
  logRequest,
  createCategory,
);

/**
 * PUT /api/serviceCategories/:categoryId
 * Update category (admin only)
 */
router.put(
  '/:categoryId',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  updateCategory,
);

/**
 * DELETE /api/serviceCategories/:categoryId
 * Delete category (admin only)
 */
router.delete(
  '/:categoryId',
  requireRole('admin'),
  validateObjectId,
  logRequest,
  deleteCategory,
);

module.exports = router;
