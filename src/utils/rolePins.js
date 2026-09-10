/**
 * Independent Customer vs Partner PINs on one Akansho User.
 *
 * Legacy fields (pinHash / pinKey / encryptedPin) remain the login PIN for
 * the user's primary role. Dual-role users get customerPin* / partnerPin*
 * so resetting one PIN never changes the other.
 *
 * Login PIN policy: exactly 4 numeric digits (Customer and Partner).
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {encryptToken} = require('./tokenEncryption');
const {hasCustomerProfile, hasPartnerProfile} = require('./userProfiles');

const PIN_SALT_ROUNDS = 12;
const PIN_LENGTH = 4;
const PIN_SELECT =
  '+pinHash +pinKey +encryptedPin +customerPinHash +customerPinKey +customerEncryptedPin +partnerPinHash +partnerPinKey +partnerEncryptedPin';

function isValidPin(pin) {
  return typeof pin === 'string' && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

function pinHmacKey(pin) {
  const secret = process.env.JWT_SECRET || process.env.HMAC_JWT_SECRET || 'pin';
  return crypto.createHmac('sha256', secret).update(`pin:${pin}`).digest('hex');
}

function pinClashQuery(key, excludeUserId) {
  const query = {
    $or: [{pinKey: key}, {customerPinKey: key}, {partnerPinKey: key}],
  };
  if (excludeUserId) query._id = {$ne: excludeUserId};
  return query;
}

async function assertPinGloballyUnique(User, pin, excludeUserId) {
  const key = pinHmacKey(pin);
  const existing = await User.findOne(pinClashQuery(key, excludeUserId))
    .select('_id')
    .lean();
  if (existing) {
    const err = new Error(
      'This PIN is already in use. Choose a different 4-digit PIN.',
    );
    err.statusCode = 409;
    throw err;
  }
  return key;
}

async function generateUniquePin(User, maxAttempts = 40) {
  const max = 10 ** PIN_LENGTH;
  for (let i = 0; i < maxAttempts; i++) {
    const pin = String(crypto.randomInt(0, max)).padStart(PIN_LENGTH, '0');
    try {
      await assertPinGloballyUnique(User, pin);
      return pin;
    } catch (e) {
      if (e.statusCode !== 409) throw e;
    }
  }
  const err = new Error('Could not allocate a unique PIN. Please try again.');
  err.statusCode = 503;
  throw err;
}

function resolvePinPurpose(raw, user) {
  const purpose = String(raw || '').trim().toLowerCase();
  // FE apps send auth role "provider"; PIN storage uses purpose "partner".
  if (purpose === 'provider' || purpose === 'partner') return 'partner';
  if (purpose === 'customer') return 'customer';
  if (hasPartnerProfile(user) && !hasCustomerProfile(user)) return 'partner';
  return 'customer';
}

function snapshotLegacyPins(user) {
  if (!user || !user.pinHash) return;
  if (!user.customerPinHash) {
    user.customerPinHash = user.pinHash;
    user.customerPinKey = user.pinKey;
    user.customerEncryptedPin = user.encryptedPin;
  }
  if (hasPartnerProfile(user) && !user.partnerPinHash) {
    user.partnerPinHash = user.pinHash;
    user.partnerPinKey = user.pinKey;
    user.partnerEncryptedPin = user.encryptedPin;
  }
}

function applyRolePin(user, {hash, key, encrypted}, purpose) {
  snapshotLegacyPins(user);
  if (purpose === 'customer') {
    user.customerPinHash = hash;
    user.customerPinKey = key;
    user.customerEncryptedPin = encrypted;
    if (!hasPartnerProfile(user)) {
      user.pinHash = hash;
      user.pinKey = key;
      user.encryptedPin = encrypted;
    }
    return;
  }
  if (purpose === 'partner') {
    user.partnerPinHash = hash;
    user.partnerPinKey = key;
    user.partnerEncryptedPin = encrypted;
    user.pinHash = hash;
    user.pinKey = key;
    user.encryptedPin = encrypted;
    return;
  }
  user.pinHash = hash;
  user.pinKey = key;
  user.encryptedPin = encrypted;
}

function pinHashForRole(user, role) {
  if (!user) return null;
  if (role === 'customer') return user.customerPinHash || user.pinHash || null;
  if (role === 'provider') return user.partnerPinHash || user.pinHash || null;
  return user.pinHash || null;
}

function encryptedPinForPurpose(user, purpose) {
  if (!user) return null;
  if (purpose === 'customer') {
    // Dual-role: legacy encryptedPin is the Partner slot — do not fall back to it.
    if (hasPartnerProfile(user)) {
      return user.customerEncryptedPin || null;
    }
    return user.customerEncryptedPin || user.encryptedPin || null;
  }
  if (purpose === 'partner') {
    return user.partnerEncryptedPin || user.encryptedPin || null;
  }
  return user.encryptedPin || null;
}

function hasPinForPurpose(user, purpose) {
  if (!user) return false;
  if (purpose === 'customer') {
    if (hasPartnerProfile(user)) {
      return Boolean(user.customerPinHash || user.customerEncryptedPin);
    }
    return Boolean(
      user.customerPinHash ||
        user.customerEncryptedPin ||
        user.pinHash ||
        user.encryptedPin,
    );
  }
  if (purpose === 'partner') {
    return Boolean(
      user.partnerPinHash || user.pinHash || user.encryptedPin,
    );
  }
  return Boolean(user.pinHash || user.encryptedPin);
}

async function hashAndEncryptPin(pin) {
  const hash = await bcrypt.hash(pin, PIN_SALT_ROUNDS);
  let encrypted = null;
  try {
    encrypted = encryptToken(pin);
  } catch (e) {
    const err = new Error(
      e.message ||
        'TOKEN_ENCRYPTION_KEY is required to store recoverable PINs',
    );
    err.statusCode = 500;
    throw err;
  }
  return {hash, encrypted};
}

module.exports = {
  PIN_LENGTH,
  PIN_SELECT,
  PIN_SALT_ROUNDS,
  isValidPin,
  pinHmacKey,
  pinClashQuery,
  assertPinGloballyUnique,
  generateUniquePin,
  resolvePinPurpose,
  snapshotLegacyPins,
  applyRolePin,
  pinHashForRole,
  encryptedPinForPurpose,
  hasPinForPurpose,
  hashAndEncryptPin,
};
