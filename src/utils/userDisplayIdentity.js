/**
 * Stable customer display identity (User-XXXX) and placeholder detection.
 * Used at account/profile creation so all clients share the same defaults.
 */

const crypto = require('crypto');

/** Matches signup placeholders and generated defaults — not real people names. */
const PLACEHOLDER_DISPLAY_NAME =
  /^(customer|provider|user)([-\s]\d{1,4})?$/i;

function isPlaceholderDisplayName(value) {
  const s = String(value || '').trim();
  return !s || PLACEHOLDER_DISPLAY_NAME.test(s);
}

function padDisplayId(displayId, fallbackPrefix) {
  const n = Number(displayId);
  if (!Number.isFinite(n) || n < 0) return `${fallbackPrefix}-0000`;
  return `${fallbackPrefix}-${String(Math.trunc(n) % 10000).padStart(4, '0')}`;
}

function formatDefaultCustomerName(displayId) {
  return padDisplayId(displayId, 'User');
}

function formatDefaultProviderName(displayId) {
  return padDisplayId(displayId, 'Provider');
}

/**
 * Resolve the initial Customer display name for a NEW account.
 * Never use this to overwrite an existing non-placeholder name.
 */
function resolveInitialCustomerName({requestedName, existingName, displayId} = {}) {
  const existing = String(existingName || '').trim();
  if (existing && !isPlaceholderDisplayName(existing)) return existing;

  const requested = String(requestedName || '').trim();
  if (requested && !isPlaceholderDisplayName(requested)) return requested;

  return formatDefaultCustomerName(displayId);
}

/**
 * Resolve the initial Partner display name for a NEW Partner profile.
 * Same 4-digit id as the Customer default (Provider-4827).
 */
function resolveInitialProviderName({
  requestedName,
  existingName,
  displayId,
} = {}) {
  const existing = String(existingName || '').trim();
  if (existing && !isPlaceholderDisplayName(existing)) return existing;

  const requested = String(requestedName || '').trim();
  if (requested && !isPlaceholderDisplayName(requested)) return requested;

  return formatDefaultProviderName(displayId);
}

function hasRealCustomerName(name) {
  return !isPlaceholderDisplayName(name);
}

/** Unique 4-digit id (0–9999). Shown as User-XXXX with zero-padding. */
async function generateCustomerDisplayId(User, maxAttempts = 50) {
  for (let i = 0; i < maxAttempts; i++) {
    const id = crypto.randomInt(0, 10000);
    const existing = await User.findOne({customerDisplayId: id}).lean();
    if (!existing) return id;
  }
  return parseInt(String(Date.now()).slice(-4), 10);
}

module.exports = {
  PLACEHOLDER_DISPLAY_NAME,
  isPlaceholderDisplayName,
  formatDefaultCustomerName,
  formatDefaultProviderName,
  resolveInitialCustomerName,
  resolveInitialProviderName,
  hasRealCustomerName,
  generateCustomerDisplayId,
};
