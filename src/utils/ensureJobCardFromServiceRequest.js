/**
 * Customer-targeted requests do not create a JobCard (those are only opened
 * for admin-assist when no Partner is in the area). Provider accept used to
 * update existing cards only — so accepted work never appeared on Partner Home.
 */

const JobCard = require('../models/JobCard');

const JOB_STATUSES = new Set([
  'unassigned',
  'pending',
  'accepted',
  'in-progress',
  'completed',
  'cancelled',
]);

function srKey(sr) {
  return String(sr?._id || '').trim();
}

function jobStatusFromRequest(status) {
  const raw = String(status || '').toLowerCase();
  if (JOB_STATUSES.has(raw)) return raw;
  if (raw === 'rejected') return 'cancelled';
  return 'accepted';
}

async function findLinkedJobCard(id) {
  if (!id) return null;
  const byPrimaryId = await JobCard.findById(id);
  if (byPrimaryId) return byPrimaryId;
  return JobCard.findOne({
    $or: [{bookingId: id}, {serviceRequestId: id}],
  });
}

async function syncLinkedJobCardStatuses(id, providerId, status, extras = {}) {
  const uid = String(providerId || '').trim();
  if (!id || !uid) return;

  const acceptedAt = extras.acceptedAt || null;
  const $set = {status, updatedAt: new Date()};
  if (status === 'accepted' && acceptedAt) {
    $set.acceptedAt = acceptedAt;
  }

  const update = {$set};
  if (status === 'accepted') {
    update.$unset = {taskPIN: '', pinGeneratedAt: ''};
  }

  await JobCard.updateMany(
    {
      providerId: uid,
      $or: [{_id: id}, {bookingId: id}, {serviceRequestId: id}],
    },
    update,
  );
}

function addressFrom(sr) {
  const a = sr.customerAddress || {};
  return {
    address: a.address,
    landmark: a.landmark,
    city: a.district || a.city,
    district: a.district || a.city,
    state: a.state,
    stateId: a.stateId,
    districtId: a.districtId,
    pincode: a.pincode,
    latitude: a.latitude,
    longitude: a.longitude,
    label: a.label,
    customLabel: a.customLabel,
  };
}

/**
 * Create or update the Partner JobCard for a service request.
 */
async function ensureJobCardFromServiceRequest(sr, extras = {}) {
  const id = srKey(sr);
  if (!id) return null;

  const now = new Date();
  const status = jobStatusFromRequest(extras.status || sr.status);
  const fields = {
    providerId: String(extras.providerId || sr.providerId || ''),
    providerName: extras.providerName || sr.providerName || '',
    providerPhone: extras.providerPhone || sr.providerPhone || '',
    providerAddress: extras.providerAddress || sr.providerAddress || undefined,
    customerId: String(sr.customerId || ''),
    customerName: sr.customerName || 'Customer',
    customerPhone: sr.customerPhone || '',
    customerAddress: addressFrom(sr),
    serviceType: sr.serviceType,
    problem: sr.problem || '',
    questionnaireAnswers: sr.questionnaireAnswers,
    photos: Array.isArray(sr.photos) ? sr.photos : undefined,
    bookingId: id,
    serviceRequestId: id,
    needsAdminAssignment: false,
    status,
    scheduledTime: sr.scheduledTime,
    acceptedAt: extras.acceptedAt || sr.acceptedAt,
    updatedAt: now,
  };

  let jobCard = await findLinkedJobCard(id);
  if (jobCard) {
    Object.assign(jobCard, fields);
    if (status === 'accepted') {
      jobCard.taskPIN = undefined;
      jobCard.pinGeneratedAt = undefined;
    }
    await jobCard.save({validateBeforeSave: false});
    await syncLinkedJobCardStatuses(id, fields.providerId, status, {
      acceptedAt: fields.acceptedAt,
    });
    return jobCard;
  }

  jobCard = new JobCard({
    _id: id,
    createdAt: sr.createdAt || now,
    ...fields,
  });
  if (status === 'accepted') {
    jobCard.taskPIN = undefined;
    jobCard.pinGeneratedAt = undefined;
  }
  await jobCard.save({validateBeforeSave: false});
  await syncLinkedJobCardStatuses(id, fields.providerId, status, {
    acceptedAt: fields.acceptedAt,
  });
  return jobCard;
}

/**
 * Backfill JobCards for this Partner's accepted/in-progress/completed work
 * that was created before JobCards were always opened on accept.
 *
 * Only creates *missing* cards, and is debounced per provider so list/history
 * endpoints are not blocked by a full sequential sync on every request.
 */
const BACKFILL_DEBOUNCE_MS = 5 * 60 * 1000;
/** @type {Map<string, number>} */
const lastBackfillAt = new Map();

async function backfillProviderJobCards(providerId, opts = {}) {
  const uid = String(providerId || '').trim();
  if (!uid) return 0;

  const force = Boolean(opts.force);
  const now = Date.now();
  const previous = lastBackfillAt.get(uid) || 0;
  if (!force && now - previous < BACKFILL_DEBOUNCE_MS) {
    return 0;
  }
  // Mark early so concurrent list requests do not stampede the same sync.
  lastBackfillAt.set(uid, now);

  const ServiceRequest = require('../models/ServiceRequest');
  const rows = await ServiceRequest.find({
    providerId: uid,
    status: {$in: ['accepted', 'in-progress', 'completed']},
  })
    .select(
      '_id customerId customerName customerPhone customerAddress serviceType problem questionnaireAnswers photos bookingId status scheduledTime acceptedAt createdAt providerId providerName providerPhone providerAddress',
    )
    .lean();

  if (!rows.length) return 0;

  const srIds = rows.map((sr) => srKey(sr)).filter(Boolean);
  const existing = await JobCard.find({
    providerId: uid,
    $or: [
      {_id: {$in: srIds}},
      {bookingId: {$in: srIds}},
      {serviceRequestId: {$in: srIds}},
    ],
  })
    .select('_id bookingId serviceRequestId')
    .lean();

  const have = new Set();
  for (const job of existing) {
    if (job._id) have.add(String(job._id));
    if (job.bookingId) have.add(String(job.bookingId));
    if (job.serviceRequestId) have.add(String(job.serviceRequestId));
  }

  let synced = 0;
  const missing = rows.filter((sr) => {
    const id = srKey(sr);
    return Boolean(id) && !have.has(id);
  });
  // Small parallel batches — avoid long sequential awaits when many are missing.
  const BATCH = 5;
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (sr) => {
        const id = srKey(sr);
        await ensureJobCardFromServiceRequest(sr);
        have.add(id);
        synced += 1;
      }),
    );
  }
  return synced;
}

module.exports = {
  ensureJobCardFromServiceRequest,
  backfillProviderJobCards,
};
