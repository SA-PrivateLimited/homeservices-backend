/**
 * JWT access tokens signed with HMAC-SHA256 (HS256).
 * Set JWT_SECRET (or HMAC_JWT_SECRET) in environment — use a long random string in production.
 */

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || process.env.HMAC_JWT_SECRET;
/** Access token lifetime (override with JWT_EXPIRES_IN). */
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

function assertSecret() {
  if (!SECRET || SECRET.length < 32) {
    throw new Error(
      'JWT_SECRET (or HMAC_JWT_SECRET) must be set to a string of at least 32 characters',
    );
  }
}

/**
 * @param {{
 *   sub: string,
 *   email?: string,
 *   phone?: string,
 *   name?: string,
 *   role: string,
 *   permissions?: string[],
 * }} payload
 */
function signAccessToken(payload) {
  assertSecret();
  const body = {
    sub: payload.sub,
    email: payload.email || '',
    phone: payload.phone || '',
    name: payload.name || '',
    role: payload.role,
  };
  if (payload.role === 'admin') {
    body.permissions = Array.isArray(payload.permissions)
      ? payload.permissions
      : [];
  }
  return jwt.sign(body, SECRET, {
    algorithm: 'HS256',
    expiresIn: EXPIRES_IN,
  });
}

/**
 * Short-lived token after password check, before TOTP.
 * purpose: 'mfa_setup' | 'mfa_verify'
 */
function signMfaToken(payload, purpose) {
  assertSecret();
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email || '',
      role: payload.role,
      purpose,
    },
    SECRET,
    {
      algorithm: 'HS256',
      expiresIn: process.env.MFA_TOKEN_EXPIRES_IN || '10m',
    },
  );
}

/**
 * Session elevation after verifying the 4-digit Super Admin PIN.
 */
function signSuperAdminToken(payload) {
  assertSecret();
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email || '',
      role: payload.role || 'admin',
      purpose: 'superadmin',
    },
    SECRET,
    {
      algorithm: 'HS256',
      expiresIn: process.env.SUPER_ADMIN_TOKEN_EXPIRES_IN || '2h',
    },
  );
}

function verifyAccessToken(token) {
  assertSecret();
  return jwt.verify(token, SECRET, {algorithms: ['HS256']});
}

function verifyMfaToken(token, expectedPurpose) {
  assertSecret();
  const decoded = jwt.verify(token, SECRET, {algorithms: ['HS256']});
  if (expectedPurpose && decoded.purpose !== expectedPurpose) {
    const err = new Error('Invalid MFA token purpose');
    err.statusCode = 401;
    throw err;
  }
  return decoded;
}

function verifySuperAdminToken(token) {
  assertSecret();
  const decoded = jwt.verify(token, SECRET, {algorithms: ['HS256']});
  if (decoded.purpose !== 'superadmin') {
    const err = new Error('Invalid Super Admin session');
    err.statusCode = 401;
    throw err;
  }
  return decoded;
}

module.exports = {
  signAccessToken,
  signMfaToken,
  signSuperAdminToken,
  verifyAccessToken,
  verifyMfaToken,
  verifySuperAdminToken,
  get expiresIn() {
    return EXPIRES_IN;
  },
};
