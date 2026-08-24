/**
 * Partner verification policy — AUTO (profile-complete) vs ADMIN (manual review).
 * Stored on SystemConfig global doc; cached briefly like contact privacy.
 */

const SystemConfig = require('../models/SystemConfig');

const MODES = ['AUTO', 'ADMIN'];
const ENV_DEFAULT =
  String(process.env.PARTNER_VERIFICATION_MODE || 'AUTO').trim().toUpperCase() ===
  'ADMIN'
    ? 'ADMIN'
    : 'AUTO';

let cache = {at: 0, value: ENV_DEFAULT};
const TTL_MS = 4000;

function normalizePartnerVerificationMode(raw) {
  const value = String(raw || '').trim().toUpperCase();
  return MODES.includes(value) ? value : ENV_DEFAULT;
}

function getPartnerVerificationModeSync() {
  return cache.value || ENV_DEFAULT;
}

function isPartnerAutoVerifyEnabledSync() {
  return getPartnerVerificationModeSync() === 'AUTO';
}

async function getPartnerVerificationMode() {
  if (cache.value && Date.now() - cache.at < TTL_MS) {
    return cache.value;
  }
  const doc = await SystemConfig.findById('global')
    .select('partnerVerificationMode')
    .lean();
  const value = normalizePartnerVerificationMode(doc?.partnerVerificationMode);
  cache = {at: Date.now(), value};
  return value;
}

async function isPartnerAutoVerifyEnabled() {
  return (await getPartnerVerificationMode()) === 'AUTO';
}

function invalidatePartnerVerificationPolicyCache() {
  cache = {at: 0, value: ENV_DEFAULT};
}

module.exports = {
  MODES,
  ENV_DEFAULT,
  normalizePartnerVerificationMode,
  getPartnerVerificationMode,
  getPartnerVerificationModeSync,
  isPartnerAutoVerifyEnabled,
  isPartnerAutoVerifyEnabledSync,
  invalidatePartnerVerificationPolicyCache,
};
