/**
 * Helpers to find / lock / release active service requests.
 */

const ServiceRequest = require('../models/ServiceRequest');
const ActiveServiceRequestLock = require('../models/ActiveServiceRequestLock');
const {
  ACTIVE_SERVICE_STATUSES,
  normalizeServiceTypeKey,
  lockId,
  isActiveServiceStatus,
} = require('../utils/activeServiceRequest');

async function findActiveServiceRequest(customerId, serviceType) {
  const uid = String(customerId || '').trim();
  const key = normalizeServiceTypeKey(serviceType);
  if (!uid || !key) return null;

  // Prefer exact key match (new writes)
  let existing = await ServiceRequest.findOne({
    customerId: uid,
    serviceTypeKey: key,
    status: {$in: ACTIVE_SERVICE_STATUSES},
  })
    .sort({createdAt: -1})
    .lean();

  if (existing) return existing;

  // Legacy docs without serviceTypeKey — case-insensitive match
  const legacy = await ServiceRequest.find({
    customerId: uid,
    status: {$in: ACTIVE_SERVICE_STATUSES},
  })
    .sort({createdAt: -1})
    .limit(50)
    .lean();

  return (
    legacy.find(
      (row) => normalizeServiceTypeKey(row.serviceType) === key,
    ) || null
  );
}

/**
 * Acquire lock before create. Returns { ok: true } or { ok: false, existing }.
 */
async function acquireActiveRequestLock({
  customerId,
  serviceType,
  provisionalRequestId = '',
}) {
  const uid = String(customerId || '').trim();
  const displayType = String(serviceType || '').trim();
  const key = normalizeServiceTypeKey(displayType);
  if (!uid || !key) {
    return {ok: false, error: 'invalid'};
  }

  const existing = await findActiveServiceRequest(uid, displayType);
  if (existing) {
    return {ok: false, existing, code: 'ACTIVE_SERVICE_REQUEST_EXISTS'};
  }

  const id = lockId(uid, key);
  try {
    await ActiveServiceRequestLock.create({
      _id: id,
      customerId: uid,
      serviceTypeKey: key,
      serviceType: displayType,
      serviceRequestId: provisionalRequestId || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return {ok: true, lockId: id, serviceTypeKey: key};
  } catch (err) {
    if (err && (err.code === 11000 || err.code === 'E11000')) {
      const again = await findActiveServiceRequest(uid, displayType);
      return {
        ok: false,
        existing: again,
        code: 'ACTIVE_SERVICE_REQUEST_EXISTS',
      };
    }
    throw err;
  }
}

async function bindLockToRequest(customerId, serviceType, serviceRequestId) {
  const uid = String(customerId || '').trim();
  const key = normalizeServiceTypeKey(serviceType);
  if (!uid || !key || !serviceRequestId) return;
  await ActiveServiceRequestLock.updateOne(
    {_id: lockId(uid, key)},
    {
      $set: {
        serviceRequestId: String(serviceRequestId),
        updatedAt: new Date(),
      },
    },
  );
}

async function releaseActiveRequestLock(customerId, serviceType) {
  const uid = String(customerId || '').trim();
  const key = normalizeServiceTypeKey(serviceType);
  if (!uid || !key) return;
  await ActiveServiceRequestLock.deleteOne({_id: lockId(uid, key)});
}

async function releaseActiveRequestLockForRequest(serviceRequest) {
  if (!serviceRequest) return;
  const uid = serviceRequest.customerId;
  const type = serviceRequest.serviceType;
  await releaseActiveRequestLock(uid, type);
  // Also release by key if stored
  if (serviceRequest.serviceTypeKey) {
    await ActiveServiceRequestLock.deleteOne({
      _id: lockId(uid, serviceRequest.serviceTypeKey),
    });
  }
}

/**
 * When status moves to terminal, free the lock so customer can re-request.
 */
async function onServiceRequestStatusChange(serviceRequest, nextStatus) {
  if (!serviceRequest) return;
  if (isActiveServiceStatus(nextStatus)) return;
  await releaseActiveRequestLockForRequest(serviceRequest);
}

function activeRequestConflictPayload(existing, lang, t) {
  const message =
    t('serviceRequests.activeExists', lang) ||
    'You already have an active request for this service. Please wait for it to be completed or cancelled before creating another request.';
  return {
    success: false,
    error: 'ACTIVE_SERVICE_REQUEST_EXISTS',
    code: 'ACTIVE_SERVICE_REQUEST_EXISTS',
    message,
    data: existing
      ? {
          serviceRequestId: String(existing._id),
          serviceType: existing.serviceType,
          status: existing.status,
          providerId: existing.providerId || null,
          providerName: existing.providerName || null,
          createdAt: existing.createdAt || null,
        }
      : undefined,
  };
}

module.exports = {
  findActiveServiceRequest,
  acquireActiveRequestLock,
  bindLockToRequest,
  releaseActiveRequestLock,
  releaseActiveRequestLockForRequest,
  onServiceRequestStatusChange,
  activeRequestConflictPayload,
  ACTIVE_SERVICE_STATUSES,
  normalizeServiceTypeKey,
};
