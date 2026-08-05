/**
 * Job Cards Controller (Admin App)
 * Admin-specific job card operations
 */

const JobCard = require('../../models/JobCard');
const Provider = require('../../models/Provider');
const ServiceRequest = require('../../models/ServiceRequest');
const {notifyUser} = require('../../utils/notify');

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
          .sort({createdAt: -1})
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

    const [jobCards] = await Promise.all([
      JobCard.find(jobQuery).sort({createdAt: -1}).lean(),
    ]);

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

    const linked = await JobCard.find({}).select('_id bookingId').lean();
    const linkedIds = new Set(
      linked.flatMap((r) => [r._id, r.bookingId].filter(Boolean).map(String)),
    );

    const pendingSrs = await ServiceRequest.find(srQuery)
      .sort({createdAt: -1})
      .limit(500)
      .lean();

    const pendingAsJobs = pendingSrs
      .filter((sr) => !linkedIds.has(String(sr._id)))
      .map(serviceRequestToJobShape);

    const merged = [
      ...jobCards.map((j) => ({...j, source: 'jobCard'})),
      ...pendingAsJobs,
    ].sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });

    const total = merged.length;
    const page = merged.slice(off, off + lim);

    res.json({
      success: true,
      data: page,
      count: page.length,
      total,
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

    res.json({
      success: true,
      data: jobCard,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a real job card from a pending service request (used when admin assigns).
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

  const existing = await JobCard.findOne({
    $or: [{_id: srId}, {bookingId: srId}],
  });
  if (existing) {
    return existing;
  }

  const providerName =
    provider.businessName ||
    provider.name ||
    provider.displayName ||
    'Provider';
  const providerPhone = provider.phone || provider.phoneNumber || '';

  const jobCard = new JobCard({
    _id: srId,
    bookingId: srId,
    customerId: sr.customerId,
    customerName: sr.customerName,
    customerPhone: sr.customerPhone,
    customerAddress: sr.customerAddress,
    providerId: provider._id.toString(),
    providerName,
    providerPhone,
    providerAddress: provider.address || undefined,
    serviceType: sr.serviceType,
    problem: sr.problem || '',
    status: nextStatus || 'accepted',
    scheduledTime: sr.scheduledTime,
    createdAt: sr.createdAt || new Date(),
    updatedAt: new Date(),
  });
  await jobCard.save({validateBeforeSave: false});

  sr.status = nextStatus || 'accepted';
  sr.providerId = provider._id.toString();
  sr.providerName = providerName;
  sr.providerPhone = providerPhone;
  sr.updatedAt = new Date();
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
      jobCard.updatedAt = new Date();
      await jobCard.save({validateBeforeSave: false});

      const notify = await notifyUser(jobCard.customerId, {
        title: isChange ? 'Provider updated' : 'Provider assigned',
        body: isChange
          ? `Your ${jobCard.serviceType || 'service'} job is now with ${providerName}.`
          : `${providerName} has been assigned to your ${jobCard.serviceType || 'service'} request.`,
        data: {
          type: isChange ? 'job_provider_changed' : 'job_assigned',
          jobCardId: jobCard._id,
          providerId,
          status: nextStatus,
        },
      });

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

    const notify = await notifyUser(jobCard.customerId, {
      title: 'Provider assigned',
      body: `${providerName} has been assigned to your ${jobCard.serviceType || 'service'} request.`,
      data: {
        type: 'job_assigned',
        jobCardId: jobCard._id,
        providerId,
        status: nextStatus,
      },
    });

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
