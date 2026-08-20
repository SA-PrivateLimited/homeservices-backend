/**
 * Service Categories Routes (Shared - all apps)
 */

const express = require('express');
const router = express.Router();
const {optionalAuth, requireRole} = require('../../middleware/auth');
const {requirePermission} = require('../../middleware/requirePermission');
const {PERMISSIONS} = require('../../constants/permissions');
const {validateObjectId} = require('../../middleware/validate');
const {logRequest} = require('../../middleware/logger');
const {
  getCategories,
  getCategoryById,
  getCategorySections,
  createCategorySection,
  updateCategorySection,
  deleteCategorySection,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../../controllers/shared/serviceCategoriesController');

/**
 * GET /api/serviceCategories
 * Get all service categories (public)
 */
router.get('/', optionalAuth, logRequest, getCategories);

/**
 * GET /api/serviceCategories/sections
 * Browse section titles (public) — must be before /:categoryId
 */
router.get('/sections', optionalAuth, logRequest, getCategorySections);

/**
 * POST /api/serviceCategories/sections
 * Create browse section (admin)
 */
router.post(
  '/sections',
  requireRole('admin'),
  requirePermission(PERMISSIONS.CATEGORIES_CREATE),
  logRequest,
  createCategorySection,
);

/**
 * PUT /api/serviceCategories/sections/:sectionKey
 * Update browse section (admin)
 */
router.put(
  '/sections/:sectionKey',
  requireRole('admin'),
  requirePermission(PERMISSIONS.CATEGORIES_UPDATE),
  validateObjectId,
  logRequest,
  updateCategorySection,
);

/**
 * DELETE /api/serviceCategories/sections/:sectionKey
 * Delete browse section (admin)
 */
router.delete(
  '/sections/:sectionKey',
  requireRole('admin'),
  requirePermission(PERMISSIONS.CATEGORIES_DELETE),
  validateObjectId,
  logRequest,
  deleteCategorySection,
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
  requirePermission(PERMISSIONS.CATEGORIES_CREATE),
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
  requirePermission(PERMISSIONS.CATEGORIES_UPDATE),
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
  requirePermission(PERMISSIONS.CATEGORIES_DELETE),
  validateObjectId,
  logRequest,
  deleteCategory,
);

module.exports = router;
