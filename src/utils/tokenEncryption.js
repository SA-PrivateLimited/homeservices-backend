/**
 * Encrypt / decrypt sensitive tokens for storage in MongoDB.
 * Uses AES-256-GCM (authenticated encryption).
 *
 * Set in .env:
 *   TOKEN_ENCRYPTION_KEY=<64 hex chars>   OR   <44-char base64 encoding 32 bytes>
 *
 * Generate a key:  openssl rand -hex 32
 */

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKeyBuffer() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!raw || typeof raw !== 'string') {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY (or ENCRYPTION_KEY) must be set in .env — use: openssl rand -hex 32',
    );
  }

  const trimmed = raw.trim();

  // 64 hex characters = 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // Base64-encoded 32 bytes (typically length 44)
  try {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === KEY_LENGTH) {
      return buf;
    }
  } catch {
    // fall through
  }

  throw new Error(
    'TOKEN_ENCRYPTION_KEY must be 64 hex characters (openssl rand -hex 32) or base64 of 32 bytes',
  );
}

/**
 * @param {string} plaintext - e.g. JWT string
 * @returns {string} Single base64 blob safe to store in MongoDB
 */
function encryptToken(plaintext) {
  if (typeof plaintext !== 'string' || !plaintext) {
    throw new Error('encryptToken: plaintext must be a non-empty string');
  }

  const key = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv, {authTagLength: AUTH_TAG_LENGTH});

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();
  // layout: iv (16) | authTag (16) | ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * @param {string} storedBase64 - value from MongoDB
 * @returns {string} Original plaintext (e.g. JWT)
 */
function decryptToken(storedBase64) {
  if (typeof storedBase64 !== 'string' || !storedBase64) {
    throw new Error('decryptToken: invalid stored value');
  }

  const key = getKeyBuffer();
  const combined = Buffer.from(storedBase64, 'base64');

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('decryptToken: corrupted payload');
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGO, key, iv, {authTagLength: AUTH_TAG_LENGTH});
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = {
  encryptToken,
  decryptToken,
};
