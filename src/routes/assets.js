/**
 * Asset routes — presigned upload URL, local direct upload, authorized delete.
 * Profile image multipart handlers are mounted from users/providers routes.
 */

const express = require('express');
const router = express.Router();
const {verifyAuth, requireRole} = require('../middleware/auth');
const {logRequest} = require('../middleware/logger');
const {handleProfileImageUpload} = require('../middleware/upload');
const {
  uploadProviderProfileImage,
  uploadCustomerProfileImage,
  deleteAsset,
  createUploadUrl,
  directUpload,
} = require('../controllers/assetsController');

/**
 * POST /api/assets/upload-url
 * Issue a short-lived PUT URL (S3 presign or local direct-upload token).
 */
router.post('/upload-url', verifyAuth, logRequest, createUploadUrl);

/**
 * PUT /api/assets/direct-upload/:token
 * Binary body — used when S3 presign is unavailable (local fallback).
 * Auth is the HMAC token (not Bearer), so no verifyAuth.
 */
router.put('/direct-upload/:token', directUpload);

/**
 * DELETE /api/assets
 * Delete an object the caller is authorized to manage.
 * Body: { "key": "providers/<id>/profile/<uuid>.webp" }
 *    or { "url": "https://assets.akanso.in/..." }
 */
router.delete('/', verifyAuth, logRequest, deleteAsset);

module.exports = {
  router,
  /** Mount helpers used from other route files */
  handleProfileImageUpload,
  uploadProviderProfileImage,
  uploadCustomerProfileImage,
  requireRole,
  verifyAuth,
  logRequest,
};
