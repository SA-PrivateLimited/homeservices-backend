/**
 * Upload validation — MIME allowlists, size limits, magic-byte checks.
 * Never trust client Content-Type or original filename alone.
 */

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
]);

const ALLOWED_DOCUMENT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
};

function createHttpError(statusCode, message, name = 'Error') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.name = name;
  return err;
}

function getMaxImageBytes() {
  const mb = Number(process.env.MAX_IMAGE_SIZE_MB || 5);
  const safe = Number.isFinite(mb) && mb > 0 ? mb : 5;
  return Math.floor(safe * 1024 * 1024);
}

function getMaxDocumentBytes() {
  const mb = Number(process.env.MAX_DOCUMENT_SIZE_MB || 8);
  const safe = Number.isFinite(mb) && mb > 0 ? mb : 8;
  return Math.floor(safe * 1024 * 1024);
}

/**
 * Detect image/PDF type from buffer magic bytes (or SVG text sniff).
 * @param {Buffer} buffer
 * @returns {string|null} detected MIME or null
 */
function detectMimeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return null;
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  // PDF
  if (buffer.toString('ascii', 0, 5) === '%PDF-') {
    return 'application/pdf';
  }

  // SVG (text) — sniff start of file; reject obvious script payloads
  const head = buffer
    .subarray(0, Math.min(buffer.length, 2048))
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  if (
    head.startsWith('<?xml') ||
    head.startsWith('<svg') ||
    head.includes('<svg')
  ) {
    if (
      head.includes('<script') ||
      head.includes('javascript:') ||
      head.includes('onload=')
    ) {
      return null;
    }
    if (head.includes('<svg')) {
      return 'image/svg+xml';
    }
  }

  return null;
}

/**
 * Validate an image upload buffer.
 * @returns {{ contentType: string, extension: string, size: number }}
 */
function validateImageBuffer(buffer, claimedMime) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createHttpError(400, 'File is required', 'Bad Request');
  }

  const maxBytes = getMaxImageBytes();
  if (buffer.length > maxBytes) {
    throw createHttpError(
      400,
      `Image exceeds maximum size of ${Math.round(maxBytes / (1024 * 1024))}MB`,
      'Bad Request',
    );
  }

  const detected = detectMimeFromBuffer(buffer);
  if (!detected || !ALLOWED_IMAGE_MIMES.has(detected)) {
    throw createHttpError(
      400,
      'Invalid image type. Allowed: JPEG, PNG, WebP, SVG',
      'Bad Request',
    );
  }

  // If client sent a MIME, it must agree with detection (when claimed is an image)
  if (
    claimedMime &&
    ALLOWED_IMAGE_MIMES.has(claimedMime) &&
    claimedMime !== detected
  ) {
    throw createHttpError(
      400,
      'Declared Content-Type does not match file contents',
      'Bad Request',
    );
  }

  return {
    contentType: detected,
    extension: MIME_TO_EXT[detected],
    size: buffer.length,
  };
}

/**
 * Validate provider document (image or PDF).
 */
function validateDocumentBuffer(buffer, claimedMime) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createHttpError(400, 'File is required', 'Bad Request');
  }

  const maxBytes = getMaxDocumentBytes();
  if (buffer.length > maxBytes) {
    throw createHttpError(
      400,
      `File exceeds maximum size of ${Math.round(maxBytes / (1024 * 1024))}MB`,
      'Bad Request',
    );
  }

  const detected = detectMimeFromBuffer(buffer);
  if (!detected || !ALLOWED_DOCUMENT_MIMES.has(detected)) {
    throw createHttpError(
      400,
      'Invalid file type. Allowed: JPEG, PNG, WebP, PDF',
      'Bad Request',
    );
  }

  if (
    claimedMime &&
    ALLOWED_DOCUMENT_MIMES.has(claimedMime) &&
    claimedMime !== detected
  ) {
    // image/jpg vs image/jpeg normalization
    const normalizedClaimed =
      claimedMime === 'image/jpg' ? 'image/jpeg' : claimedMime;
    if (normalizedClaimed !== detected) {
      throw createHttpError(
        400,
        'Declared Content-Type does not match file contents',
        'Bad Request',
      );
    }
  }

  return {
    contentType: detected,
    extension: MIME_TO_EXT[detected],
    size: buffer.length,
  };
}

module.exports = {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_DOCUMENT_MIMES,
  MIME_TO_EXT,
  getMaxImageBytes,
  getMaxDocumentBytes,
  detectMimeFromBuffer,
  validateImageBuffer,
  validateDocumentBuffer,
  createHttpError,
};
