/**
 * Users API Routes (Shared)
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, requireRole} = require('../middleware/auth');
const {validatePagination, validateObjectId} = require('../middleware/validate');
const {logRequest} = require('../middleware/logger');
const {
  getMe,
  getUserById,
  updateMe,
  updateFcmToken,
  getAllUsers,
  createOrUpdateMe,
} = require('../controllers/usersController');

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get(
  '/me',
  verifyAuth,
  logRequest,
  getMe,
);

/**
 * GET /api/users/:userId
 * Get user by ID (limited fields for non-admin)
 */
router.get(
  '/:userId',
  verifyAuth,
  validateObjectId,
  logRequest,
  getUserById,
);

/**
 * POST /api/users/me
 * Create or update current user (upsert)
 * Used during signup/login to ensure user exists
 */
router.post(
  '/me',
  verifyAuth,
  logRequest,
  createOrUpdateMe,
);

/**
 * PUT /api/users/me
 * Update current user profile
 */
router.put(
  '/me',
  verifyAuth,
  logRequest,
  updateMe,
);

/**
 * PUT /api/users/:userId/fcmToken
 * Update FCM token for push notifications
 */
router.put(
  '/:userId/fcmToken',
  verifyAuth,
  validateObjectId,
  logRequest,
  updateFcmToken,
);

/**
 * GET /api/users
 * Get all users (admin only)
 */
router.get(
  '/',
  requireRole('admin'),
  validatePagination,
  logRequest,
  getAllUsers,
);

module.exports = router;
