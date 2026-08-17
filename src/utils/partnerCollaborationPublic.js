/**
 * Public Partner payloads for Partner-to-Partner collaboration.
 * Never include phone, email, Aadhaar, street address, or internal secrets.
 */

const {pickPhone} = require('./contactAccess');

const PRIVATE_FIELDS = [
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
];

function professionOf(provider) {
  if (!provider) return '';
  if (provider.specialization) return String(provider.specialization);
  if (provider.serviceType) return String(provider.serviceType);
  const cats = provider.serviceCategories;
  if (Array.isArray(cats) && cats[0]) return String(cats[0]);
  return '';
}

function locationPublic(loc) {
  if (!loc || typeof loc !== 'object') return {};
  return {
    city: loc.city || '',
    district: loc.district || loc.city || '',
    state: loc.state || '',
    stateId: loc.stateId || undefined,
    districtId: loc.districtId || undefined,
    latitude: loc.latitude,
    longitude: loc.longitude,
  };
}

function toCollaborationPartner(provider) {
  if (!provider) return null;
  const raw = provider.toObject ? provider.toObject() : {...provider};
  for (const field of PRIVATE_FIELDS) {
    delete raw[field];
  }
  const loc = raw.location || raw.address || {};
  const rating =
    typeof raw.rating === 'number' && raw.rating > 0 ? raw.rating : undefined;
  const totalReviews =
    typeof raw.totalReviews === 'number' && raw.totalReviews > 0
      ? raw.totalReviews
      : undefined;
  return {
    id: String(raw._id || raw.id || ''),
    name: raw.name || raw.displayName || '',
    profession: professionOf(raw),
    serviceCategories: Array.isArray(raw.serviceCategories)
      ? raw.serviceCategories
      : [],
    location: locationPublic(loc),
    isOnline: Boolean(raw.isOnline),
    verified:
      raw.approvalStatus === 'approved' || raw.verified === true,
    rating,
    totalReviews,
    profileImage: raw.profileImage || undefined,
  };
}

function locationSnapshotFromJob(job) {
  const a = job?.customerAddress || {};
  return {
    city: a.city || '',
    district: a.district || a.city || '',
    state: a.state || '',
    stateId: a.stateId || undefined,
    districtId: a.districtId || undefined,
    address: a.address || undefined,
    latitude: a.latitude,
    longitude: a.longitude,
  };
}

function photoUrls(photos) {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((p) => {
      if (typeof p === 'string') return p;
      return p?.url || '';
    })
    .filter(Boolean)
    .slice(0, 8);
}

function toPublicCollaborationRequest(doc) {
  if (!doc) return doc;
  const raw = doc.toObject ? doc.toObject() : {...doc};
  return {
    id: String(raw._id || raw.id || ''),
    jobCardId: raw.jobCardId,
    serviceRequestId: raw.serviceRequestId || undefined,
    requestingProviderId: raw.requestingProviderId,
    requestingProviderName: raw.requestingProviderName || '',
    targetProviderId: raw.targetProviderId,
    targetProviderName: raw.targetProviderName || '',
    neededServiceType: raw.neededServiceType,
    jobServiceType: raw.jobServiceType || undefined,
    customerName: raw.customerName || '',
    location: raw.location || {},
    problem: raw.problem || '',
    extraNotes: raw.extraNotes || '',
    photos: photoUrls(raw.photos),
    status: raw.status || 'pending',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    acceptedAt: raw.acceptedAt,
    rejectedAt: raw.rejectedAt,
    completedAt: raw.completedAt,
    cancelledAt: raw.cancelledAt,
    cancelledBy: raw.cancelledBy || undefined,
  };
}

function newId() {
  return new (require('mongodb').ObjectId)().toString();
}

module.exports = {
  professionOf,
  toCollaborationPartner,
  locationSnapshotFromJob,
  photoUrls,
  toPublicCollaborationRequest,
  newId,
  pickPhone,
};
