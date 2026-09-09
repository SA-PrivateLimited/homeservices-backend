/**
 * Validate + Sharp-optimize an image buffer before S3 upload.
 */

const {validateImageBuffer, createHttpError} = require('../utils/assetValidation');
const {optimizeImageBuffer, isOptimizableImageMime} = require('./imageOptimize');

const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * @param {Buffer} buffer
 * @param {string} claimedMime
 * @param {{ purpose?: string, allowSvg?: boolean }} [options]
 */
async function prepareOptimizedImageUpload(buffer, claimedMime, options = {}) {
  const validated = validateImageBuffer(buffer, claimedMime);
  if (!options.allowSvg && validated.contentType === 'image/svg+xml') {
    throw createHttpError(400, 'SVG is not allowed for this upload', 'Bad Request');
  }
  if (!isOptimizableImageMime(validated.contentType)) {
    return {
      buffer: validated.buffer,
      contentType: validated.contentType,
      extension: validated.extension,
      originalBytes: validated.buffer.length,
      optimizedBytes: validated.buffer.length,
      skipped: true,
    };
  }

  const optimized = await optimizeImageBuffer(validated.buffer, {
    purpose: options.purpose,
    kind: options.kind,
    contentType: validated.contentType,
  });

  return {
    buffer: optimized.buffer,
    contentType: optimized.contentType,
    extension: optimized.extension.startsWith('.')
      ? optimized.extension
      : `.${optimized.extension}`,
    originalBytes: optimized.originalBytes,
    optimizedBytes: optimized.optimizedBytes,
    skipped: optimized.skipped,
    width: optimized.width,
    height: optimized.height,
  };
}

module.exports = {
  prepareOptimizedImageUpload,
  IMAGE_CACHE_CONTROL,
};
