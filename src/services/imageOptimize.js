/**
 * Server-side image normalize / compress (Sharp).
 * One delivery file — no original+variants. Prefer smaller size; never enlarge.
 */

const sharp = require('sharp');
const {createHttpError} = require('../utils/assetValidation');

/** @typedef {'profile'|'photo'|'logo'} OptimizeKind */

const PROFILES = Object.freeze({
  profile: {maxEdge: 800, quality: 78},
  photo: {maxEdge: 1200, quality: 80},
  logo: {maxEdge: 512, quality: 85},
});

const PURPOSE_TO_KIND = Object.freeze({
  'customer-profile': 'profile',
  'provider-profile': 'profile',
  'provider-showcase': 'photo',
  'service-request-photo': 'photo',
  'provider-request-photo': 'photo',
  'job-completion-photo': 'photo',
  'temp': 'photo',
});

function kindForPurpose(purpose) {
  return PURPOSE_TO_KIND[String(purpose || '').trim()] || 'photo';
}

function kindForObjectKey(key) {
  const k = String(key || '').toLowerCase();
  if (k.includes('/profile/')) return 'profile';
  if (k.includes('/logo/') || k.includes('/creatives/')) return 'logo';
  if (k.includes('/documents/')) return null; // never recompress docs here
  return 'photo';
}

function isOptimizableImageMime(mime) {
  const m = String(mime || '').toLowerCase();
  return (
    m === 'image/jpeg' ||
    m === 'image/jpg' ||
    m === 'image/png' ||
    m === 'image/webp'
  );
}

function extensionForKey(key) {
  const m = String(key || '')
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

/**
 * Choose output format that stays compatible with the object key extension.
 * Prefer JPEG for photos (smaller, universal). Keep WebP keys as WebP.
 */
function resolveOutputFormat(key, inputMime) {
  const ext = extensionForKey(key);
  if (ext === 'webp') return 'webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'png') {
    // Photos: convert PNG → JPEG for size. Logos with transparency stay PNG.
    return 'jpeg';
  }
  const mime = String(inputMime || '').toLowerCase();
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'jpeg';
  return 'jpeg';
}

function contentTypeForFormat(format) {
  if (format === 'webp') return 'image/webp';
  if (format === 'png') return 'image/png';
  return 'image/jpeg';
}

function extensionForFormat(format) {
  if (format === 'webp') return '.webp';
  if (format === 'png') return '.png';
  return '.jpg';
}

/**
 * @param {Buffer} buffer
 * @param {{ kind?: OptimizeKind, purpose?: string, key?: string, minBytesToProcess?: number }} [options]
 * @returns {Promise<{ buffer: Buffer, contentType: string, extension: string, width: number, height: number, originalBytes: number, optimizedBytes: number, skipped: boolean, reason?: string }>}
 */
async function optimizeImageBuffer(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createHttpError(400, 'Image buffer is required', 'Bad Request');
  }

  const originalBytes = buffer.length;
  const minBytes = options.minBytesToProcess ?? 40 * 1024;
  const kind =
    options.kind ||
    (options.purpose ? kindForPurpose(options.purpose) : null) ||
    (options.key ? kindForObjectKey(options.key) : null) ||
    'photo';

  if (kind == null) {
    return {
      buffer,
      contentType: options.contentType || 'application/octet-stream',
      extension: extensionForFormat('jpeg'),
      width: 0,
      height: 0,
      originalBytes,
      optimizedBytes: originalBytes,
      skipped: true,
      reason: 'not-an-image-category',
    };
  }

  const profile = PROFILES[kind] || PROFILES.photo;
  const format = resolveOutputFormat(options.key, options.contentType);

  let pipeline;
  try {
    pipeline = sharp(buffer, {failOn: 'none'}).rotate();
  } catch (err) {
    throw createHttpError(400, 'Invalid or corrupt image', 'Bad Request');
  }

  let meta;
  try {
    meta = await pipeline.metadata();
  } catch {
    throw createHttpError(400, 'Invalid or corrupt image', 'Bad Request');
  }

  const width = meta.width || 0;
  const height = meta.height || 0;
  const maxDim = Math.max(width, height);
  const needsResize = maxDim > profile.maxEdge;
  const alreadySmall =
    originalBytes < minBytes && !needsResize && format === 'jpeg' &&
    (meta.format === 'jpeg' || meta.format === 'jpg');

  if (alreadySmall) {
    return {
      buffer,
      contentType: contentTypeForFormat(format),
      extension: extensionForFormat(format),
      width,
      height,
      originalBytes,
      optimizedBytes: originalBytes,
      skipped: true,
      reason: 'already-small',
    };
  }

  let img = sharp(buffer, {failOn: 'none'}).rotate();
  if (needsResize) {
    img = img.resize({
      width: profile.maxEdge,
      height: profile.maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  img = img.withMetadata({orientation: undefined});

  let out;
  if (format === 'webp') {
    out = await img.webp({quality: profile.quality, effort: 4}).toBuffer({
      resolveWithObject: true,
    });
  } else if (format === 'png') {
    out = await img.png({compressionLevel: 8}).toBuffer({resolveWithObject: true});
  } else {
    out = await img
      .jpeg({quality: profile.quality, mozjpeg: true})
      .toBuffer({resolveWithObject: true});
  }

  const optimized = out.data;
  const outMeta = out.info || {};

  // Prefer the smaller payload. If resize was required, keep the resized file.
  if (optimized.length >= originalBytes && !needsResize) {
    return {
      buffer,
      contentType: options.contentType || contentTypeForFormat(format),
      extension: extensionForFormat(format),
      width,
      height,
      originalBytes,
      optimizedBytes: originalBytes,
      skipped: true,
      reason: 'no-savings',
    };
  }

  return {
    buffer: optimized,
    contentType: contentTypeForFormat(format),
    extension: extensionForFormat(format),
    width: outMeta.width || width,
    height: outMeta.height || height,
    originalBytes,
    optimizedBytes: optimized.length,
    skipped: false,
  };
}

/**
 * Replace file extension on an object key when format changes (e.g. .png → .jpg).
 */
function alignKeyExtension(key, extension) {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  if (!key || !/\.[a-z0-9]+$/i.test(key)) return `${key}${ext}`;
  return key.replace(/\.[a-z0-9]+$/i, ext);
}

module.exports = {
  PROFILES,
  kindForPurpose,
  kindForObjectKey,
  isOptimizableImageMime,
  optimizeImageBuffer,
  alignKeyExtension,
  contentTypeForFormat,
};
