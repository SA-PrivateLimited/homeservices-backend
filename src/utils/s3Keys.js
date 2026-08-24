/**
 * Controlled S3 object-key builders.
 * Never trust client-supplied paths or filenames.
 */

const {randomUUID} = require('crypto');
const {createHttpError} = require('./assetValidation');

/** IAM-aligned root prefixes only */
const ALLOWED_ROOT_PREFIXES = Object.freeze([
  'customers',
  'providers',
  'services',
  'categories',
  'bookings',
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
 * Whether an authenticated principal may manage this object key.
 * - Admins may manage any allowed-prefix key
 * - Providers: providers/{theirId}/...
 * - Customers: customers/{theirId}/... or temp/{theirId}/...
 */
function assertKeyAuthorizedForUser(key, user) {
  const normalized = normalizeObjectKey(key);
  if (!user || !user.uid) {
    throw createHttpError(401, 'Authentication required', 'Unauthorized');
  }

  const role = user.role || 'customer';
  const uid = String(user.uid);

  if (role === 'admin') {
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

  // customer (default)
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

/**
 * Extract S3 key from a CloudFront URL if it matches our domain; otherwise treat as key.
 */
function keyFromUrlOrKey(urlOrKey) {
  if (!urlOrKey || typeof urlOrKey !== 'string') {
    throw createHttpError(400, 'Object key is required', 'Bad Request');
  }
  const raw = urlOrKey.trim();
  const domain = (
    process.env.AWS_CLOUDFRONT_DOMAIN || 'assets.akanso.in'
  ).replace(/^https?:\/\//, '');
  const cfPrefix = `https://${domain}/`;
  if (raw.startsWith(cfPrefix)) {
    return normalizeObjectKey(raw.slice(cfPrefix.length));
  }
  const localBase = (process.env.PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
  if (localBase) {
    const uploadsPrefix = `${localBase}/uploads/`;
    if (raw.startsWith(uploadsPrefix)) {
      return normalizeObjectKey(raw.slice(uploadsPrefix.length));
    }
  }
  // Loopback local-fallback URLs (http://127.0.0.1:3001/uploads/...)
  try {
    const parsed = new URL(raw);
    const loopback =
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '::1' ||
      parsed.hostname === '0.0.0.0';
    if (loopback && parsed.pathname.startsWith('/uploads/')) {
      return normalizeObjectKey(parsed.pathname.slice('/uploads/'.length));
    }
  } catch {
    /* not a URL */
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
  buildClientLogoKey,
  buildCategoryImageKey,
  buildServiceImageKey,
  buildBookingAttachmentKey,
  buildTempKey,
  buildCustomerServiceRequestPhotoKey,
  buildCustomerServiceRequestPhotoKeyForRequest,
  buildProviderRequestPhotoKey,
  buildProviderRequestDocumentKey,
  assertKeyAuthorizedForUser,
  keyFromUrlOrKey,
};
