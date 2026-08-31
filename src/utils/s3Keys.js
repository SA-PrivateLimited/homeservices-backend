/**
 * Controlled S3 object-key builders.
 * Never trust client-supplied paths or filenames.
 */

const {randomUUID} = require('crypto');
const {createHttpError} = require('./assetValidation');

/**
 * Root prefixes in bucket `akanso-assets` (eu-north-1).
 * Local fallback writes the same relative paths under `uploads/`.
 * Never invent a top-level folder that is not already in the bucket.
 */
const ALLOWED_ROOT_PREFIXES = Object.freeze([
  'admin',
  'bookings',
  'categories',
  'customers',
  'providers',
  'services',
  'temp',
]);

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const SAFE_DOC_KEY_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function assertSafeId(value, label = 'id') {
  const id = String(value || '').trim();
  if (!SAFE_ID_RE.test(id)) {
    throw createHttpError(400, `Invalid ${label}`, 'Bad Request');
  }
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw createHttpError(400, `Invalid ${label}`, 'Bad Request');
  }
  return id;
}

function assertRootPrefix(prefix) {
  const root = String(prefix || '')
    .split('/')[0]
    .trim();
  if (!ALLOWED_ROOT_PREFIXES.includes(root)) {
    throw createHttpError(403, 'Unauthorized S3 prefix', 'Forbidden');
  }
  return root;
}

/**
 * Normalize and validate a full object key (no leading slash, no traversal).
 */
function normalizeObjectKey(key) {
  if (typeof key !== 'string' || !key.trim()) {
    throw createHttpError(400, 'Object key is required', 'Bad Request');
  }
  let k = key.trim().replace(/^\/+/, '');
  if (k.includes('..') || k.includes('\\') || k.includes('\0')) {
    throw createHttpError(400, 'Invalid object key', 'Bad Request');
  }
  if (k.includes('//')) {
    throw createHttpError(400, 'Invalid object key', 'Bad Request');
  }
  assertRootPrefix(k);
  return k;
}

/**
 * Build a UUID-based filename with a validated extension (includes leading dot).
 */
function buildUniqueFilename(extension) {
  const ext = String(extension || '').toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.pdf'];
  const safeExt = allowed.includes(ext) ? (ext === '.jpeg' ? '.jpg' : ext) : '.bin';
  return `${randomUUID()}${safeExt}`;
}

function buildProviderShowcaseKey(providerId, extension) {
  const id = assertSafeId(providerId, 'providerId');
  assertRootPrefix('providers');
  return `providers/${id}/showcase/${buildUniqueFilename(extension)}`;
}

function buildProviderProfileKey(providerId, extension) {
  const id = assertSafeId(providerId, 'providerId');
  assertRootPrefix('providers');
  return `providers/${id}/profile/${buildUniqueFilename(extension)}`;
}

function buildProviderDocumentKey(providerId, docKey, extension) {
  const id = assertSafeId(providerId, 'providerId');
  const doc = assertSafeId(docKey, 'docKey');
  if (!SAFE_DOC_KEY_RE.test(doc)) {
    throw createHttpError(400, 'Invalid docKey', 'Bad Request');
  }
  return `providers/${id}/documents/${doc}/${buildUniqueFilename(extension)}`;
}

function buildCustomerProfileKey(customerId, extension) {
  const id = assertSafeId(customerId, 'customerId');
  return `customers/${id}/profile/${buildUniqueFilename(extension)}`;
}

/** Admin-uploaded assets — bucket prefix `admin/`. */
function buildAdminAssetKey(adminId, extension) {
  const id = assertSafeId(adminId, 'adminId');
  assertRootPrefix('admin');
  return `admin/${id}/${buildUniqueFilename(extension)}`;
}

/** White-label client logos — under services/* (IAM-allowed) */
function buildClientLogoKey(clientId, extension) {
  const id = assertSafeId(clientId, 'clientId');
  return `services/branding/${id}/logo/${buildUniqueFilename(extension)}`;
}

function buildCategoryImageKey(categoryId, extension) {
  const id = assertSafeId(categoryId, 'categoryId');
  return `categories/${id}/${buildUniqueFilename(extension)}`;
}

function buildServiceImageKey(serviceId, extension) {
  const id = assertSafeId(serviceId, 'serviceId');
  return `services/${id}/${buildUniqueFilename(extension)}`;
}

function buildBookingAttachmentKey(bookingId, extension) {
  const id = assertSafeId(bookingId, 'bookingId');
  return `bookings/${id}/${buildUniqueFilename(extension)}`;
}

function buildTempKey(ownerId, extension) {
  const id = assertSafeId(ownerId, 'ownerId');
  return `temp/${id}/${buildUniqueFilename(extension)}`;
}

/**
 * Customer service-request photos before/after request id is known.
 * Path: customers/{customerId}/service-requests/pending/{uuid}.ext
 */
function buildCustomerServiceRequestPhotoKey(customerId, extension) {
  const id = assertSafeId(customerId, 'customerId');
  return `customers/${id}/service-requests/pending/${buildUniqueFilename(extension)}`;
}

/**
 * Customer service-request photos bound to a known request id.
 * Path: customers/{customerId}/service-requests/{requestId}/{uuid}.ext
 */
function buildCustomerServiceRequestPhotoKeyForRequest(
  customerId,
  requestId,
  extension,
) {
  const cid = assertSafeId(customerId, 'customerId');
  const rid = assertSafeId(requestId, 'requestId');
  return `customers/${cid}/service-requests/${rid}/${buildUniqueFilename(extension)}`;
}

/**
 * Provider job/request photos.
 * Path: providers/{providerId}/requests/{requestId}/photos/{uuid}.ext
 */
function buildProviderRequestPhotoKey(providerId, requestId, extension) {
  const pid = assertSafeId(providerId, 'providerId');
  const rid = assertSafeId(requestId, 'requestId');
  return `providers/${pid}/requests/${rid}/photos/${buildUniqueFilename(extension)}`;
}

/**
 * Provider job/request documents (PDF/images).
 * Path: providers/{providerId}/requests/{requestId}/documents/{uuid}.ext
 */
function buildProviderRequestDocumentKey(providerId, requestId, extension) {
  const pid = assertSafeId(providerId, 'providerId');
  const rid = assertSafeId(requestId, 'requestId');
  return `providers/${pid}/requests/${rid}/documents/${buildUniqueFilename(extension)}`;
}

/**
 * Provider job completion photos.
 * Path: providers/{providerId}/job-cards/{jobCardId}/completion/{uuid}.ext
 */
function buildJobCompletionPhotoKey(providerId, jobCardId, extension) {
  const pid = assertSafeId(providerId, 'providerId');
  const jid = assertSafeId(jobCardId, 'jobCardId');
  return `providers/${pid}/job-cards/${jid}/completion/${buildUniqueFilename(extension)}`;
}

/**
 * Whether an authenticated principal may manage this object key.
 * - Admins may manage any allowed-prefix key
 * - Acting as provider: providers/{theirId}/...
 * - Acting as customer: customers/{theirId}/... or temp/{theirId}/...
 *
 * Use JWT/effective role (`user.role`), not DB role. Dual-role users keep
 * dbRole "provider" while Customer Web issues a customer JWT; their request
 * photos live under customers/{uid}/.
 */
function assertKeyAuthorizedForUser(key, user) {
  const normalized = normalizeObjectKey(key);
  if (!user || !user.uid) {
    throw createHttpError(401, 'Authentication required', 'Unauthorized');
  }

  const role = user.role || user.activeRole || 'customer';
  const uid = String(user.uid);

  if (role === 'admin') {
    return normalized;
  }

  const actingAsCustomer = role === 'customer';
  if (actingAsCustomer) {
    const customerPrefix = `customers/${uid}/`;
    const tempPrefix = `temp/${uid}/`;
    if (
      !normalized.startsWith(customerPrefix) &&
      !normalized.startsWith(tempPrefix)
    ) {
      throw createHttpError(403, 'Not allowed to access this asset', 'Forbidden');
    }
    return normalized;
  }

  if (role === 'provider') {
    const prefix = `providers/${uid}/`;
    if (!normalized.startsWith(prefix)) {
      throw createHttpError(
        403,
        'Not allowed to access this asset',
        'Forbidden',
      );
    }
    return normalized;
  }

  throw createHttpError(403, 'Not allowed to access this asset', 'Forbidden');
}

/**
 * Extract S3 key from a CloudFront URL if it matches our domain; otherwise treat as key.
 * Accepts the canonical CDN host and optional legacy distribution hostname(s)
 * from AWS_CLOUDFRONT_DISTRIBUTION_HOSTNAME (comma-separated). Never accepts
 * raw S3 bucket URLs as permanent references.
 */
function keyFromUrlOrKey(urlOrKey) {
  if (!urlOrKey || typeof urlOrKey !== 'string') {
    throw createHttpError(400, 'Object key is required', 'Bad Request');
  }
  const raw = urlOrKey.trim();
  const domain = (
    process.env.AWS_CLOUDFRONT_DOMAIN || 'assets.akanso.in'
  )
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const acceptedHosts = new Set(
    [domain]
      .concat(
        String(process.env.AWS_CLOUDFRONT_DISTRIBUTION_HOSTNAME || '')
          .split(',')
          .map((h) =>
            h
              .trim()
              .replace(/^https?:\/\//, '')
              .replace(/\/+$/, ''),
          )
          .filter(Boolean),
      )
      .map((h) => h.toLowerCase()),
  );

  const localBase = (process.env.PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
  if (localBase) {
    const uploadsPrefix = `${localBase}/uploads/`;
    if (raw.startsWith(uploadsPrefix)) {
      return normalizeObjectKey(raw.slice(uploadsPrefix.length));
    }
  }

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (acceptedHosts.has(host)) {
      return normalizeObjectKey(parsed.pathname.replace(/^\/+/, ''));
    }
    const loopback =
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '::1' ||
      host === '0.0.0.0';
    if (loopback && parsed.pathname.startsWith('/uploads/')) {
      return normalizeObjectKey(parsed.pathname.slice('/uploads/'.length));
    }
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      throw createHttpError(
        400,
        'Only CloudFront asset URLs are accepted',
        'Bad Request',
      );
    }
  } catch (err) {
    if (err.statusCode) throw err;
    /* not an absolute URL — continue */
  }

  // Relative /uploads/... paths (legacy)
  if (raw.startsWith('/uploads/')) {
    return normalizeObjectKey(raw.slice('/uploads/'.length));
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    throw createHttpError(400, 'Only CloudFront asset URLs are accepted', 'Bad Request');
  }
  return normalizeObjectKey(raw);
}

/**
 * Sensitive object keys must not be treated as unrestricted public CDN content.
 * API responses already strip provider.documents from public browse payloads;
 * long-term these should use authenticated/signed GET rather than permanent
 * public CloudFront URLs. See ASSET_UPLOAD_IAM.md.
 */
function isSensitiveObjectKey(key) {
  const normalized = normalizeObjectKey(key);
  if (normalized.includes('/documents/')) return true;
  if (normalized.startsWith('bookings/')) return true;
  return false;
}

module.exports = {
  ALLOWED_ROOT_PREFIXES,
  assertSafeId,
  assertRootPrefix,
  normalizeObjectKey,
  buildUniqueFilename,
  buildProviderProfileKey,
  buildProviderShowcaseKey,
  buildProviderDocumentKey,
  buildCustomerProfileKey,
  buildAdminAssetKey,
  buildClientLogoKey,
  buildCategoryImageKey,
  buildServiceImageKey,
  buildBookingAttachmentKey,
  buildTempKey,
  buildCustomerServiceRequestPhotoKey,
  buildCustomerServiceRequestPhotoKeyForRequest,
  buildProviderRequestPhotoKey,
  buildProviderRequestDocumentKey,
  buildJobCompletionPhotoKey,
  assertKeyAuthorizedForUser,
  keyFromUrlOrKey,
  isSensitiveObjectKey,
};
