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

module.exports = {
  ACTIVE_SERVICE_STATUSES,
  TERMINAL_SERVICE_STATUSES,
  normalizeServiceTypeKey,
  isActiveServiceStatus,
  lockId,
};
