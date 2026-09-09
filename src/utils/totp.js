/**
 * Admin TOTP (authenticator app) — no Twilio / SMS.
 * Uses otplib + encrypted secret stored on User.
 */

const {generateSecret, generateURI, verifySync} = require('otplib');
const QRCode = require('qrcode');
const {encryptToken, decryptToken} = require('./tokenEncryption');

const ISSUER_ADMIN = process.env.MFA_ISSUER || 'Akansho Admin';
const ISSUER_EMPLOYEE =
  process.env.MFA_ISSUER_EMPLOYEE || process.env.MFA_ISSUER || 'Akansho Employee';

function generateTotpSecret() {
  return generateSecret();
}

function buildOtpauthUrl(email, secret, issuer = ISSUER_ADMIN) {
  const label = (email || 'user').trim() || 'user';
  return generateURI({
    issuer,
    label,
    secret,
  });
}

async function buildQrDataUrl(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 220,
  });
}

function encryptTotpSecret(secret) {
  return encryptToken(secret);
}

function decryptTotpSecret(encrypted) {
  return decryptToken(encrypted);
}

/** False when TOKEN_ENCRYPTION_KEY changed or the stored blob is corrupt. */
function totpSecretIsReadable(encrypted) {
  if (!encrypted || typeof encrypted !== 'string') return false;
  try {
    decryptTotpSecret(encrypted);
    return true;
  } catch {
    return false;
  }
}

function verifyTotpCode(secret, code) {
  const token = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const result = verifySync({secret, token});
    return Boolean(result && result.valid);
  } catch {
    return false;
  }
}

module.exports = {
  ISSUER: ISSUER_ADMIN,
  ISSUER_ADMIN,
  ISSUER_EMPLOYEE,
  generateTotpSecret,
  buildOtpauthUrl,
  buildQrDataUrl,
  encryptTotpSecret,
  decryptTotpSecret,
  totpSecretIsReadable,
  verifyTotpCode,
};
