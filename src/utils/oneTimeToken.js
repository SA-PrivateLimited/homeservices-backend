/**
 * Secure one-time invite tokens (shared primitive).
 * Used by Admin activation and Employee invitation — keep purpose separate at call sites.
 */

const crypto = require('crypto');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function hashInviteToken(plainToken) {
  return crypto.createHash('sha256').update(String(plainToken)).digest('hex');
}

function generateInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function issueInviteTokenBundle(ttlMs = DEFAULT_TTL_MS) {
  const plainToken = generateInviteToken();
  return {
    plainToken,
    tokenHash: hashInviteToken(plainToken),
    expiresAt: new Date(Date.now() + ttlMs),
  };
}

module.exports = {
  DEFAULT_TTL_MS,
  hashInviteToken,
  generateInviteToken,
  issueInviteTokenBundle,
};
