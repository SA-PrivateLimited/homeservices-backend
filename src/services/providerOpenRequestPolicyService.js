/**
 * When enabled, approved providers can receive and accept open (broadcast)
 * service requests even while marked offline — for low partner density.
 * Stored on SystemConfig global doc; cached briefly like other policies.
 */

const SystemConfig = require('../models/SystemConfig');

const ENV_DEFAULT =
  String(process.env.ALLOW_OFFLINE_PROVIDER_OPEN_REQUESTS || '')
    .trim()
    .toLowerCase() === 'true';

let cache = {at: 0, value: ENV_DEFAULT};
const TTL_MS = 4000;

function normalizeAllowOfflineProviderOpenRequests(raw) {
  if (raw === true || raw === false) return raw;
  if (raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === 'false' || raw === 0 || raw === '0') return false;
  return ENV_DEFAULT;
}

function getAllowOfflineProviderOpenRequestsSync() {
  return Boolean(cache.value);
}

async function isOfflineOpenRequestsEnabled() {
  if (Date.now() - cache.at < TTL_MS) {
    return Boolean(cache.value);
  }
  const doc = await SystemConfig.findById('global')
    .select('allowOfflineProviderOpenRequests')
    .lean();
  const value = normalizeAllowOfflineProviderOpenRequests(
    doc?.allowOfflineProviderOpenRequests,
  );
  cache = {at: Date.now(), value};
  return value;
}

function invalidateProviderOpenRequestPolicyCache() {
  cache = {at: 0, value: ENV_DEFAULT};
}

module.exports = {
  ENV_DEFAULT,
  normalizeAllowOfflineProviderOpenRequests,
  isOfflineOpenRequestsEnabled,
  getAllowOfflineProviderOpenRequestsSync,
  invalidateProviderOpenRequestPolicyCache,
};
