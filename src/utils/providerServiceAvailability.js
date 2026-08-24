/**
 * Per-service availability and qualification for one Partner profile.
 *
 * One Akanso User → one Partner → multiple professional services.
 * inactiveServiceCategories = not accepting NEW work (existing jobs continue).
 * serviceQualifications = per-service verification (independent of account approval).
 */

const VERIFICATION_STATUSES = ['approved', 'pending', 'required', 'rejected'];

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function allServicesForProvider(provider) {
  const seen = new Set();
  const out = [];
  const add = (raw) => {
    const key = norm(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(String(raw).trim());
  };
  add(provider?.serviceType);
  add(provider?.specialization);
  add(provider?.specialty);
  if (Array.isArray(provider?.serviceCategories)) {
    for (const s of provider.serviceCategories) add(s);
  }
  return out;
}

function inactiveSet(provider) {
  return new Set(
    (provider?.inactiveServiceCategories || []).map((s) => norm(s)).filter(Boolean),
  );
}

function isServiceInactive(provider, serviceName) {
  const key = norm(serviceName);
  if (!key) return false;
  return inactiveSet(provider).has(key);
}

function accountVerificationFallback(provider) {
  const status = String(provider?.approvalStatus || '').toLowerCase();
  if (status === 'approved' || provider?.verified === true) return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function qualificationsList(provider) {
  return Array.isArray(provider?.serviceQualifications)
    ? provider.serviceQualifications
    : [];
}

function cloneQualification(q) {
  if (!q) return {};
  return {
    name: q.name,
    verificationStatus: q.verificationStatus,
    rejectionReason: q.rejectionReason || '',
    experience: q.experience,
    notes: q.notes || '',
    serviceInfo: q.serviceInfo && typeof q.serviceInfo === 'object' ? q.serviceInfo : {},
    documents: Array.isArray(q.documents)
      ? q.documents.map((d) => ({
          key: d.key,
          label: d.label,
          url: d.url,
          fileName: d.fileName,
          uploadedAt: d.uploadedAt,
        }))
      : [],
    submittedAt: q.submittedAt || null,
    reviewedAt: q.reviewedAt || null,
    reviewedBy: q.reviewedBy || '',
    updatedAt: q.updatedAt,
  };
}

function effectiveVerificationStatus(q, provider) {
  const raw = String(q?.verificationStatus || '').toLowerCase();
  if (raw === 'approved' || raw === 'required' || raw === 'rejected') return raw;
  if (raw === 'pending' && q?.submittedAt) return 'pending';
  if (raw === 'pending' && !q?.submittedAt) return 'required';
  if (!q) return accountVerificationFallback(provider);
  return 'required';
}

function qualificationForService(provider, serviceName) {
  const key = norm(serviceName);
  if (!key) return null;
  const found = qualificationsList(provider)
    .filter((q) => norm(q.name) === key)
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.reviewedAt || a.submittedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.reviewedAt || b.submittedAt || 0).getTime();
      return bTime - aTime;
    })[0];
  if (found) {
    const cloned = cloneQualification(found);
    cloned.verificationStatus = effectiveVerificationStatus(found, provider);
    cloned.name = String(found.name || serviceName).trim();
    return cloned;
  }
  const known = allServicesForProvider(provider);
  if (!known.some((s) => norm(s) === key)) return null;
  return {
    name: String(serviceName).trim(),
    verificationStatus: accountVerificationFallback(provider),
    rejectionReason: '',
    experience: undefined,
    notes: '',
    serviceInfo: {},
    documents: [],
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: '',
  };
}

function isServiceVerified(provider, serviceName) {
  return qualificationForService(provider, serviceName)?.verificationStatus === 'approved';
}

function isServiceCustomerVisible(provider, serviceName) {
  return (
    isServiceVerified(provider, serviceName) && !isServiceInactive(provider, serviceName)
  );
}

function activeServicesForProvider(provider) {
  return allServicesForProvider(provider).filter((s) =>
    isServiceCustomerVisible(provider, s),
  );
}

function primaryServiceForProvider(provider) {
  return (
    provider?.serviceType ||
    provider?.specialization ||
    provider?.specialty ||
    allServicesForProvider(provider)[0] ||
    ''
  );
}

function matchServiceName(names, query) {
  const key = norm(query);
  if (!key || !Array.isArray(names)) return '';
  return names.find((s) => norm(s) === key) || '';
}

function defaultServiceDocuments() {
  return [
    {key: 'certificate', required: true},
    {key: 'experienceProof', required: false},
  ];
}

function documentsForCategory(category) {
  const configured = Array.isArray(category?.partnerDocuments)
    ? category.partnerDocuments.filter((d) => d && d.key)
    : [];
  if (configured.length) {
    return configured.map((d) => ({
      key: String(d.key).trim(),
      required: d.required !== false,
      label: d.label || '',
      labelHi: d.labelHi || '',
    }));
  }
  return defaultServiceDocuments();
}

function canEditServiceQualification(status) {
  const value = String(status || '').toLowerCase();
  return value === 'required' || value === 'rejected' || !value;
}

function newServiceVerification({source, accountStatus, accountVerified}) {
  if (source === 'admin') {
    const status = String(accountStatus || '').toLowerCase();
    if (status === 'approved' || accountVerified === true) return 'approved';
    return 'pending';
  }
  return 'required';
}

function setInactive(provider, serviceName, inactive) {
  const match =
    allServicesForProvider(provider).find((s) => norm(s) === norm(serviceName)) ||
    String(serviceName).trim();
  const current = Array.isArray(provider.inactiveServiceCategories)
    ? [...provider.inactiveServiceCategories]
    : [];
  const without = current.filter((s) => norm(s) !== norm(match));
  provider.inactiveServiceCategories = inactive ? [...without, match] : without;
}

function ensureServiceOnProfile(provider, canonicalName) {
  const cats = Array.isArray(provider.serviceCategories)
    ? [...provider.serviceCategories]
    : [];
  if (!cats.some((s) => norm(s) === norm(canonicalName))) {
    cats.push(canonicalName);
  }
  provider.serviceCategories = cats;
  if (!String(provider.serviceType || '').trim()) {
    provider.serviceType = canonicalName;
  }
  if (!String(provider.specialization || '').trim()) {
    provider.specialization = canonicalName;
  }
}

function upsertQualification(provider, canonicalName, verificationStatus, extra = {}) {
  const list = qualificationsList(provider).map((q) => cloneQualification(q));
  const idx = list.findIndex((q) => norm(q.name) === norm(canonicalName));
  const prev = idx >= 0 ? list[idx] : {};
  const row = {
    ...prev,
    name: canonicalName,
    verificationStatus,
    rejectionReason:
      verificationStatus === 'rejected'
        ? extra.rejectionReason || prev.rejectionReason || ''
        : verificationStatus === 'approved'
          ? ''
          : extra.rejectionReason !== undefined
            ? extra.rejectionReason
            : prev.rejectionReason || '',
    updatedAt: new Date(),
  };
  if (extra.experience !== undefined) row.experience = extra.experience;
  if (extra.notes !== undefined) row.notes = extra.notes;
  if (extra.serviceInfo !== undefined) row.serviceInfo = extra.serviceInfo;
  if (extra.documents !== undefined) row.documents = extra.documents;
  if (extra.submittedAt !== undefined) row.submittedAt = extra.submittedAt;
  if (extra.reviewedAt !== undefined) row.reviewedAt = extra.reviewedAt;
  if (extra.reviewedBy !== undefined) row.reviewedBy = extra.reviewedBy;
  if (idx >= 0) list[idx] = row;
  else list.push(row);
  provider.serviceQualifications = list;
}

/**
 * Add a professional service to the same Partner (never creates another Provider).
 * @returns {{added: boolean, duplicate: boolean, name: string}}
 */
function addServiceToProvider(provider, canonicalName, options = {}) {
  const name = String(canonicalName || '').trim();
  if (!name) {
    return {added: false, duplicate: false, name: ''};
  }
  if (allServicesForProvider(provider).some((s) => norm(s) === norm(name))) {
    return {added: false, duplicate: true, name};
  }

  ensureServiceOnProfile(provider, name);
  const verification = newServiceVerification({
    source: options.source || 'self',
    accountStatus: provider.approvalStatus,
    accountVerified: provider.verified,
  });
  upsertQualification(provider, name, verification);
  if (verification !== 'approved') {
    setInactive(provider, name, true);
  }
  provider.updatedAt = new Date();
  return {added: true, duplicate: false, name};
}

function ensureQualifications(provider) {
  const fallback = accountVerificationFallback(provider);
  for (const name of allServicesForProvider(provider)) {
    const existing = qualificationsList(provider).find((q) => norm(q.name) === norm(name));
    if (!existing) {
      upsertQualification(provider, name, fallback);
    }
  }
}

function applyCustomerServiceView(provider, serviceQuery) {
  if (!provider) return provider;
  const raw = provider.toObject ? provider.toObject() : {...provider};
  const visible = activeServicesForProvider(raw);
  const matched =
    matchServiceName(visible, serviceQuery) ||
    matchServiceName(visible, primaryServiceForProvider(raw)) ||
    visible[0] ||
    '';
  raw.serviceCategories = visible;
  raw.matchedService = matched;
  if (matched) {
    raw.specialization = matched;
  }
  delete raw.serviceQualifications;
  delete raw.inactiveServiceCategories;
  return raw;
}

function hasAnyCustomerVisibleService(provider) {
  return activeServicesForProvider(provider).length > 0;
}

function summarizePartnerServices(provider) {
  return allServicesForProvider(provider).map((name) => {
    const q = qualificationForService(provider, name);
    return {
      name,
      verificationStatus: q?.verificationStatus || 'pending',
      active: !isServiceInactive(provider, name),
      experience: q?.experience,
      notes: q?.notes || '',
    };
  });
}

function serviceMembershipBreakdown(providers) {
  const counts = new Map();
  for (const provider of providers || []) {
    for (const name of allServicesForProvider(provider)) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([service, count]) => ({service, count}));
}

function providerOwnsDocumentUrl(providerId, url) {
  const value = String(url || '');
  if (!value.startsWith('http://') && !value.startsWith('https://')) return false;
  return value.includes(`/providers/${providerId}/`);
}

/**
 * Profile experience lives on the Partner account; service review reads
 * serviceQualifications[].experience — keep primary service in sync.
 */
function syncProfileExperienceToPrimaryService(provider) {
  if (!provider) return false;
  const raw = provider.experience;
  if (raw == null || raw === '') return false;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return false;

  const primary = primaryServiceForProvider(provider);
  if (!primary) return false;

  const q = qualificationForService(provider, primary);
  if (q?.experience === num) return false;

  const status =
    q?.verificationStatus || accountVerificationFallback(provider);
  upsertQualification(provider, primary, status, {experience: num});
  return true;
}

module.exports = {
  VERIFICATION_STATUSES,
  allServicesForProvider,
  activeServicesForProvider,
  isServiceInactive,
  isServiceVerified,
  isServiceCustomerVisible,
  primaryServiceForProvider,
  qualificationForService,
  matchServiceName,
  addServiceToProvider,
  upsertQualification,
  setInactive,
  ensureQualifications,
  ensureServiceOnProfile,
  applyCustomerServiceView,
  hasAnyCustomerVisibleService,
  summarizePartnerServices,
  serviceMembershipBreakdown,
  newServiceVerification,
  cloneQualification,
  effectiveVerificationStatus,
  defaultServiceDocuments,
  documentsForCategory,
  canEditServiceQualification,
  providerOwnsDocumentUrl,
  syncProfileExperienceToPrimaryService,
};
