/**
 * Normalize service-request / provider showcase photo arrays.
 * Accepts CloudFront URLs, /uploads/… paths, object keys, or {key,url} refs.
 * Rejects base64 data URLs and local file URIs.
 * Persists CloudFront URLs when S3 is in use; keeps /uploads/… when local disk fallback is on.
 */

const s3 = require('../services/s3.service');
const {
  assertKeyAuthorizedForUser,
  keyFromUrlOrKey,
  normalizeObjectKey,
} = require('./s3Keys');
const {createHttpError} = require('./assetValidation');

const MAX_PHOTOS = Number(process.env.MAX_SERVICE_REQUEST_PHOTOS || 3);

function cloudFrontDomain() {
  return (process.env.AWS_CLOUDFRONT_DOMAIN || 'assets.akanso.in')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

function isForbiddenInlinePayload(value) {
  const s = String(value || '').trim();
  if (!s) return true;
  if (/^data:/i.test(s)) return true;
  if (/base64,/i.test(s)) return true;
  if (/^(file|content|blob):/i.test(s)) return true;
  if (s.length > 2048 && !/^https?:\/\//i.test(s) && !s.startsWith('/uploads/')) {
    return true;
  }
  return false;
}

function isLoopbackHostname(hostname) {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '0.0.0.0'
  );
}

/** True when the string is one of our asset references (CDN, local uploads, or key). */
function isAcceptedAssetReference(raw) {
  const domain = cloudFrontDomain();
  if (raw.startsWith(`https://${domain}/`)) return true;
  if (raw.startsWith('/uploads/')) return true;
  if (!/^https?:\/\//i.test(raw) && !raw.startsWith('/')) {
    // Bare object key — validated later by normalizeObjectKey
    return true;
  }
  try {
    const parsed = new URL(raw);
    if (isLoopbackHostname(parsed.hostname) && parsed.pathname.startsWith('/uploads/')) {
      return true;
    }
    // Optional legacy distribution hostname(s) — rewritten to canonical CDN on persist
    const legacyHosts = String(process.env.AWS_CLOUDFRONT_DISTRIBUTION_HOSTNAME || '')
      .split(',')
      .map((h) => h.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase())
      .filter(Boolean);
    if (legacyHosts.includes(parsed.hostname.toLowerCase())) {
      return true;
    }
  } catch {
    /* not a URL */
  }
  const localBase = (process.env.PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
  if (localBase && raw.startsWith(`${localBase}/uploads/`)) return true;
  return false;
}

/** CloudFront in normal mode; relative /uploads/… when local disk fallback is active. */
function resolvePublicUrl(key) {
  const normalized = normalizeObjectKey(key);
  if (s3.localDiskAllowed()) {
    return s3.generateLocalUrl(normalized);
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

    if (!isAcceptedAssetReference(raw)) {
      throw createHttpError(
        400,
        `photos[${index}] must use the assets CDN (https://${cloudFrontDomain()}/…)`,
        'Bad Request',
      );
    }

    // Always go through keyFromUrlOrKey so /uploads/… and loopback URLs
    // are stripped to providers|customers|… keys (never treat "uploads" as root).
    const key = assertKeyAuthorizedForUser(keyFromUrlOrKey(raw), user);
    return resolvePublicUrl(key);
  });
}

module.exports = {
  MAX_PHOTOS,
  isForbiddenInlinePayload,
  normalizePhotoReferences,
  resolvePublicUrl,
};
