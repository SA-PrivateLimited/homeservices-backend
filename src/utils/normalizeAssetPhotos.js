/**
 * Normalize service-request / review photo arrays.
 * Accepts CloudFront URLs, object keys, or {key,url} refs.
 * Rejects base64 data URLs and local file URIs.
 * Persists CloudFront (or local /uploads) URL strings for schema compatibility.
 */

const s3 = require('../services/s3.service');
const {
  assertKeyAuthorizedForUser,
  keyFromUrlOrKey,
  normalizeObjectKey,
} = require('./s3Keys');
const {createHttpError} = require('./assetValidation');

const MAX_PHOTOS = Number(process.env.MAX_SERVICE_REQUEST_PHOTOS || 3);

function isForbiddenInlinePayload(value) {
  const s = String(value || '').trim();
  if (!s) return true;
  if (/^data:/i.test(s)) return true;
  if (/base64,/i.test(s)) return true;
  if (/^(file|content|blob):/i.test(s)) return true;
  // Extremely large strings are almost certainly inline media
  if (s.length > 2048 && !/^https?:\/\//i.test(s)) return true;
  return false;
}

function resolvePublicUrl(key) {
  const normalized = normalizeObjectKey(key);
  if (
    String(process.env.AWS_S3_LOCAL_FALLBACK || '').toLowerCase() === 'true' &&
    (process.env.NODE_ENV || 'development') !== 'production'
  ) {
    const base = (
      process.env.PUBLIC_API_BASE_URL ||
      `http://127.0.0.1:${process.env.PORT || 3001}`
    ).replace(/\/+$/, '');
    return `${base}/uploads/${normalized}`;
  }
  return s3.generateCloudFrontUrl(normalized);
}

/**
 * @param {unknown} photos
 * @param {{ uid: string, role?: string }} user
 * @returns {string[]|undefined}
 */
function normalizePhotoReferences(photos, user, {max = MAX_PHOTOS} = {}) {
  if (photos == null) return undefined;
  if (!Array.isArray(photos)) {
    throw createHttpError(400, 'photos must be an array', 'Bad Request');
  }
  if (photos.length === 0) return [];
  if (photos.length > max) {
    throw createHttpError(
      400,
      `At most ${max} photos are allowed`,
      'Bad Request',
    );
  }

  return photos.map((item, index) => {
    let raw;
    if (typeof item === 'string') {
      raw = item.trim();
    } else if (item && typeof item === 'object') {
      raw = String(item.key || item.url || '').trim();
    } else {
      raw = '';
    }

    if (isForbiddenInlinePayload(raw)) {
      throw createHttpError(
        400,
        `photos[${index}] must be an uploaded asset reference (not base64 or local file)`,
        'Bad Request',
      );
    }

    // Legacy absolute URLs that are not our CloudFront domain: keep as-is for display
    // only if they already look like http(s) and are reasonably short (existing data).
    if (/^https?:\/\//i.test(raw)) {
      const domain = (
        process.env.AWS_CLOUDFRONT_DOMAIN || 'assets.akanso.in'
      ).replace(/^https?:\/\//, '');
      const localBase = (
        process.env.PUBLIC_API_BASE_URL || ''
      ).replace(/\/+$/, '');
      const isOurCdn = raw.startsWith(`https://${domain}/`);
      const isLocalUploads =
        Boolean(localBase) && raw.startsWith(`${localBase}/uploads/`);
      if (!isOurCdn && !isLocalUploads) {
        throw createHttpError(
          400,
          `photos[${index}] must use the assets CDN`,
          'Bad Request',
        );
      }
      const key = assertKeyAuthorizedForUser(keyFromUrlOrKey(raw), user);
      return resolvePublicUrl(key);
    }

    const key = assertKeyAuthorizedForUser(normalizeObjectKey(raw), user);
    return resolvePublicUrl(key);
  });
}

module.exports = {
  MAX_PHOTOS,
  isForbiddenInlinePayload,
  normalizePhotoReferences,
  resolvePublicUrl,
};
