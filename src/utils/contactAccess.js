/**
 * Protected contact authorization — source of truth for when
 * customer ↔ provider phone numbers may be revealed.
 *
 * Never trust client-provided phone, role, or job status alone.
 * Derive from authenticated viewer + persisted job/SR records.
 */

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
  // Treat underscore form as hyphen form
  const compact = key.replace(/-/g, '');
  if (CONTACT_ALLOWED_STATUSES.has(key)) return true;
  if (key === 'inprogress' || compact === 'inprogress') return true;
  if (CONTACT_ALLOWED_STATUSES.has(compact.replace('inprogress', 'in-progress'))) {
    return true;
  }
  return CONTACT_ALLOWED_STATUSES.has(key);
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
 * Customer may see provider phone only when they own the job and status allows.
 */
function canAccessProviderContact(viewer, jobOrSr) {
  if (!viewer || !jobOrSr) return false;
  if (viewerRole(viewer) === 'admin') return true;

  const uid = viewerId(viewer);
  if (!uid) return false;

  const customerId = partyId(jobOrSr, 'customerId', 'customer_id');
  const providerId = partyId(jobOrSr, 'providerId', 'provider_id');
  if (!customerId || !providerId) return false;

  if (viewerRole(viewer) === 'customer' && uid === customerId) {
    return statusAllowsContact(jobOrSr.status);
  }

  // Assigned provider may see their own listed contact (rarely needed)
  if (viewerRole(viewer) === 'provider' && uid === providerId) {
    return true;
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
 * Public browse/detail provider payload — no private contact.
 */
function toPublicProvider(provider) {
  if (!provider) return provider;
  const raw = provider.toObject ? provider.toObject() : {...provider};
  const out = stripFields(raw, PUBLIC_PROVIDER_STRIP_FIELDS);
  // Public location: district/city/state only — drop exact street if present
  if (out.location && typeof out.location === 'object') {
    out.location = {
      city: out.location.city,
      district: out.location.district,
      state: out.location.state,
      stateId: out.location.stateId,
      districtId: out.location.districtId,
      // Keep coarse coords optional for map; omit street address
      latitude: out.location.latitude,
      longitude: out.location.longitude,
    };
  }
  if (out.address && typeof out.address === 'object') {
    out.address = {
      city: out.address.city,
      district: out.address.district,
      state: out.address.state,
      stateId: out.address.stateId,
      districtId: out.address.districtId,
    };
  }
  out.contactAvailable = false;
  return out;
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
 * Redact SR/job for a viewer based on contact rules.
 */
function redactServiceRequestForViewer(doc, viewer) {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : {...doc};
  if (obj._id != null) obj._id = String(obj._id);

  const allowProvider = canAccessProviderContact(viewer, obj);
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

  obj.contact = {
    providerPhoneAvailable: allowProvider && Boolean(
      (obj.providerPhone && allowProvider) || allowProvider,
    ),
    customerPhoneAvailable: allowCustomer,
    canCallProvider: allowProvider,
    canCallCustomer: allowCustomer && viewerRole(viewer) === 'provider',
  };

  // Recompute availability flags after possible deletion
  obj.contact.providerPhoneAvailable = allowProvider && Boolean(obj.providerPhone);
  obj.contact.customerPhoneAvailable = allowCustomer && Boolean(obj.customerPhone);

  return obj;
}

function redactJobCardForViewer(doc, viewer) {
  return redactServiceRequestForViewer(doc, viewer);
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
  redactServiceRequestForViewer,
  redactJobCardForViewer,
  sanitizeBookingNotifyPayload,
  contactDeniedMessage,
  pickPhone,
  viewerId,
  viewerRole,
};
