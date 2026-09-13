/**
 * Server-side image normalize / compress (Sharp).
 * One delivery file — no original+variants. Prefer smaller size; never enlarge.
 *
 * Profile photos target ≤100KB for browse/list speed and S3 cost.
 */

const sharp = require('sharp');
const {createHttpError} = require('../utils/assetValidation');

/** @typedef {'profile'|'photo'|'logo'} OptimizeKind */

const PROFILES = Object.freeze({
  // Browse lists show many avatars — keep these tiny.
  profile: {
    maxEdge: 640,
    quality: 72,
    maxBytes: 100 * 1024,
  },
  photo: {
    maxEdge: 1200,
    quality: 78,
    maxBytes: 250 * 1024,
  },
  logo: {
    maxEdge: 512,
    quality: 82,
    maxBytes: 80 * 1024,
  },
});

const PURPOSE_TO_KIND = Object.freeze({
  'customer-profile': 'profile',
  'provider-profile': 'profile',
  'provider-showcase': 'photo',
  'service-request-photo': 'photo',
  'provider-request-photo': 'photo',
  'job-completion-photo': 'photo',
  temp: 'photo',
});

function kindForPurpose(purpose) {
  return PURPOSE_TO_KIND[String(purpose || '').trim()] || 'photo';
}

function kindForObjectKey(key) {
  const k = String(key || '').toLowerCase();
  if (k.includes('/profile/')) return 'profile';
  if (k.includes('/logo/') || k.includes('/creatives/')) return 'logo';
  if (k.includes('/documents/')) return null;
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
 * Prefer JPEG for photos (smaller, universal). Keep WebP keys as WebP.
 */
function resolveOutputFormat(key, inputMime) {
  const ext = extensionForKey(key);
  if (ext === 'webp') return 'webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'png') return 'jpeg';
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

async function encodeAt(buffer, {maxEdge, quality, format}) {
  let img = sharp(buffer, {failOn: 'none'}).rotate();
  const meta = await img.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const maxDim = Math.max(width, height);

  img = sharp(buffer, {failOn: 'none'}).rotate();
  if (maxDim > maxEdge) {
    img = img.resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  img = img.withMetadata({orientation: undefined});

  let out;
  if (format === 'webp') {
    out = await img.webp({quality, effort: 4}).toBuffer({resolveWithObject: true});
  } else if (format === 'png') {
    out = await img.png({compressionLevel: 9}).toBuffer({resolveWithObject: true});
  } else {
    out = await img
      .jpeg({quality, mozjpeg: true, chromaSubsampling: '4:2:0'})
      .toBuffer({resolveWithObject: true});
  }

  return {
    buffer: out.data,
    width: out.info?.width || width,
    height: out.info?.height || height,
  };
}

/**
 * @param {Buffer} buffer
 * @param {{ kind?: OptimizeKind, purpose?: string, key?: string, contentType?: string, minBytesToProcess?: number, maxBytes?: number }} [options]
 */
async function optimizeImageBuffer(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createHttpError(400, 'Image buffer is required', 'Bad Request');
  }

  const originalBytes = buffer.length;
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
  const maxBytes = options.maxBytes ?? profile.maxBytes ?? 250 * 1024;
  const minBytes = options.minBytesToProcess ?? Math.min(40 * 1024, maxBytes);
  const format = resolveOutputFormat(options.key, options.contentType);

  let meta;
  try {
    meta = await sharp(buffer, {failOn: 'none'}).rotate().metadata();
  } catch {
    throw createHttpError(400, 'Invalid or corrupt image', 'Bad Request');
  }

  const width = meta.width || 0;
  const height = meta.height || 0;
  const maxDim = Math.max(width, height);

  // Only skip when already under the hard size budget.
  if (
    originalBytes <= maxBytes &&
    originalBytes < minBytes &&
    maxDim <= profile.maxEdge &&
    (meta.format === 'jpeg' || meta.format === 'jpg' || format === 'jpeg')
  ) {
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

  const attempts = [
    {maxEdge: profile.maxEdge, quality: profile.quality},
    {maxEdge: profile.maxEdge, quality: Math.max(50, profile.quality - 10)},
    {maxEdge: Math.round(profile.maxEdge * 0.85), quality: Math.max(48, profile.quality - 14)},
    {maxEdge: Math.round(profile.maxEdge * 0.7), quality: Math.max(45, profile.quality - 18)},
    {maxEdge: Math.round(profile.maxEdge * 0.55), quality: 42},
    {maxEdge: Math.min(400, profile.maxEdge), quality: 38},
  ];

  let best = null;
  for (const attempt of attempts) {
    const encoded = await encodeAt(buffer, {
      maxEdge: attempt.maxEdge,
      quality: attempt.quality,
      format,
    });
    if (!best || encoded.buffer.length < best.buffer.length) {
      best = encoded;
    }
    if (encoded.buffer.length <= maxBytes) {
      best = encoded;
      break;
    }
  }

  if (!best) {
    return {
      buffer,
      contentType: options.contentType || contentTypeForFormat(format),
      extension: extensionForFormat(format),
      width,
      height,
      originalBytes,
      optimizedBytes: originalBytes,
      skipped: true,
      reason: 'encode-failed',
    };
  }

  // Never store a larger file than the input.
  if (best.buffer.length >= originalBytes) {
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
    buffer: best.buffer,
    contentType: contentTypeForFormat(format),
    extension: extensionForFormat(format),
    width: best.width,
    height: best.height,
    originalBytes,
    optimizedBytes: best.buffer.length,
    skipped: false,
  };
}

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
