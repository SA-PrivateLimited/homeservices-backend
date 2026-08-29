/**
 * Authenticated asset upload / delete endpoints.
 * Profile images: multipart → S3 (proxy).
 * Attachments: presigned PUT → S3 (or local direct PUT in dev fallback).
 */

const JobCard = require('../models/JobCard');
const User = require('../models/User');
const Provider = require('../models/Provider');
const ServiceRequest = require('../models/ServiceRequest');
const s3 = require('../services/s3.service');
const {
  validateImageBuffer,
  createHttpError,
  MIME_TO_EXT,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_DOCUMENT_MIMES,
  getMaxImageBytes,
  getMaxDocumentBytes,
} = require('../utils/assetValidation');
const {
  buildProviderProfileKey,
  buildProviderShowcaseKey,
  buildCustomerProfileKey,
  buildCustomerServiceRequestPhotoKey,
  buildCustomerServiceRequestPhotoKeyForRequest,
  buildProviderRequestPhotoKey,
  buildProviderRequestDocumentKey,
  buildJobCompletionPhotoKey,
  buildProviderDocumentKey,
  assertKeyAuthorizedForUser,
  keyFromUrlOrKey,
  normalizeObjectKey,
  isSensitiveObjectKey,
} = require('../utils/s3Keys');
const {signUploadToken, verifyUploadToken} = require('../utils/uploadToken');

const UPLOAD_PURPOSES = new Set([
  'service-request-photo',
  'provider-request-photo',
  'provider-request-document',
  'provider-document',
  'customer-profile',
  'provider-profile',
  'provider-showcase',
  'job-completion-photo',
  'temp',
]);

function extensionForContentType(contentType, {documents = false} = {}) {
  const mime = contentType === 'image/jpg' ? 'image/jpeg' : contentType;
  const allowed = documents ? ALLOWED_DOCUMENT_MIMES : ALLOWED_IMAGE_MIMES;
  if (!allowed.has(mime)) {
    throw createHttpError(
      400,
      documents
        ? 'Invalid file type. Allowed: JPEG, PNG, WebP, PDF'
        : 'Invalid image type. Allowed: JPEG, PNG, WebP',
      'Bad Request',
    );
  }
  if (!documents && mime === 'image/svg+xml') {
    throw createHttpError(400, 'SVG is not allowed for this upload', 'Bad Request');
  }
  return MIME_TO_EXT[mime];
}

async function assertProviderOwnsRequest(providerId, requestId) {
  const sr = await ServiceRequest.findById(String(requestId)).lean();
  if (!sr) {
    throw createHttpError(404, 'Service request not found', 'Not Found');
  }
  if (String(sr.providerId || '') !== String(providerId)) {
    throw createHttpError(
      403,
      'Not allowed to upload for this request',
      'Forbidden',
    );
  }
  return sr;
}

async function assertProviderOwnsJobCard(providerId, jobCardId) {
  const jobCard = await JobCard.findById(String(jobCardId)).lean();
  if (!jobCard) {
    throw createHttpError(404, 'Job card not found', 'Not Found');
  }
  if (String(jobCard.providerId || '') !== String(providerId)) {
    throw createHttpError(
      403,
      'Not allowed to upload for this job',
      'Forbidden',
    );
  }
  return jobCard;
}

function isPartnerActor(user) {
  if (!user) return false;
  const role = user.role || 'customer';
  const dbRole = user.dbRole || role;
  return role === 'provider' || role === 'admin' || dbRole === 'provider';
}

function isCustomerActor(user) {
  if (!user) return false;
  const role = user.role || 'customer';
  const activeRole = user.activeRole || role;
  return role === 'customer' || role === 'admin' || activeRole === 'customer';
}

function buildKeyForPurpose({purpose, user, contentType, requestId, docKey, jobCardId}) {
  const role = user.role || 'customer';
  const uid = String(user.uid);
  const partner = isPartnerActor(user);

  switch (purpose) {
    case 'service-request-photo': {
      if (!isCustomerActor(user)) {
        throw createHttpError(403, 'Only customers can upload request photos', 'Forbidden');
      }
      const ext = extensionForContentType(contentType, {documents: false});
      if (requestId) {
        return buildCustomerServiceRequestPhotoKeyForRequest(uid, requestId, ext);
      }
      return buildCustomerServiceRequestPhotoKey(uid, ext);
    }
    case 'provider-request-photo': {
      if (role !== 'provider' && role !== 'admin') {
        throw createHttpError(403, 'Only providers can upload request photos', 'Forbidden');
      }
      if (!requestId) {
        throw createHttpError(400, 'requestId is required', 'Bad Request');
      }
      const ext = extensionForContentType(contentType, {documents: false});
      return buildProviderRequestPhotoKey(uid, requestId, ext);
    }
    case 'provider-request-document': {
      if (role !== 'provider' && role !== 'admin') {
        throw createHttpError(403, 'Only providers can upload request documents', 'Forbidden');
      }
      if (!requestId) {
        throw createHttpError(400, 'requestId is required', 'Bad Request');
      }
      const ext = extensionForContentType(contentType, {documents: true});
      return buildProviderRequestDocumentKey(uid, requestId, ext);
    }
    case 'provider-document': {
      if (role !== 'provider' && role !== 'admin') {
        throw createHttpError(403, 'Only providers can upload documents', 'Forbidden');
      }
      if (!docKey) {
        throw createHttpError(400, 'docKey is required', 'Bad Request');
      }
      const ext = extensionForContentType(contentType, {documents: true});
      return buildProviderDocumentKey(uid, docKey, ext);
    }
    case 'customer-profile': {
      const ext = extensionForContentType(contentType, {documents: false});
      return buildCustomerProfileKey(uid, ext);
    }
    case 'provider-showcase': {
      if (!partner) {
        throw createHttpError(403, 'Only providers can upload showcase images', 'Forbidden');
      }
      const ext = extensionForContentType(contentType, {documents: false});
      return buildProviderShowcaseKey(uid, ext);
    }
    case 'job-completion-photo': {
      if (!partner) {
        throw createHttpError(403, 'Only providers can upload completion photos', 'Forbidden');
      }
      if (!jobCardId) {
        throw createHttpError(400, 'jobCardId is required', 'Bad Request');
      }
      const ext = extensionForContentType(contentType, {documents: false});
      return buildJobCompletionPhotoKey(uid, jobCardId, ext);
    }
    case 'provider-profile': {
      if (!partner) {
        throw createHttpError(403, 'Only providers can upload provider profile images', 'Forbidden');
      }
      const ext = extensionForContentType(contentType, {documents: false});
      return buildProviderProfileKey(uid, ext);
    }
    case 'temp': {
      const documents = ALLOWED_DOCUMENT_MIMES.has(contentType);
      const ext = extensionForContentType(contentType, {documents});
      const {buildTempKey} = require('../utils/s3Keys');
      return buildTempKey(uid, ext);
    }
    default:
      throw createHttpError(400, 'Unsupported upload purpose', 'Bad Request');
  }
}

/**
 * POST /api/assets/upload-url
 * Body: { fileName?, contentType, purpose, requestId?, docKey?, fileSize? }
 */
exports.createUploadUrl = async (req, res, next) => {
  try {
    if (!req.user?.uid) {
      throw createHttpError(401, 'Authentication required', 'Unauthorized');
    }

    const contentTypeRaw = String(req.body?.contentType || '').trim().toLowerCase();
    const contentType =
      contentTypeRaw === 'image/jpg' ? 'image/jpeg' : contentTypeRaw;
    const purpose = String(req.body?.purpose || '').trim();
    const requestId = req.body?.requestId
      ? String(req.body.requestId).trim()
      : '';
    const jobCardId = req.body?.jobCardId
      ? String(req.body.jobCardId).trim()
      : '';
    const docKey = req.body?.docKey ? String(req.body.docKey).trim() : '';
    const fileSize = Number(req.body?.fileSize);

    if (!purpose || !UPLOAD_PURPOSES.has(purpose)) {
      throw createHttpError(
        400,
        `purpose must be one of: ${[...UPLOAD_PURPOSES].join(', ')}`,
        'Bad Request',
      );
    }
    if (!contentType) {
      throw createHttpError(400, 'contentType is required', 'Bad Request');
    }

    const isDocumentPurpose =
      purpose === 'provider-request-document' || purpose === 'provider-document';
    const maxBytes = isDocumentPurpose
      ? getMaxDocumentBytes()
      : getMaxImageBytes();
    if (Number.isFinite(fileSize) && fileSize > 0 && fileSize > maxBytes) {
      throw createHttpError(
        400,
        `File exceeds maximum size of ${Math.round(maxBytes / (1024 * 1024))}MB`,
        'Bad Request',
      );
    }

    // Provider request uploads require ownership of the request
    if (
      (purpose === 'provider-request-photo' ||
        purpose === 'provider-request-document') &&
      req.user.role === 'provider'
    ) {
      await assertProviderOwnsRequest(req.user.uid, requestId);
    }

    if (purpose === 'job-completion-photo') {
      await assertProviderOwnsJobCard(req.user.uid, jobCardId);
    }

    // Optional: customer binding request id must belong to them if provided
    if (purpose === 'service-request-photo' && requestId && isCustomerActor(req.user)) {
      const sr = await ServiceRequest.findById(requestId).lean();
      if (!sr || String(sr.customerId) !== String(req.user.uid)) {
        throw createHttpError(
          403,
          'Not allowed to upload for this request',
          'Forbidden',
        );
      }
    }

    const key = buildKeyForPurpose({
      purpose,
      user: req.user,
      contentType,
      requestId,
      docKey,
      jobCardId,
    });

    const expiresIn = 900;
    let payload;

    if (s3.shouldUseS3Presign()) {
      try {
        payload = await s3.createPresignedPutUrl({
          key,
          contentType,
          expiresIn,
          userId: req.user.uid,
        });
      } catch (err) {
        if (err.code !== 'S3_PRESIGN_UNAVAILABLE' && err.statusCode !== 503) {
          throw err;
        }
        payload = null;
      }
    }

    if (!payload) {
      // Production must use IAM role → S3. Local disk only when explicitly allowed in dev.
      if (!s3.localDiskAllowed()) {
        throw createHttpError(
          503,
          'Photo upload requires S3 via the instance IAM role. Local disk fallback is disabled outside development.',
          'Storage Unavailable',
        );
      }
      // Local/dev fallback: client PUTs binary to our API with a short-lived token
      const token = signUploadToken(
        {
          key,
          userId: req.user.uid,
          contentType,
          maxBytes,
        },
        expiresIn,
      );
      const base = (
        process.env.PUBLIC_API_BASE_URL ||
        `http://127.0.0.1:${process.env.PORT || 3001}`
      ).replace(/\/+$/, '');
      payload = {
        uploadUrl: `${base}/api/assets/direct-upload/${token}`,
        key,
        // Relative path avoids persisting loopback hosts into shared Mongo docs.
        url: `/uploads/${normalizeObjectKey(key)}`,
        method: 'PUT',
        headers: {'Content-Type': contentType},
        expiresIn,
        storage: 'local',
      };
    }

    res.json({
      success: true,
      data: {
        uploadUrl: payload.uploadUrl,
        key: payload.key,
        url: payload.url,
        method: payload.method || 'PUT',
        headers: payload.headers || {'Content-Type': contentType},
        expiresIn: payload.expiresIn || expiresIn,
        storage: payload.storage,
        maxBytes,
        fileName: req.body?.fileName || undefined,
        // Documents remain capability-sensitive; see isSensitiveObjectKey / ASSET_UPLOAD_IAM.md
        sensitive: isSensitiveObjectKey(payload.key),
      },
      message: 'Upload URL created',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/assets/direct-upload/:token
 * Local/dev binary upload target (no JSON body).
 */
exports.directUpload = async (req, res, next) => {
  try {
    const tokenPayload = verifyUploadToken(req.params.token);
    const contentType = String(
      req.headers['content-type'] || tokenPayload.contentType,
    )
      .split(';')[0]
      .trim()
      .toLowerCase();
    const normalizedType =
      contentType === 'image/jpg' ? 'image/jpeg' : contentType;

    if (normalizedType !== tokenPayload.contentType) {
      throw createHttpError(
        400,
        'Content-Type does not match upload URL',
        'Bad Request',
      );
    }

    const chunks = [];
    let total = 0;
    const maxBytes = Number(tokenPayload.maxBytes) || getMaxImageBytes();

    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          reject(
            createHttpError(
              400,
              `File exceeds maximum size of ${Math.round(maxBytes / (1024 * 1024))}MB`,
              'Bad Request',
            ),
          );
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', resolve);
      req.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);
    if (!buffer.length) {
      throw createHttpError(400, 'Empty file', 'Bad Request');
    }

    // Magic-byte validation
    if (tokenPayload.contentType === 'application/pdf') {
      const {validateDocumentBuffer} = require('../utils/assetValidation');
      validateDocumentBuffer(buffer, tokenPayload.contentType);
    } else {
      validateImageBuffer(buffer, tokenPayload.contentType);
    }

    const uploaded = await s3.uploadFile({
      body: buffer,
      key: tokenPayload.key,
      contentType: tokenPayload.contentType,
      userId: tokenPayload.userId,
    });

    res.json({
      success: true,
      data: {
        key: uploaded.key,
        url: uploaded.url,
        contentType: uploaded.contentType,
        size: uploaded.size,
      },
      message: 'Uploaded successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/providers/me/profile-image
 * Provider uploads own profile image → providers/{uid}/profile/{uuid}.ext
 */
exports.uploadProviderProfileImage = async (req, res, next) => {
  try {
    if (!req.user?.uid) {
      throw createHttpError(401, 'Authentication required', 'Unauthorized');
    }
    if (!req.file?.buffer) {
      throw createHttpError(400, 'Image file is required (field: file)', 'Bad Request');
    }

    const validated = validateImageBuffer(req.file.buffer, req.file.mimetype);
    if (validated.contentType === 'image/svg+xml') {
      throw createHttpError(400, 'SVG is not allowed for profile images', 'Bad Request');
    }

    const providerId = req.user.uid;
    const provider = await Provider.findById(providerId);
    if (!provider) {
      throw createHttpError(404, 'Provider not found', 'Not Found');
    }

    const key = buildProviderProfileKey(providerId, validated.extension);
    const uploaded = await s3.uploadFile({
      body: req.file.buffer,
      key,
      contentType: validated.contentType,
      userId: providerId,
    });

    const previous = provider.profileImage;
    provider.profileImage = uploaded.url;
    provider.updatedAt = new Date();
    await provider.save();

    // Best-effort cleanup of previous CloudFront asset
    if (previous && previous !== uploaded.url) {
      try {
        const oldKey = keyFromUrlOrKey(previous);
        assertKeyAuthorizedForUser(oldKey, req.user);
        await s3.deleteObject(oldKey, {userId: providerId});
      } catch {
        /* ignore legacy /uploads or unauthorized old paths */
      }
    }

    res.json({
      success: true,
      data: {
        key: uploaded.key,
        url: uploaded.url,
        contentType: uploaded.contentType,
        size: uploaded.size,
        profileImage: uploaded.url,
      },
      message: 'Profile image uploaded successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/me/profile-image
 * Customer (or any authenticated user) profile image → customers/{uid}/profile/...
 */
exports.uploadCustomerProfileImage = async (req, res, next) => {
  try {
    if (!req.user?.uid) {
      throw createHttpError(401, 'Authentication required', 'Unauthorized');
    }
    if (!req.file?.buffer) {
      throw createHttpError(400, 'Image file is required (field: file)', 'Bad Request');
    }

    const validated = validateImageBuffer(req.file.buffer, req.file.mimetype);
    if (validated.contentType === 'image/svg+xml') {
      throw createHttpError(400, 'SVG is not allowed for profile images', 'Bad Request');
    }

    const userId = req.user.uid;
    const user = await User.findById(userId);
    if (!user) {
      throw createHttpError(404, 'User not found', 'Not Found');
    }

    const key = buildCustomerProfileKey(userId, validated.extension);
    const uploaded = await s3.uploadFile({
      body: req.file.buffer,
      key,
      contentType: validated.contentType,
      userId,
    });

    const previous = user.profileImage;
    user.profileImage = uploaded.url;
    user.updatedAt = new Date();
    await user.save();

    if (previous && previous !== uploaded.url) {
      try {
        const oldKey = keyFromUrlOrKey(previous);
        assertKeyAuthorizedForUser(oldKey, req.user);
        await s3.deleteObject(oldKey, {userId});
      } catch {
        /* ignore */
      }
    }

    res.json({
      success: true,
      data: {
        key: uploaded.key,
        url: uploaded.url,
        contentType: uploaded.contentType,
        size: uploaded.size,
        profileImage: uploaded.url,
      },
      message: 'Profile image uploaded successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/assets
 * Body: { key } or { url } — must belong to caller's authorized namespace
 */
exports.deleteAsset = async (req, res, next) => {
  try {
    if (!req.user?.uid) {
      throw createHttpError(401, 'Authentication required', 'Unauthorized');
    }

    const raw = req.body?.key || req.body?.url;
    if (!raw) {
      throw createHttpError(400, 'key or url is required', 'Bad Request');
    }

    const key = assertKeyAuthorizedForUser(keyFromUrlOrKey(raw), req.user);
    await s3.deleteObject(key, {userId: req.user.uid});

    res.json({
      success: true,
      data: {key, deleted: true},
      message: 'Asset deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
