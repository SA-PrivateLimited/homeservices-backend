/**
 * One active service request per customer + service type.
 * Race-safe via ActiveServiceRequestLock unique key + partial unique index.
 */

const ACTIVE_SERVICE_STATUSES = Object.freeze([
  'pending',
  'accepted',
  'in-progress',
]);

const TERMINAL_SERVICE_STATUSES = Object.freeze([
  'completed',
  'cancelled',
  'canceled',
  'rejected',
  'expired',
]);

function normalizeServiceTypeKey(serviceType) {
  return String(serviceType || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isActiveServiceStatus(status) {
  const s = String(status || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-');
  if (ACTIVE_SERVICE_STATUSES.includes(s)) return true;
  if (s === 'inprogress') return true;
  return false;
}

function lockId(customerId, serviceTypeKey) {
  return `${String(customerId)}::${String(serviceTypeKey)}`;
}

/** Locks newer than this with no serviceRequestId are treated as an in-flight create. */
const IN_FLIGHT_LOCK_MS = 20_000;

/**
 * After a duplicate-key on the active lock, decide whether the lock is a real
 * conflict or leftover from a cancelled/failed request.
 *
 * @returns {'conflict-active' | 'conflict-linked' | 'conflict-inflight' | 'reclaim' | 'retry'}
 */
function decideDuplicateLockAction({
  activeRequest,
  lock,
  linkedRequestActive = false,
  now = Date.now(),
  inFlightMs = IN_FLIGHT_LOCK_MS,
}) {
  if (activeRequest) return 'conflict-active';
  if (linkedRequestActive) return 'conflict-linked';
  if (!lock) return 'retry';
  if (lock.serviceRequestId) return 'reclaim';
  const createdAt = lock.createdAt ? new Date(lock.createdAt).getTime() : 0;
  if (createdAt && now - createdAt < inFlightMs) return 'conflict-inflight';
  return 'reclaim';
}

module.exports = {
  ACTIVE_SERVICE_STATUSES,
  TERMINAL_SERVICE_STATUSES,
  IN_FLIGHT_LOCK_MS,
  normalizeServiceTypeKey,
  isActiveServiceStatus,
  lockId,
  decideDuplicateLockAction,
};
