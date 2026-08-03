/**
 * Super Admin 4-digit PIN helpers.
 * Default PIN: 7509 (override with SUPER_ADMIN_PIN env until first DB persist).
 */

const bcrypt = require('bcryptjs');
const SystemConfig = require('../models/SystemConfig');

const DEFAULT_PIN = '7509';
const SALT_ROUNDS = 12;

function assertFourDigitPin(pin) {
  const code = String(pin || '').trim();
  if (!/^\d{4}$/.test(code)) {
    const err = new Error('Super Admin key must be exactly 4 digits');
    err.statusCode = 400;
    throw err;
  }
  return code;
}

async function ensureConfig() {
  let config = await SystemConfig.findById('global');
  if (config?.superAdminKeyHash) return config;

  const plain = assertFourDigitPin(
    process.env.SUPER_ADMIN_PIN || DEFAULT_PIN,
  );
  const superAdminKeyHash = await bcrypt.hash(plain, SALT_ROUNDS);
  config = await SystemConfig.findByIdAndUpdate(
    'global',
    {
      $set: {
        superAdminKeyHash,
        updatedAt: new Date(),
      },
      $setOnInsert: {_id: 'global'},
    },
    {upsert: true, new: true},
  );
  return config;
}

async function verifySuperAdminPin(pin) {
  const code = assertFourDigitPin(pin);
  const config = await ensureConfig();
  return bcrypt.compare(code, config.superAdminKeyHash);
}

async function updateSuperAdminPin(currentPin, newPin, updatedBy) {
  const current = assertFourDigitPin(currentPin);
  const next = assertFourDigitPin(newPin);
  const config = await ensureConfig();
  const ok = await bcrypt.compare(current, config.superAdminKeyHash);
  if (!ok) {
    const err = new Error('Current Super Admin key is incorrect');
    err.statusCode = 401;
    throw err;
  }
  config.superAdminKeyHash = await bcrypt.hash(next, SALT_ROUNDS);
  config.updatedAt = new Date();
  config.updatedBy = updatedBy || null;
  await config.save();
  return true;
}

function isAdminAccountApproved(user) {
  if (!user || user.role !== 'admin') return true;
  const status = user.adminApprovalStatus;
  // Legacy admins without a status are treated as approved
  if (!status || status === 'approved') return true;
  return false;
}

module.exports = {
  DEFAULT_PIN,
  assertFourDigitPin,
  ensureConfig,
  verifySuperAdminPin,
  updateSuperAdminPin,
  isAdminAccountApproved,
};
