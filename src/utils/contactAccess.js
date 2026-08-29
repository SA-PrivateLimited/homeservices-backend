/**
 * Protected contact authorization — source of truth for when
 * customer ↔ provider phone numbers may be revealed.
 *
 * Never trust client-provided phone, role, or job status alone.
 * Derive from authenticated viewer + persisted job/SR records.
 */

const {
  resolveProviderContactPolicy,
  customerMaySeeProviderPhone,
  providerContactHint,
  providerServiceType,
} = require('./providerContactPolicy');
const {getContactSettingsSync} = require('../services/contactPolicyService');

const CONTACT_ALLOWED_STATUSES = new Set([
  'accepted',
  'in-progress',
  'completed',
]);

const PUBLIC_PROVIDER_STRIP_FIELDS = [
  'phone',
  'phoneNumber',
  'email',
  'fcmToken',
  'encryptedPin',
  'pinHash',
  'documents',
  'bankAccount',
  'bankDetails',
  'panNumber',
  'aadharNumber',
  'aadhaarNumber',
  'gstNumber',
  'rejectionReason',
  'deactivationReason',
  'deactivatedBy',
  'approvedBy',
];

function normalizeStatus(status) {
  return String(status || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-');
}

function statusAllowsContact(status) {
  const key = normalizeStatus(status);
  const compact = key.replace(/-/g, '');
  if (CONTACT_ALLOWED_STATUSES.has(key)) return true;
  if (key === 'inprogress' || compact === 'inprogress') return true;
  if (CONTACT_ALLOWED_STATUSES.has(compact.replace('inprogress', 'in-progress'))) {
    return true;
  }
  return CONTACT_ALLOWED_STATUSES.has(key);
}

function isGenericProviderName(value) {
  const s = String(value || '').trim();
  return !s || /^(customer|provider|user)([-\s]\d{1,4})?$/i.test(s);
}

/** One public name for browse/detail — ignore stale signup placeholders. */
function resolveProviderPublicName(provider) {
  const name = String(provider?.name || '').trim();
  const displayName = String(provider?.displayName || '').trim();
  if (!isGenericProviderName(name)) return name;
  if (!isGenericProviderName(displayName)) return displayName;
  return '';
}

function viewerId(viewer) {
  if (!viewer) return '';
  return String(viewer.uid || viewer.sub || viewer.id || viewer._id || '');
}

function viewerRole(viewer) {
  return String(viewer?.role || '').toLowerCase();
}

function partyId(record, ...keys) {
  for (const key of keys) {
    const v = record?.[key];
    if (v != null && String(v).trim()) return String(v);
  }
  return '';
}

/**
 * Customer may see provider phone only when policy + ownership allow it.
 * Admin always sees phones. Assigned providers see their own listed number.
 */
function canAccessProviderContact(viewer, jobOrSr, settings) {
  if (!viewer || !jobOrSr) return false;
  if (viewerRole(viewer) === 'admin') return true;

  const uid = viewerId(viewer);
  if (!uid) return false;

  const customerId = partyId(jobOrSr, 'customerId', 'customer_id');
  const providerId = partyId(jobOrSr, 'providerId', 'provider_id');

  if (viewerRole(viewer) === 'provider' && uid === providerId) {
    return true;
  }

  if (viewerRole(viewer) === 'customer' && uid === customerId) {
    const cfg = settings || getContactSettingsSync();
    const policy = resolveProviderContactPolicy(cfg, jobOrSr.serviceType);
    return customerMaySeeProviderPhone(policy, {
      status: jobOrSr.status,
      hasProvider: Boolean(providerId),
      hasJob: true,
    });
  }

  return false;
}

/**
 * Provider may see customer phone only when assigned and status allows.
 */
function canAccessCustomerContact(viewer, jobOrSr) {
  if (!viewer || !jobOrSr) return false;
  if (viewerRole(viewer) === 'admin') return true;

  const uid = viewerId(viewer);
  if (!uid) return false;

  const customerId = partyId(jobOrSr, 'customerId', 'customer_id');
  const providerId = partyId(jobOrSr, 'providerId', 'provider_id');
  if (!customerId || !providerId) return false;

  if (viewerRole(viewer) === 'provider' && uid === providerId) {
    return statusAllowsContact(jobOrSr.status);
  }

  // Owning customer may see their own phone
  if (viewerRole(viewer) === 'customer' && uid === customerId) {
    return true;
  }

  return false;
}

function stripFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {...obj};
  for (const f of fields) {
    if (f in out) delete out[f];
  }
  return out;
}

/**
 * Public browse/detail provider payload — private fields stripped.
 * Phone is included only when revealPhone is true (DIRECT policy).
 */
function toPublicProvider(provider, {revealPhone = false, policy} = {}) {
  if (!provider) return provider;
  const raw = provider.toObject ? provider.toObject() : {...provider};
  const phone = revealPhone
    ? pickPhone(raw.phone, raw.phoneNumber)
    : '';
  const out = stripFields(raw, PUBLIC_PROVIDER_STRIP_FIELDS);
  // Profile street address is part of the public professional profile
  // (entered in Partner settings). Phone remains gated via revealPhone.
  if (out.location && typeof out.location === 'object') {
    out.location = {
      address: out.location.address,
      landmark: out.location.landmark,
      city: out.location.city,
      district: out.location.district,
      state: out.location.state,
      stateId: out.location.stateId,
      districtId: out.location.districtId,
      blockId: out.location.blockId,
      block: out.location.block,
      pincode: out.location.pincode,
      latitude: out.location.latitude,
      longitude: out.location.longitude,
    };
  }
  if (out.address && typeof out.address === 'object') {
    out.address = {
      type: out.address.type,
      address: out.address.address,
      landmark: out.address.landmark,
      city: out.address.city,
      district: out.address.district,
      state: out.address.state,
      stateId: out.address.stateId,
      districtId: out.address.districtId,
      blockId: out.address.blockId,
      block: out.address.block,
      pincode: out.address.pincode,
    };
  }
  if (phone) {
    out.phone = phone;
    out.phoneNumber = phone;
    out.contactAvailable = true;
  } else {
    out.contactAvailable = false;
  }
  if (policy) {
    out.providerContactPolicy = policy;
  }
  const publicName = resolveProviderPublicName(out);
  if (publicName) {
    out.name = publicName;
    out.displayName = publicName;
  }
  return out;
}

/**
 * Browse/detail redaction using admin contact settings (per-service override aware).
 */
function toPublicProviderForSettings(provider, settings) {
  const policy = resolveProviderContactPolicy(
    settings,
    providerServiceType(provider),
  );
  const revealPhone = customerMaySeeProviderPhone(policy, {
    hasJob: false,
    hasProvider: false,
  });
  return toPublicProvider(provider, {revealPhone, policy});
}

/**
 * Real provider phone for customer-facing notify/FCM/socket, or '' when hidden.
 */
function customerFacingProviderPhone(settings, meta, ...phoneCandidates) {
  const policy = resolveProviderContactPolicy(settings, meta?.serviceType);
  if (
    !customerMaySeeProviderPhone(policy, {
      status: meta?.status,
      hasProvider: meta?.hasProvider !== false,
      hasJob: true,
    })
  ) {
    return '';
  }
  return pickPhone(...phoneCandidates);
}

function redactDeclinedProviders(list) {
  if (!Array.isArray(list)) return list;
  return list.map((d) => {
    const row = {...d};
    delete row.providerPhone;
    delete row.phone;
    delete row.phoneNumber;
    return row;
  });
}

/**
 * Redact SR/job for a viewer based on contact policy + ownership.
 */
function redactServiceRequestForViewer(doc, viewer, settings) {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : {...doc};
  if (obj._id != null) obj._id = String(obj._id);

  const cfg = settings || getContactSettingsSync();
  const policy = resolveProviderContactPolicy(cfg, obj.serviceType);
  const hasProvider = Boolean(partyId(obj, 'providerId', 'provider_id'));

  const allowProvider = canAccessProviderContact(viewer, obj, cfg);
  const allowCustomer = canAccessCustomerContact(viewer, obj);

  if (!allowProvider) {
    delete obj.providerPhone;
    delete obj.providerEmail;
  }
  if (!allowCustomer) {
    delete obj.customerPhone;
    delete obj.secondaryPhone;
  }

  if (obj.declinedProviders) {
    obj.declinedProviders = redactDeclinedProviders(obj.declinedProviders);
  }

  const hint = providerContactHint(policy, {
    status: obj.status,
    hasProvider,
    hasJob: true,
    revealed: allowProvider && viewerRole(viewer) === 'customer',
  });

  obj.contact = {
    providerPhoneAvailable: allowProvider && Boolean(obj.providerPhone),
    customerPhoneAvailable: allowCustomer && Boolean(obj.customerPhone),
    canCallProvider: allowProvider && Boolean(obj.providerPhone),
    canCallCustomer: allowCustomer && viewerRole(viewer) === 'provider',
    providerContactPolicy: policy,
    providerContactHint: hint,
  };

  return obj;
}

function redactJobCardForViewer(doc, viewer, settings) {
  return redactServiceRequestForViewer(doc, viewer, settings);
}

/**
 * Safe booking/socket payload — never include phones before contact is allowed.
 */
function sanitizeBookingNotifyPayload(payload, {includeCustomerPhone = false, includeProviderPhone = false} = {}) {
  const data = {...(payload || {})};
  if (!includeCustomerPhone) {
    delete data.customerPhone;
    delete data.secondaryPhone;
  }
  if (!includeProviderPhone) {
    delete data.providerPhone;
  }
  return data;
}

function contactDeniedMessage(code) {
  switch (code) {
    case 'not_authenticated':
      return {
        error: 'Authentication required',
        message: 'Please sign in to contact this provider.',
      };
    case 'pending':
      return {
        error: 'Contact not available',
        message:
          'You can contact the provider after your service request is accepted.',
      };
    case 'blocked':
      return {
        error: 'Contact not available',
        message: 'Contact information is no longer available for this request.',
      };
    case 'not_found':
      return {
        error: 'Not found',
        message: "We couldn't find that service request.",
      };
    default:
      return {
        error: 'Contact not available',
        message: 'Contact information is not available for this request.',
      };
  }
}

function pickPhone(...candidates) {
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s;
  }
  return '';
}

module.exports = {
  CONTACT_ALLOWED_STATUSES,
  statusAllowsContact,
  canAccessProviderContact,
  canAccessCustomerContact,
  toPublicProvider,
  toPublicProviderForSettings,
  customerFacingProviderPhone,
  redactDeclinedProviders,
  redactServiceRequestForViewer,
  redactJobCardForViewer,
  sanitizeBookingNotifyPayload,
  contactDeniedMessage,
  pickPhone,
  viewerId,
  viewerRole,
};
