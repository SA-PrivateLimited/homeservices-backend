/**
 * Optimize an existing S3 (or local) image object in place when smaller.
 */

const s3 = require('./s3.service');
const {
  optimizeImageBuffer,
  isOptimizableImageMime,
  kindForObjectKey,
} = require('./imageOptimize');
const {isSensitiveObjectKey} = require('../utils/s3Keys');

async function streamToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * @param {string} key
 * @param {{ userId?: string, dryRun?: boolean, force?: boolean, kind?: 'profile'|'photo'|'logo' }} [options]
 */
async function optimizeStoredImage(key, options = {}) {
  const normalizedKey = key;
  if (isSensitiveObjectKey(normalizedKey)) {
    return {
      key: normalizedKey,
      skipped: true,
      reason: 'sensitive-document',
    };
  }
  const inferredKind = options.kind || kindForObjectKey(normalizedKey);
  if (inferredKind == null && !options.kind) {
    return {
      key: normalizedKey,
      skipped: true,
      reason: 'unsupported-key',
    };
  }

  const obj = await s3.getObject(normalizedKey, {userId: options.userId});
  const contentType = obj.contentType || '';
  if (!isOptimizableImageMime(contentType) && !/\.(jpe?g|png|webp)$/i.test(normalizedKey)) {
    return {
      key: normalizedKey,
      skipped: true,
      reason: 'not-image',
      contentType,
    };
  }

  const input = await streamToBuffer(obj.body);
  const originalBytes = input.length;
  const result = await optimizeImageBuffer(input, {
    key: normalizedKey,
    contentType: contentType || 'image/jpeg',
    kind: inferredKind || 'photo',
  });

  if (result.skipped || result.optimizedBytes >= originalBytes) {
    return {
      key: normalizedKey,
      skipped: true,
      reason: result.reason || 'no-savings',
      originalBytes,
      optimizedBytes: originalBytes,
      contentType,
    };
  }

  const savedBytes = originalBytes - result.optimizedBytes;
  if (options.dryRun) {
    return {
      key: normalizedKey,
      skipped: false,
      dryRun: true,
      originalBytes,
      optimizedBytes: result.optimizedBytes,
      savedBytes,
      contentType: result.contentType,
    };
  }

  await s3.uploadFile({
    body: result.buffer,
    key: normalizedKey,
    contentType: result.contentType,
    userId: options.userId,
    cacheControl: 'public, max-age=31536000, immutable',
  });

  return {
    key: normalizedKey,
    skipped: false,
    dryRun: false,
    originalBytes,
    optimizedBytes: result.optimizedBytes,
    savedBytes,
    contentType: result.contentType,
  };
}

module.exports = {
  streamToBuffer,
  optimizeStoredImage,
};
