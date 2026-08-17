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
  decideDuplicateLockAction,
} = require('../utils/activeServiceRequest');

function isDuplicateKeyError(err) {
  return Boolean(err && (err.code === 11000 || err.code === 'E11000'));
}

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

async function findRequestByLockId(serviceRequestId) {
  const id = String(serviceRequestId || '').trim();
  if (!id) return null;
  return ServiceRequest.findOne({
    $or: [{_id: id}, {consultationId: id}],
  }).lean();
}

async function insertActiveLock({
  id,
  uid,
  key,
  displayType,
  provisionalRequestId,
}) {
  await ActiveServiceRequestLock.create({
    _id: id,
    customerId: uid,
    serviceTypeKey: key,
    serviceType: displayType,
    serviceRequestId: provisionalRequestId || '',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/**
 * Duplicate lock key with no matching active ServiceRequest is leftover
 * (cancel/create failure). Delete it so the customer can request again.
 */
async function resolveDuplicateLock(uid, displayType, key, id) {
  const active = await findActiveServiceRequest(uid, displayType);
  const lock = await ActiveServiceRequestLock.findById(id).lean();
  let linked = null;
  if (lock && lock.serviceRequestId) {
    linked = await findRequestByLockId(lock.serviceRequestId);
  }
  const linkedRequestActive = Boolean(
    linked &&
      isActiveServiceStatus(linked.status) &&
      String(linked.customerId) === uid,
  );
  const action = decideDuplicateLockAction({
    activeRequest: active,
    lock,
    linkedRequestActive,
  });

  if (action === 'conflict-active') {
    return {ok: false, existing: active, code: 'ACTIVE_SERVICE_REQUEST_EXISTS'};
  }
  if (action === 'conflict-linked') {
    return {ok: false, existing: linked, code: 'ACTIVE_SERVICE_REQUEST_EXISTS'};
  }
  if (action === 'conflict-inflight') {
    return {ok: false, existing: null, code: 'ACTIVE_SERVICE_REQUEST_EXISTS'};
  }
  if (action === 'reclaim') {
    await releaseActiveRequestLock(uid, displayType);
  }
  return {ok: 'retry'};
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await insertActiveLock({
        id,
        uid,
        key,
        displayType,
        provisionalRequestId,
      });
      return {ok: true, lockId: id, serviceTypeKey: key};
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const resolved = await resolveDuplicateLock(uid, displayType, key, id);
      if (resolved.ok === false) return resolved;
    }
  }

  const again = await findActiveServiceRequest(uid, displayType);
  return {
    ok: false,
    existing: again,
    code: 'ACTIVE_SERVICE_REQUEST_EXISTS',
  };
}

/**
 * If a lock remains after every request for this type is terminal, drop it.
 * Used by GET /active so the UI does not claim a ghost active request.
 */
async function sweepStaleActiveRequestLock(customerId, serviceType) {
  const uid = String(customerId || '').trim();
  const displayType = String(serviceType || '').trim();
  const key = normalizeServiceTypeKey(displayType);
  if (!uid || !key) return;
  const id = lockId(uid, key);
  const resolved = await resolveDuplicateLock(uid, displayType, key, id);
  return resolved;
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
  await ActiveServiceRequestLock.deleteMany({
    $or: [{_id: lockId(uid, key)}, {customerId: uid, serviceTypeKey: key}],
  });
}

async function releaseActiveRequestLockForRequest(serviceRequest) {
  if (!serviceRequest) return;
  const uid = serviceRequest.customerId;
  const type = serviceRequest.serviceType;
  await releaseActiveRequestLock(uid, type);
  if (serviceRequest.serviceTypeKey) {
    await releaseActiveRequestLock(uid, serviceRequest.serviceTypeKey);
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
  sweepStaleActiveRequestLock,
  bindLockToRequest,
  releaseActiveRequestLock,
  releaseActiveRequestLockForRequest,
  onServiceRequestStatusChange,
  activeRequestConflictPayload,
  ACTIVE_SERVICE_STATUSES,
  normalizeServiceTypeKey,
};
