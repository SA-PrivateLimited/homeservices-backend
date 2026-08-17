/**
 * Exclude the current Akanso user's own Partner profile from discovery lists.
 * Provider._id === User._id in this codebase.
 */

function normalizeUserId(userId) {
  const id = String(userId || '').trim();
  return id || null;
}

/** Mongo query fragment — merge into Provider.find filters. */
function excludeSelfProviderClause(userId) {
  const id = normalizeUserId(userId);
  if (!id) return {};
  return {_id: {$ne: id}};
}

/** Post-query safety net (e.g. after lean().filter chains). */
function filterOutSelfProvider(providers, userId) {
  const id = normalizeUserId(userId);
  if (!id || !Array.isArray(providers)) return providers || [];
  return providers.filter((p) => String(p._id) !== id);
}

module.exports = {
  excludeSelfProviderClause,
  filterOutSelfProvider,
  normalizeUserId,
};
