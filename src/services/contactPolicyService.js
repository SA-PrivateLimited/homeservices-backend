/**
 * Load / cache admin contact-privacy settings from SystemConfig.
 */

const SystemConfig = require('../models/SystemConfig');
const {
  DEFAULT_PROVIDER_CONTACT_POLICY,
  normalizeProviderContactPolicy,
  normalizeServiceOverrides,
} = require('../utils/providerContactPolicy');

let cache = {at: 0, value: null};
const TTL_MS = 4000;

function emptySettings() {
  return {
    providerContactPolicy: DEFAULT_PROVIDER_CONTACT_POLICY,
    serviceOverrides: {},
  };
}

function fromConfigDoc(doc) {
  if (!doc) return emptySettings();
  return {
    providerContactPolicy: normalizeProviderContactPolicy(
      doc.providerContactPolicy,
    ),
    serviceOverrides: normalizeServiceOverrides(
      doc.providerContactPolicyServiceOverrides,
    ),
  };
}

function getContactSettingsSync() {
  return cache.value || emptySettings();
}

async function getContactSettings() {
  if (cache.value && Date.now() - cache.at < TTL_MS) {
    return cache.value;
  }
  const doc = await SystemConfig.findById('global').lean();
  const value = fromConfigDoc(doc);
  cache = {at: Date.now(), value};
  return value;
}

function invalidateContactSettingsCache() {
  cache = {at: 0, value: null};
}

module.exports = {
  getContactSettings,
  getContactSettingsSync,
  invalidateContactSettingsCache,
  fromConfigDoc,
};
