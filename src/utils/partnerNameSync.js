/**
 * Keep Partner name + displayName aligned — drop stale signup placeholders
 * like "Customer" when a real profile name exists.
 */

const GENERIC_PARTNER_NAME = /^(customer|provider)(\s+\d+)?$/i;

function isGenericPartnerName(value) {
  const s = String(value || '').trim();
  return !s || GENERIC_PARTNER_NAME.test(s);
}

function bestPartnerName(...sources) {
  for (const src of sources) {
    const s = String(src || '').trim();
    if (s && !isGenericPartnerName(s)) return s;
  }
  for (const src of sources) {
    const s = String(src || '').trim();
    if (s) return s;
  }
  return '';
}

function applyPartnerNameFields(record, bestName) {
  if (!record || !bestName || isGenericPartnerName(bestName)) return false;
  let changed = false;
  if (record.name !== bestName) {
    record.name = bestName;
    changed = true;
  }
  if (record.displayName !== bestName) {
    record.displayName = bestName;
    changed = true;
  }
  return changed;
}

function partnerNamePatch(...sources) {
  const bestName = bestPartnerName(...sources);
  if (!bestName || isGenericPartnerName(bestName)) {
    return null;
  }
  return {name: bestName, displayName: bestName};
}

function repairPartnerRecord(record, ...fallbacks) {
  if (!record) return false;
  const bestName = bestPartnerName(
    record.name,
    record.displayName,
    ...fallbacks,
  );
  return applyPartnerNameFields(record, bestName);
}

function syncPartnerDisplayNames(provider, user) {
  const bestName = bestPartnerName(
    provider?.name,
    provider?.displayName,
    user?.name,
    user?.displayName,
  );
  const providerChanged = applyPartnerNameFields(provider, bestName);
  const userChanged = applyPartnerNameFields(user, bestName);
  return {providerChanged, userChanged, bestName};
}

module.exports = {
  isGenericPartnerName,
  bestPartnerName,
  applyPartnerNameFields,
  partnerNamePatch,
  repairPartnerRecord,
  syncPartnerDisplayNames,
};
