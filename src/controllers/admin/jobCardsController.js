/**
 * Job Cards Controller (Admin App)
 * Admin-specific job card operations
 */

const JobCard = require('../../models/JobCard');
const Provider = require('../../models/Provider');
const ServiceRequest = require('../../models/ServiceRequest');
const {notifyUser} = require('../../utils/notify');
const {notifyBooking} = require('../../realtime/socket');
const ADMIN_LIST_SORT = require('../../utils/adminListSort');
const {getContactSettings} = require('../../services/contactPolicyService');
const {customerFacingProviderPhone} = require('../../utils/contactAccess');
const {onServiceRequestStatusChange} = require('../../services/activeServiceRequestService');

function isUnassigned(job) {
  if ((job.status || '') === 'unassigned') return true;
  const id = (job.providerId || '').trim();
  return !id || id === 'unassigned' || id === 'none';
}

/** Map a pending service request into a job-card shaped row for the admin Jobs UI. */
function serviceRequestToJobShape(sr) {
  const id = String(sr._id);
  return {
    _id: `sr_${id}`,
    consultationId: id,
    bookingId: id,
    serviceRequestId: id,
    customerId: sr.customerId,
    customerName: sr.customerName,
    customerPhone: sr.customerPhone,
    customerAddress: sr.customerAddress,
    providerId: sr.providerId || '',
    providerName: sr.providerName || '',
    providerPhone: sr.providerPhone || '',
    serviceType: sr.serviceType,
    problem: sr.problem,
    status: sr.needsAdminAssignment ? 'unassigned' : 'pending',
    needsAdminAssignment: !!sr.needsAdminAssignment,
    urgency: sr.urgency,
    scheduledTime: sr.scheduledTime,
    createdAt: sr.createdAt,
    updatedAt: sr.updatedAt,
    acceptedAt: sr.acceptedAt,
    source: 'serviceRequest',
    comments: [],
  };
}

function parseServiceRequestId(jobCardId) {
  const id = String(jobCardId || '');
  if (id.startsWith('sr_')) return id.slice(3);
  return null;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match customer service address by state / district (name or id).
 */
function applyCustomerAreaFilters(query, {state, district, stateId, districtId}) {
  const and = [];
  if (stateId || state) {
    const or = [];
    if (stateId) {
      or.push({'customerAddress.stateId': String(stateId)});
    }
    if (state) {
      const re = new RegExp(`^${escapeRegex(state)}$`, 'i');
      or.push({'customerAddress.state': re});
    }
    and.push(or.length === 1 ? or[0] : {$or: or});
  }
  if (districtId || district) {
    const or = [];
    if (districtId) {
      or.push({'customerAddress.districtId': String(districtId)});
    }
    if (district) {
      const re = new RegExp(`^${escapeRegex(district)}$`, 'i');
      or.push({'customerAddress.district': re});
      or.push({'customerAddress.city': re});
    }
    and.push(or.length === 1 ? or[0] : {$or: or});
  }
  if (!and.length) return query;
  query.$and = [...(query.$and || []), ...and];
  return query;
}

/**
 * Get all job cards (admin can see all)
 * Also includes pending service requests (not yet accepted → no job card yet)
 * Query: status?, unassigned=true, customerId?, providerId?, state?, district?, limit, offset
 */
exports.getAllJobCards = async (req, res, next) => {
  try {
    const {
      status,
      customerId,
      providerId,
      unassigned,
      needsAdminAssignment,
      state,
      district,
      stateId,
      districtId,
      limit = 100,
      offset = 0,
    } = req.query;

    const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    const area = {state, district, stateId, districtId};

    const wantUnassigned = String(unassigned) === 'true';
    const wantNeedsAdmin = String(needsAdminAssignment) === 'true';
    const wantPendingOnly = status === 'pending';
    const includePendingRequests =
      wantUnassigned || wantNeedsAdmin || wantPendingOnly || !status;

    const jobQuery = {};
    if (customerId) jobQuery.customerId = customerId;
    if (providerId) jobQuery.providerId = providerId;

    if (wantNeedsAdmin) {
      jobQuery.$and = [
        {needsAdminAssignment: true},
        {
          $or: [
            {status: 'unassigned'},
            {providerId: {$exists: false}},
            {providerId: null},
            {providerId: ''},
            {providerId: 'unassigned'},
            {providerId: 'none'},
          ],
        },
      ];
    } else if (wantUnassigned) {
      jobQuery.$or = [
        {status: 'unassigned'},
        {needsAdminAssignment: true},
        {providerId: {$exists: false}},
        {providerId: null},
        {providerId: ''},
        {providerId: 'unassigned'},
        {providerId: 'none'},
      ];
    } else if (status) {
      jobQuery.status = status;
    }

    applyCustomerAreaFilters(jobQuery, area);

    // Accepted / completed / etc. — no need to merge service requests
    if (!includePendingRequests) {
      const [jobCards, jobTotal] = await Promise.all([
        JobCard.find(jobQuery)
          .sort(ADMIN_LIST_SORT)
          .limit(lim)
          .skip(off)
          .lean(),
        JobCard.countDocuments(jobQuery),
      ]);
      return res.json({
        success: true,
        data: jobCards.map((j) => ({...j, source: 'jobCard'})),
        count: jobCards.length,
        total: jobTotal,
        limit: lim,
        offset: off,
      });
    }

    const srQuery = {status: 'pending'};
    if (customerId) srQuery.customerId = customerId;
    if (wantNeedsAdmin) {
      srQuery.needsAdminAssignment = true;
    }
    if (providerId) {
      srQuery.providerId = providerId;
    } else if (wantUnassigned || wantNeedsAdmin) {
      srQuery.$and = [
        ...(srQuery.$and || []),
        {
          $or: [
            {providerId: {$exists: false}},
            {providerId: null},
            {providerId: ''},
          ],
        },
      ];
    }
    applyCustomerAreaFilters(srQuery, area);

    const [jobCards, jobTotal, pendingSrs] = await Promise.all([
      JobCard.find(jobQuery)
        .sort(ADMIN_LIST_SORT)
        .limit(lim)
        .skip(off)
        .lean(),
      JobCard.countDocuments(jobQuery),
      ServiceRequest.find(srQuery)
        .sort(ADMIN_LIST_SORT)
        .limit(lim)
        .skip(off)
        .lean(),
    ]);

    const srIds = pendingSrs.map((sr) => String(sr._id));
    const linked = srIds.length
      ? await JobCard.find({
          $or: [
            {serviceRequestId: {$in: srIds}},
            {bookingId: {$in: srIds}},
            {_id: {$in: srIds}},
          ],
        })
          .select('_id bookingId serviceRequestId')
          .lean()
      : [];
    const linkedIds = new Set(
      linked.flatMap((r) =>
        [r._id, r.bookingId, r.serviceRequestId].filter(Boolean).map(String),
      ),
    );

    const pendingAsJobs = pendingSrs
      .filter((sr) => !linkedIds.has(String(sr._id)))
      .map(serviceRequestToJobShape);

    const merged = [
      ...jobCards.map((j) => ({...j, source: 'jobCard'})),
      ...pendingAsJobs,
    ].sort((a, b) => {
      const ua = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const ub = new Date(b.updatedAt || b.createdAt || 0).getTime();
      if (ub !== ua) return ub - ua;
      const ca = new Date(a.createdAt || 0).getTime();
      const cb = new Date(b.createdAt || 0).getTime();
      return cb - ca;
    });

    const page = merged.slice(0, lim);

    res.json({
      success: true,
      data: page,
      count: page.length,
      total: jobTotal,
      limit: lim,
      offset: off,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single job card (admin can see any)
 * Also supports virtual ids: sr_<serviceRequestId>
 */
exports.getJobCardById = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const srId = parseServiceRequestId(jobCardId);

    if (srId) {
      const sr = await ServiceRequest.findById(srId).lean();
      if (!sr) {
        return res.status(404).json({
          success: false,
          error: 'Job card not found',
        });
      }
      return res.json({
        success: true,
        data: serviceRequestToJobShape(sr),
      });
    }

    const jobCard = await JobCard.findById(jobCardId);

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    // Backfill PIN for in-progress jobs started without one (legacy Provider Web)
    if (
      jobCard.status === 'in-progress' &&
      !(jobCard.taskPIN || '').trim()
    ) {
      jobCard.taskPIN = String(Math.floor(1000 + Math.random() * 9000));
      jobCard.pinGeneratedAt = new Date();
      jobCard.updatedAt = new Date();
      await jobCard.save({validateBeforeSave: false});
    }

    const enriched = await enrichJobCardForAdmin(jobCard);

    res.json({
      success: true,
      data: enriched,
    });
  } catch (error) {
    next(error);
  }
};

/** Fill missing admin detail fields from linked service request / provider. */
async function enrichJobCardForAdmin(jobDoc) {
  const obj = jobDoc.toObject ? jobDoc.toObject() : {...jobDoc};
  const srKey = String(
    obj.serviceRequestId || obj.bookingId || obj.consultationId || '',
  ).trim();

  if (srKey) {
    try {
      const sr = await ServiceRequest.findById(srKey).lean();
      if (sr) {
        if (!obj.problem && sr.problem) obj.problem = sr.problem;
        if (!obj.scheduledTime && sr.scheduledTime) {
          obj.scheduledTime = sr.scheduledTime;
        }
        if (!obj.acceptedAt && sr.acceptedAt) obj.acceptedAt = sr.acceptedAt;
        if (!obj.customerName && sr.customerName) {
          obj.customerName = sr.customerName;
        }
        if (!obj.customerPhone && sr.customerPhone) {
          obj.customerPhone = sr.customerPhone;
        }
        if (
          (!obj.customerAddress ||
            (typeof obj.customerAddress === 'object' &&
              !obj.customerAddress.address)) &&
          sr.customerAddress
        ) {
          obj.customerAddress = sr.customerAddress;
        }
        if (!obj.serviceType && sr.serviceType) {
          obj.serviceType = sr.serviceType;
        }
      }
    } catch (_) {
      // non-fatal
    }
  }

  const providerId = String(obj.providerId || '').trim();
  if (providerId && providerId !== 'unassigned' && providerId !== 'none') {
    try {
      const provider = await Provider.findById(providerId).lean();
      if (provider) {
        if (!obj.providerName) {
          obj.providerName =
            provider.businessName ||
            provider.name ||
            provider.displayName ||
            '';
        }
        if (!obj.providerPhone) {
          obj.providerPhone = provider.phone || provider.phoneNumber || '';
        }
        const hasProviderAddress =
          obj.providerAddress &&
          (typeof obj.providerAddress === 'string'
            ? obj.providerAddress.trim()
            : obj.providerAddress.address);
        if (!hasProviderAddress) {
          obj.providerAddress =
            provider.address || provider.location || obj.providerAddress;
        }
      }
    } catch (_) {
      // non-fatal
    }
  }

  return obj;
}

/**
 * Create or update a job card from a pending service request (used when admin assigns).
 */
async function ensureJobCardFromServiceRequest(srId, provider, nextStatus) {
  const sr = await ServiceRequest.findById(srId);
  if (!sr) {
    const err = new Error('Service request not found');
    err.status = 404;
    throw err;
  }
  if (sr.status === 'cancelled' || sr.status === 'rejected') {
    const err = new Error(`Cannot assign: service request is ${sr.status}`);
    err.status = 400;
    throw err;
  }

  const providerName =
    provider.businessName ||
    provider.name ||
    provider.displayName ||
    'Provider';
  const providerPhone = provider.phone || provider.phoneNumber || '';
  const providerId = provider._id.toString();
  const status = nextStatus || 'accepted';
  const now = new Date();

  let jobCard = await JobCard.findOne({
    $or: [
      {_id: srId},
      {bookingId: srId},
      {serviceRequestId: srId},
    ],
  });

  if (jobCard) {
    jobCard.providerId = providerId;
    jobCard.providerName = providerName;
    jobCard.providerPhone = providerPhone;
    if (provider.address) {
      jobCard.providerAddress = provider.address;
    }
    jobCard.status = status;
    jobCard.needsAdminAssignment = false;
    if (status === 'accepted' && !jobCard.acceptedAt) {
      jobCard.acceptedAt = sr.acceptedAt || now;
    }
    jobCard.updatedAt = now;
    await jobCard.save({validateBeforeSave: false});
  } else {
    jobCard = new JobCard({
      _id: srId,
      bookingId: srId,
      serviceRequestId: srId,
      customerId: sr.customerId,
      customerName: sr.customerName,
      customerPhone: sr.customerPhone,
      customerAddress: sr.customerAddress,
      providerId,
      providerName,
      providerPhone,
      providerAddress: provider.address || undefined,
      serviceType: sr.serviceType,
      problem: sr.problem || '',
      status,
      needsAdminAssignment: false,
      acceptedAt: status === 'accepted' ? sr.acceptedAt || now : undefined,
      scheduledTime: sr.scheduledTime,
      createdAt: sr.createdAt || now,
      updatedAt: now,
    });
    await jobCard.save({validateBeforeSave: false});
  }

  sr.status = status;
  sr.providerId = providerId;
  sr.providerName = providerName;
  sr.providerPhone = providerPhone;
  sr.needsAdminAssignment = false;
  if (status === 'accepted' && !sr.acceptedAt) {
    sr.acceptedAt = jobCard.acceptedAt || now;
  }
  sr.updatedAt = now;
  await sr.save({validateBeforeSave: false});

  return jobCard;
}

/**
 * POST /api/admin/jobCards/:jobCardId/assign
 */
exports.assignProviderToJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const {providerId, status: requestedStatus} = req.body;
    const nextStatus = requestedStatus || 'accepted';

    if (!providerId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'providerId is required',
      });
    }

    const provider = await Provider.findById(providerId).lean();
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
      });
    }

    const approval = (
      provider.approvalStatus ||
      provider.status ||
      ''
    ).toLowerCase();
    if (approval && approval !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Only approved providers can be assigned',
      });
    }

    const srId = parseServiceRequestId(jobCardId);
    let jobCard;

    if (srId) {
      jobCard = await ensureJobCardFromServiceRequest(srId, provider, nextStatus);
    } else {
      jobCard = await JobCard.findById(jobCardId);
      if (!jobCard) {
        return res.status(404).json({
          success: false,
          error: 'Job card not found',
        });
      }

      const providerName =
        provider.businessName ||
        provider.name ||
        provider.displayName ||
        'Provider';
      const providerPhone = provider.phone || provider.phoneNumber || '';

      const previousProviderId = (jobCard.providerId || '').trim();
      const isChange =
        previousProviderId &&
        previousProviderId !== providerId &&
        previousProviderId !== 'unassigned' &&
        previousProviderId !== 'none';

      jobCard.providerId = providerId;
      jobCard.providerName = providerName;
      jobCard.providerPhone = providerPhone;
      if (provider.address) {
        jobCard.providerAddress = provider.address;
      }
      jobCard.status = nextStatus;
      jobCard.needsAdminAssignment = false;
      const now = new Date();
      if (nextStatus === 'accepted' && !jobCard.acceptedAt) {
        jobCard.acceptedAt = now;
      }
      jobCard.updatedAt = now;
      await jobCard.save({validateBeforeSave: false});

      const linkedSrId =
        (jobCard.serviceRequestId || '').trim() ||
        (jobCard.bookingId || '').trim();
      if (linkedSrId) {
        try {
          const srPatch = {
            providerId,
            providerName,
            providerPhone,
            status: nextStatus,
            needsAdminAssignment: false,
            updatedAt: now,
          };
          await ServiceRequest.findByIdAndUpdate(linkedSrId, {$set: srPatch});
          if (
            nextStatus === 'cancelled' ||
            nextStatus === 'canceled' ||
            nextStatus === 'completed' ||
            nextStatus === 'rejected'
          ) {
            await onServiceRequestStatusChange(
              {
                customerId: jobCard.customerId,
                serviceType: jobCard.serviceType,
                serviceTypeKey: jobCard.serviceTypeKey,
                _id: linkedSrId,
              },
              nextStatus === 'canceled' ? 'cancelled' : nextStatus,
            );
          }
          if (nextStatus === 'accepted') {
            await ServiceRequest.updateOne(
              {
                _id: linkedSrId,
                $or: [{acceptedAt: {$exists: false}}, {acceptedAt: null}],
              },
              {$set: {acceptedAt: jobCard.acceptedAt || now}},
            );
          }
        } catch (_) {
          // non-fatal — job card is source of truth for admin list
        }
      }

      const acceptedAtIso = jobCard.acceptedAt
        ? new Date(jobCard.acceptedAt).toISOString()
        : '';
      const createdAtIso = jobCard.createdAt
        ? new Date(jobCard.createdAt).toISOString()
        : '';
      const serviceType = jobCard.serviceType || 'service';
      const problemRaw = jobCard.problem ? String(jobCard.problem) : '';
      const problemShort =
        problemRaw.length > 100
          ? `${problemRaw.substring(0, 100)}...`
          : problemRaw;

      const phoneForCustomer = customerFacingProviderPhone(
        await getContactSettings(),
        {
          serviceType,
          status: nextStatus,
          hasProvider: true,
        },
        providerPhone,
      );

      const notifyBody = isChange
        ? `Your ${serviceType} job is now with ${providerName}.${
            phoneForCustomer ? ` Phone: ${phoneForCustomer}.` : ''
          }`
        : `${providerName} has been assigned to your ${serviceType} request.${
            phoneForCustomer ? ` Phone: ${phoneForCustomer}.` : ''
          }${problemShort ? ` Problem: ${problemShort}.` : ''}${
            acceptedAtIso
              ? ` Accepted: ${new Date(jobCard.acceptedAt).toLocaleString()}.`
              : ''
          }`;

      const notify = await notifyUser(jobCard.customerId, {
        title: isChange ? 'Provider updated' : 'Provider assigned',
        body: notifyBody,
        data: {
          type: isChange ? 'job_provider_changed' : 'job_assigned',
          jobCardId: String(jobCard._id),
          providerId: String(providerId),
          providerName: String(providerName || ''),
          providerPhone: String(phoneForCustomer || ''),
          serviceType: String(serviceType),
          problem: problemShort,
          status: nextStatus,
          acceptedAt: acceptedAtIso,
          createdAt: createdAtIso,
        },
      });

      try {
        await notifyBooking({
          customerId: jobCard.customerId,
          bookingData: {
            type: 'service-request-status',
            serviceRequestId: linkedSrId || String(jobCard._id),
            status: nextStatus,
            providerId,
            providerName,
            providerPhone: phoneForCustomer,
            serviceType,
            problem: problemRaw,
            acceptedAt: acceptedAtIso,
            createdAt: createdAtIso,
          },
        });
      } catch (_) {
        // non-fatal
      }

      return res.json({
        success: true,
        data: {
          ...jobCard.toObject(),
          customerNotified: Boolean(notify.sent),
          notifyReason: notify.reason || null,
          reassigned: Boolean(isChange),
        },
        message: notify.sent
          ? isChange
            ? 'Provider changed and customer notified'
            : 'Provider assigned and customer notified'
          : isChange
            ? 'Provider changed (customer push could not be sent)'
            : 'Provider assigned (customer push could not be sent)',
      });
    }

    const providerName =
      provider.businessName ||
      provider.name ||
      provider.displayName ||
      'Provider';
    const providerPhone = provider.phone || provider.phoneNumber || '';
    const acceptedAtIso = jobCard.acceptedAt
      ? new Date(jobCard.acceptedAt).toISOString()
      : '';
    const createdAtIso = jobCard.createdAt
      ? new Date(jobCard.createdAt).toISOString()
      : '';
    const serviceType = jobCard.serviceType || 'service';
    const problemRaw = jobCard.problem ? String(jobCard.problem) : '';
    const problemShort =
      problemRaw.length > 100
        ? `${problemRaw.substring(0, 100)}...`
        : problemRaw;

    const phoneForCustomer = customerFacingProviderPhone(
      await getContactSettings(),
      {
        serviceType,
        status: nextStatus,
        hasProvider: true,
      },
      providerPhone,
    );

    const notify = await notifyUser(jobCard.customerId, {
      title: 'Provider assigned',
      body: `${providerName} has been assigned to your ${serviceType} request.${
        phoneForCustomer ? ` Phone: ${phoneForCustomer}.` : ''
      }${problemShort ? ` Problem: ${problemShort}.` : ''}${
        acceptedAtIso
          ? ` Accepted: ${new Date(jobCard.acceptedAt).toLocaleString()}.`
          : ''
      }`,
      data: {
        type: 'job_assigned',
        jobCardId: String(jobCard._id),
        providerId: String(providerId),
        providerName: String(providerName || ''),
        providerPhone: String(phoneForCustomer || ''),
        serviceType: String(serviceType),
        problem: problemShort,
        status: nextStatus,
        acceptedAt: acceptedAtIso,
        createdAt: createdAtIso,
      },
    });

    try {
      await notifyBooking({
        customerId: jobCard.customerId,
        bookingData: {
          type: 'service-request-status',
          serviceRequestId: String(srId || jobCard._id),
          status: nextStatus,
          providerId,
          providerName,
          providerPhone: phoneForCustomer,
          serviceType,
          problem: problemRaw,
          acceptedAt: acceptedAtIso,
          createdAt: createdAtIso,
        },
      });
    } catch (_) {
      // non-fatal
    }

    res.json({
      success: true,
      data: {
        ...(jobCard.toObject ? jobCard.toObject() : jobCard),
        customerNotified: Boolean(notify.sent),
        notifyReason: notify.reason || null,
        reassigned: false,
      },
      message: notify.sent
        ? 'Provider assigned and customer notified'
        : 'Provider assigned (customer push could not be sent)',
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.message,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /api/admin/jobCards/:jobCardId/unassign
 * Remove provider from job; status becomes pending (unless cancelled).
 */
exports.unassignProviderFromJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;

    if (parseServiceRequestId(jobCardId)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Pending service requests have no job card to unassign yet',
      });
    }

    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    if (isUnassigned(jobCard)) {
      return res.json({
        success: true,
        data: jobCard,
        message: 'Job already has no provider',
      });
    }

    const previousName = jobCard.providerName || 'Provider';
    jobCard.providerId = '';
    jobCard.providerName = '';
    jobCard.providerPhone = '';
    jobCard.providerAddress = undefined;
    if (jobCard.status !== 'cancelled') {
      jobCard.status = 'pending';
    }
    jobCard.updatedAt = new Date();
    await jobCard.save({validateBeforeSave: false});

    const notify = await notifyUser(jobCard.customerId, {
      title: 'Provider unassigned',
      body: `${previousName} is no longer assigned to your ${jobCard.serviceType || 'service'} request.`,
      data: {
        type: 'job_unassigned',
        jobCardId: jobCard._id,
        status: jobCard.status,
      },
    });

    res.json({
      success: true,
      data: {
        ...jobCard.toObject(),
        customerNotified: Boolean(notify.sent),
      },
      message: notify.sent
        ? 'Provider unassigned and customer notified'
        : 'Provider unassigned (customer push could not be sent)',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update job card (admin)
 */
exports.updateJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;

    if (parseServiceRequestId(jobCardId)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Assign a provider first to create a job card from this request',
      });
    }

    const updates = {...req.body, updatedAt: new Date()};
    delete updates._id;
    delete updates.createdAt;

    const jobCard = await JobCard.findByIdAndUpdate(
      jobCardId,
      {$set: updates},
      {new: true, runValidators: false},
    );

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    res.json({
      success: true,
      data: jobCard,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/jobCards/:jobCardId/comments
 */
exports.addCommentToJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const {text} = req.body;

    if (parseServiceRequestId(jobCardId)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Comments require an accepted job card',
      });
    }

    const {addJobCardComment} = require('../../utils/jobCardComments');
    const jobCard = await addJobCardComment({
      jobCardId,
      role: 'admin',
      req,
      text,
    });

    res.json({
      success: true,
      data: jobCard,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.status === 404 ? 'Not Found' : 'Bad Request',
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Delete job card (admin only)
 */
exports.deleteJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;

    if (parseServiceRequestId(jobCardId)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Cannot delete a pending service request via job cards',
      });
    }

    const result = await JobCard.findByIdAndDelete(jobCardId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    res.json({
      success: true,
      message: 'Job card deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
