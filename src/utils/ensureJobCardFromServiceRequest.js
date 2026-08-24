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
  return JobCard.findOne({
    $or: [{_id: id}, {bookingId: id}, {serviceRequestId: id}],
  });
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
    await jobCard.save({validateBeforeSave: false});
    return jobCard;
  }

  jobCard = new JobCard({
    _id: id,
    createdAt: sr.createdAt || now,
    ...fields,
  });
  await jobCard.save({validateBeforeSave: false});
  return jobCard;
}

/**
 * Backfill JobCards for this Partner's accepted/in-progress/completed work
 * that was created before JobCards were always opened on accept.
 */
async function backfillProviderJobCards(providerId) {
  const ServiceRequest = require('../models/ServiceRequest');
  const uid = String(providerId || '').trim();
  if (!uid) return 0;

  const rows = await ServiceRequest.find({
    providerId: uid,
    status: {$in: ['accepted', 'in-progress', 'completed']},
  })
    .select(
      '_id customerId customerName customerPhone customerAddress serviceType problem questionnaireAnswers photos bookingId status scheduledTime acceptedAt createdAt providerId providerName providerPhone providerAddress',
    )
    .lean();

  let created = 0;
  for (const sr of rows) {
    const id = srKey(sr);
    const existing = await findLinkedJobCard(id);
    if (existing) continue;
    await ensureJobCardFromServiceRequest(sr);
    created += 1;
  }
  return created;
}

module.exports = {
  ensureJobCardFromServiceRequest,
  backfillProviderJobCards,
};
