/**
 * Short-lived HMAC tokens for local/dev direct uploads (when S3 presign unavailable).
 */

const crypto = require('crypto');
const {createHttpError} = require('./assetValidation');

function getUploadSecret() {
  return (
    process.env.UPLOAD_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    'dev-upload-token-secret-change-me'
  );
}

function signUploadToken(payload, ttlSeconds = 900) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = {
    key: payload.key,
    userId: payload.userId,
    contentType: payload.contentType,
    maxBytes: payload.maxBytes,
    exp,
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getUploadSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyUploadToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    throw createHttpError(400, 'Invalid upload token', 'Bad Request');
  }
  const [encoded, sig] = token.split('.');
  const expected = crypto
    .createHmac('sha256', getUploadSecret())
    .update(encoded)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw createHttpError(403, 'Invalid upload token', 'Forbidden');
  }
  let body;
  try {
    body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw createHttpError(400, 'Invalid upload token', 'Bad Request');
  }
  if (!body?.key || !body?.userId || !body?.contentType || !body?.exp) {
    throw createHttpError(400, 'Invalid upload token', 'Bad Request');
  }
  if (Number(body.exp) < Math.floor(Date.now() / 1000)) {
    throw createHttpError(403, 'Upload URL expired. Please try again.', 'Forbidden');
  }
  return body;
}

module.exports = {
  signUploadToken,
  verifyUploadToken,
};
