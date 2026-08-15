/**
 * Provider contact-number visibility policy.
 * Backend is the source of truth — never infer from env or frontend flags.
 */

const {normalizeServiceTypeKey, isActiveServiceStatus} = require('./activeServiceRequest');

const PROVIDER_CONTACT_POLICIES = Object.freeze({
  DIRECT: 'DIRECT',
  MASKED: 'MASKED',
  ACCEPTED_ONLY: 'ACCEPTED_ONLY',
  ACTIVE_REQUEST_ONLY: 'ACTIVE_REQUEST_ONLY',
});

const DEFAULT_PROVIDER_CONTACT_POLICY = PROVIDER_CONTACT_POLICIES.DIRECT;

const POLICY_SET = new Set(Object.values(PROVIDER_CONTACT_POLICIES));

function normalizeProviderContactPolicy(value) {
  const key = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (POLICY_SET.has(key)) return key;
  return DEFAULT_PROVIDER_CONTACT_POLICY;
}

function normalizeServiceOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [service, policy] of Object.entries(raw)) {
    const serviceKey = normalizeServiceTypeKey(service);
    if (!serviceKey) continue;
    out[serviceKey] = normalizeProviderContactPolicy(policy);
  }
  return out;
}

/**
 * Resolve effective policy for a service type (override wins over global).
 */
function resolveProviderContactPolicy(settings, serviceType) {
  const globalPolicy = normalizeProviderContactPolicy(
    settings?.providerContactPolicy,
  );
  const overrides = normalizeServiceOverrides(
    settings?.serviceOverrides || settings?.providerContactPolicyServiceOverrides,
  );
  const key = normalizeServiceTypeKey(serviceType);
  if (key && overrides[key]) return overrides[key];
  return globalPolicy;
}

function normalizeStatus(status) {
  return String(status || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-');
}

/**
 * Whether a customer may receive the real provider phone for this job/request.
 * Browse (no job) uses hasProvider=false and status='' — only DIRECT reveals.
 */
function customerMaySeeProviderPhone(policy, {status, hasProvider, hasJob} = {}) {
  const p = normalizeProviderContactPolicy(policy);
  if (p === PROVIDER_CONTACT_POLICIES.MASKED) return false;

  if (!hasJob) {
    return p === PROVIDER_CONTACT_POLICIES.DIRECT;
  }

  if (!hasProvider) return false;

  if (p === PROVIDER_CONTACT_POLICIES.DIRECT) return true;

  if (p === PROVIDER_CONTACT_POLICIES.ACCEPTED_ONLY) {
    const s = normalizeStatus(status);
    return s === 'accepted' || s === 'in-progress' || s === 'completed';
  }

  if (p === PROVIDER_CONTACT_POLICIES.ACTIVE_REQUEST_ONLY) {
    return isActiveServiceStatus(status);
  }

  return p === PROVIDER_CONTACT_POLICIES.DIRECT;
}

function providerContactHint(policy, {status, hasProvider, hasJob, revealed} = {}) {
  if (revealed) return 'visible';
  const p = normalizeProviderContactPolicy(policy);
  if (p === PROVIDER_CONTACT_POLICIES.MASKED) return 'masked';
  if (!hasJob) return p === PROVIDER_CONTACT_POLICIES.DIRECT ? 'none' : 'masked';
  if (p === PROVIDER_CONTACT_POLICIES.ACCEPTED_ONLY) {
    const s = normalizeStatus(status);
    if (s === 'pending' || !hasProvider) return 'waiting_acceptance';
    return 'inactive';
  }
  if (p === PROVIDER_CONTACT_POLICIES.ACTIVE_REQUEST_ONLY) {
    if (isActiveServiceStatus(status)) {
      return hasProvider ? 'none' : 'waiting_acceptance';
    }
    return 'inactive';
  }
  if (!hasProvider) return 'none';
  return 'none';
}

function providerServiceType(providerOrJob) {
  if (!providerOrJob || typeof providerOrJob !== 'object') return '';
  if (providerOrJob.serviceType) return providerOrJob.serviceType;
  if (providerOrJob.specialization) return providerOrJob.specialization;
  const cats = providerOrJob.serviceCategories;
  if (Array.isArray(cats) && cats[0]) return cats[0];
  return '';
}

module.exports = {
  PROVIDER_CONTACT_POLICIES,
  DEFAULT_PROVIDER_CONTACT_POLICY,
  POLICY_SET,
  normalizeProviderContactPolicy,
  normalizeServiceOverrides,
  resolveProviderContactPolicy,
  customerMaySeeProviderPhone,
  providerContactHint,
  providerServiceType,
};
