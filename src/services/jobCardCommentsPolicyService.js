/**
 * When enabled, customers/partners/admins may post job-card comments (chat).
 * Stored on SystemConfig global doc; cached briefly like other policies.
 */

const SystemConfig = require('../models/SystemConfig');

const ENV_DEFAULT =
  String(process.env.ALLOW_JOB_CARD_COMMENTS || 'true')
    .trim()
    .toLowerCase() !== 'false';

let cache = {at: 0, value: ENV_DEFAULT};
const TTL_MS = 4000;

function normalizeAllowJobCardComments(raw) {
  if (raw === true || raw === false) return raw;
  if (raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === 'false' || raw === 0 || raw === '0') return false;
  return ENV_DEFAULT;
}

function getAllowJobCardCommentsSync() {
  return Boolean(cache.value);
}

async function isJobCardCommentsEnabled() {
  if (Date.now() - cache.at < TTL_MS) {
    return Boolean(cache.value);
  }
  const doc = await SystemConfig.findById('global')
    .select('allowJobCardComments')
    .lean();
  // Missing field → default ON (backward compatible)
  const value =
    doc && Object.prototype.hasOwnProperty.call(doc, 'allowJobCardComments')
      ? normalizeAllowJobCardComments(doc.allowJobCardComments)
      : ENV_DEFAULT;
  cache = {at: Date.now(), value};
  return value;
}

function invalidateJobCardCommentsPolicyCache() {
  cache = {at: 0, value: ENV_DEFAULT};
}

module.exports = {
  ENV_DEFAULT,
  normalizeAllowJobCardComments,
  isJobCardCommentsEnabled,
  getAllowJobCardCommentsSync,
  invalidateJobCardCommentsPolicyCache,
};
