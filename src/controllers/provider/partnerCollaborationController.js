/**
 * Partner-to-Partner collaboration: browse, contact, and job help requests.
 * Phone numbers are never returned on list/detail of partners or requests.
 * Contact is revealed only after an explicit contact action.
 */

const Provider = require('../../models/Provider');
const User = require('../../models/User');
const JobCard = require('../../models/JobCard');
const PartnerCollaborationRequest = require('../../models/PartnerCollaborationRequest');
const {connectDB} = require('../../config/database');
const {
  toCollaborationPartner,
  locationSnapshotFromJob,
  photoUrls,
  toPublicCollaborationRequest,
  newId,
  pickPhone,
} = require('../../utils/partnerCollaborationPublic');
const {excludeSelfProviderClause} = require('../../utils/excludeSelfProvider');
const {isServiceCustomerVisible} = require('../../utils/providerServiceAvailability');

function viewerId(req) {
  return String(req.user?.uid || req.user?.id || '');
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadApprovedProvider(id) {
  if (!id) return null;
  return Provider.findOne({
    _id: String(id),
    approvalStatus: 'approved',
    isActive: {$ne: false},
  }).lean();
}

/** Block duplicate open request to the same Partner on one job. */
async function openCollaborationWithPartner(jobCardId, targetProviderId) {
  return PartnerCollaborationRequest.findOne({
    jobCardId: String(jobCardId),
    targetProviderId: String(targetProviderId),
    status: {$in: ['pending', 'accepted']},
  }).lean();
}

/**
 * GET /api/provider/partners
 * Approved partners for collaboration. Phones stripped.
 */
exports.listCollaborationPartners = async (req, res, next) => {
  try {
    await connectDB();
    const uid = viewerId(req);
    const {
      serviceType,
      city,
      state,
      district,
      stateId,
      districtId,
      isOnline,
      limit = 50,
      offset = 0,
    } = req.query;

    const query = {
      approvalStatus: 'approved',
      isActive: {$ne: false},
      ...excludeSelfProviderClause(uid),
    };

    const andClauses = [];
    if (serviceType) {
      const s = String(serviceType).trim();
      andClauses.push({
        $or: [
          {serviceType: s},
          {serviceCategories: {$in: [s]}},
          {specialization: s},
        ],
      });
    }
    if (city) {
      query['location.city'] = new RegExp(`^${escapeRegex(city)}$`, 'i');
    }
    if (stateId) query['location.stateId'] = String(stateId).trim();
    else if (state) {
      query['location.state'] = new RegExp(
        `^${escapeRegex(String(state).trim())}$`,
        'i',
      );
    }
    if (districtId) query['location.districtId'] = String(districtId).trim();
    else if (district) {
      const d = String(district).trim();
      andClauses.push({
        $or: [
          {'location.district': new RegExp(`^${escapeRegex(d)}$`, 'i')},
          {'location.city': new RegExp(`^${escapeRegex(d)}$`, 'i')},
        ],
      });
    }
    if (isOnline === 'true') query.isOnline = true;
    if (andClauses.length === 1) Object.assign(query, andClauses[0]);
    else if (andClauses.length > 1) query.$and = andClauses;

    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const [rows, total] = await Promise.all([
      Provider.find(query).sort({isOnline: -1, rating: -1}).limit(lim).skip(off).lean(),
      Provider.countDocuments(query),
    ]);

    const needed = serviceType ? String(serviceType).trim() : '';
    const visibleRows = needed
      ? rows.filter((p) => isServiceCustomerVisible(p, needed))
      : rows;

    res.json({
      success: true,
      data: visibleRows
        .map((p) => {
          const row = toCollaborationPartner(p);
          if (row && needed) {
            const match = (row.serviceCategories || []).find(
              (s) => String(s).toLowerCase() === needed.toLowerCase(),
            );
            if (match) row.profession = match;
          }
          return row;
        })
        .filter((p) => p && p.id && (!uid || p.id !== uid)),
      count: visibleRows.length,
      total,
      limit: lim,
      offset: off,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/provider/partners/:providerId/contact
 * Returns a tel number only after the Partner explicitly chooses to contact.
 */
exports.contactCollaborationPartner = async (req, res, next) => {
  try {
    await connectDB();
    const uid = viewerId(req);
    const targetId = String(req.params.providerId || '');
    if (!uid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Please sign in to contact this Partner.',
      });
    }
    if (!targetId || targetId === uid) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'You cannot contact this Partner.',
      });
    }

    const [target, user] = await Promise.all([
      loadApprovedProvider(targetId),
      User.findById(targetId).lean(),
    ]);
    if (!target) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'This Partner is not available.',
      });
    }

    const phone = pickPhone(
      target.phone,
      target.phoneNumber,
      user?.phone,
      user?.phoneNumber,
    );
    if (!phone) {
      return res.status(404).json({
        success: false,
        error: 'Contact not available',
        message: 'Contact is not available for this Partner right now.',
      });
    }

    res.json({
      success: true,
      data: {phone},
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/provider/partnerRequests
 * Create a help request for an existing customer job.
 */
exports.createPartnerRequest = async (req, res, next) => {
  try {
    await connectDB();
    const uid = viewerId(req);
    const {
      jobCardId,
      targetProviderId,
      neededServiceType,
      extraNotes,
    } = req.body || {};

    if (!jobCardId || !targetProviderId || !neededServiceType) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Job, Partner, and needed service are required.',
      });
    }
    if (String(targetProviderId) === uid) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'You cannot send a request to yourself.',
      });
    }

    const job = await JobCard.findOne({
      _id: String(jobCardId),
      providerId: uid,
    }).lean();
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Job not found.',
      });
    }
    const jobStatus = String(job.status || '').toLowerCase();
    if (!['accepted', 'in-progress', 'pending'].includes(jobStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Help can only be requested for an active job.',
      });
    }

    const [target, me] = await Promise.all([
      loadApprovedProvider(String(targetProviderId)),
      Provider.findById(uid).lean(),
    ]);
    if (!target) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'This Partner is not available.',
      });
    }

    const open = await openCollaborationWithPartner(
      String(jobCardId),
      String(targetProviderId),
    );
    if (open) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'A request to this Partner is already open on this job.',
        data: toPublicCollaborationRequest(open),
      });
    }

    const existing = await PartnerCollaborationRequest.findOne({
      jobCardId: String(jobCardId),
      targetProviderId: String(targetProviderId),
      status: 'pending',
    }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'A request is already waiting for this Partner.',
        data: toPublicCollaborationRequest(existing),
      });
    }

    const doc = new PartnerCollaborationRequest({
      _id: newId(),
      jobCardId: String(job._id),
      serviceRequestId: job.serviceRequestId || undefined,
      requestingProviderId: uid,
      requestingProviderName: me?.name || me?.displayName || '',
      targetProviderId: String(target._id),
      targetProviderName: target.name || target.displayName || '',
      neededServiceType: String(neededServiceType).trim(),
      jobServiceType: job.serviceType,
      customerName: job.customerName,
      location: locationSnapshotFromJob(job),
      problem: job.problem || '',
      extraNotes: extraNotes ? String(extraNotes).trim().slice(0, 500) : '',
      photos: photoUrls(job.photos),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await doc.save();

    res.status(201).json({
      success: true,
      data: toPublicCollaborationRequest(doc),
    });
  } catch (error) {
    next(error);
  }
};

function redactList(rows) {
  return rows.map(toPublicCollaborationRequest);
}

/**
 * GET /api/provider/partnerRequests/outgoing
 */
exports.listOutgoingPartnerRequests = async (req, res, next) => {
  try {
    await connectDB();
    const uid = viewerId(req);
    const query = {requestingProviderId: uid};
    if (req.query.jobCardId) query.jobCardId = String(req.query.jobCardId);
    const rows = await PartnerCollaborationRequest.find(query)
      .sort({createdAt: -1})
      .limit(100)
      .lean();
    res.json({success: true, data: redactList(rows)});
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/provider/partnerRequests/incoming
 */
exports.listIncomingPartnerRequests = async (req, res, next) => {
  try {
    await connectDB();
    const uid = viewerId(req);
    const status = req.query.status ? String(req.query.status) : 'pending';
    const query = {targetProviderId: uid};
    if (status && status !== 'all') query.status = status;
    const rows = await PartnerCollaborationRequest.find(query)
      .sort({createdAt: -1})
      .limit(50)
      .lean();
    res.json({success: true, data: redactList(rows)});
  } catch (error) {
    next(error);
  }
};

async function loadOwnRequest(id, uid) {
  return PartnerCollaborationRequest.findOne({
    _id: String(id),
    $or: [{requestingProviderId: uid}, {targetProviderId: uid}],
  });
}

/**
 * GET /api/provider/partnerRequests/:id
 */
exports.getPartnerRequestById = async (req, res, next) => {
  try {
    await connectDB();
    const doc = await loadOwnRequest(req.params.id, viewerId(req));
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Request not found.',
      });
    }
    res.json({success: true, data: toPublicCollaborationRequest(doc)});
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/provider/partnerRequests/:id/accept
 */
exports.acceptPartnerRequest = async (req, res, next) => {
  try {
    await connectDB();
    const uid = viewerId(req);
    const doc = await PartnerCollaborationRequest.findOne({
      _id: String(req.params.id),
      targetProviderId: uid,
    });
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Request not found.',
      });
    }
    if (doc.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'This request has already been answered.',
        data: toPublicCollaborationRequest(doc),
      });
    }

    doc.status = 'accepted';
    doc.acceptedAt = new Date();
    doc.updatedAt = new Date();
    await doc.save();
    res.json({success: true, data: toPublicCollaborationRequest(doc)});
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/provider/partnerRequests/:id/reject
 */
exports.rejectPartnerRequest = async (req, res, next) => {
  try {
    await connectDB();
    const uid = viewerId(req);
    const doc = await PartnerCollaborationRequest.findOne({
      _id: String(req.params.id),
      targetProviderId: uid,
    });
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Request not found.',
      });
    }
    if (doc.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'This request has already been answered.',
        data: toPublicCollaborationRequest(doc),
      });
    }
    doc.status = 'rejected';
    doc.rejectedAt = new Date();
    doc.rejectionReason = req.body?.rejectionReason
      ? String(req.body.rejectionReason).slice(0, 200)
      : undefined;
    doc.updatedAt = new Date();
    await doc.save();
    res.json({success: true, data: toPublicCollaborationRequest(doc)});
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/provider/partnerRequests/:id/cancel
 * Primary Partner removes a pending or accepted supporting Partner.
 */
exports.cancelPartnerRequest = async (req, res, next) => {
  try {
    await connectDB();
    const uid = viewerId(req);
    const doc = await PartnerCollaborationRequest.findOne({
      _id: String(req.params.id),
      requestingProviderId: uid,
    });
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Request not found.',
      });
    }
    if (!['pending', 'accepted'].includes(doc.status)) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'This collaboration cannot be cancelled.',
        data: toPublicCollaborationRequest(doc),
      });
    }
    doc.status = 'cancelled';
    doc.cancelledBy = 'primary';
    doc.cancelledAt = new Date();
    doc.updatedAt = new Date();
    await doc.save();
    res.json({success: true, data: toPublicCollaborationRequest(doc)});
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/provider/partnerRequests/:id/complete
 * Assisting Partner marks their portion complete — does not complete the customer job.
 */
exports.completePartnerCollaboration = async (req, res, next) => {
  try {
    await connectDB();
    const uid = viewerId(req);
    const doc = await PartnerCollaborationRequest.findOne({
      _id: String(req.params.id),
      targetProviderId: uid,
    });
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Request not found.',
      });
    }
    if (doc.status !== 'accepted') {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Only an active collaboration can be completed.',
        data: toPublicCollaborationRequest(doc),
      });
    }
    doc.status = 'completed';
    doc.completedAt = new Date();
    doc.updatedAt = new Date();
    await doc.save();
    res.json({success: true, data: toPublicCollaborationRequest(doc)});
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/provider/partnerRequests/assisting
 * Jobs where this Partner is the supporting Partner.
 */
exports.listAssistingCollaborations = async (req, res, next) => {
  try {
    await connectDB();
    const uid = viewerId(req);
    const status = req.query.status ? String(req.query.status) : 'accepted';
    const query = {targetProviderId: uid};
    if (status && status !== 'all') query.status = status;
    const rows = await PartnerCollaborationRequest.find(query)
      .sort({updatedAt: -1})
      .limit(50)
      .lean();
    res.json({success: true, data: redactList(rows)});
  } catch (error) {
    next(error);
  }
};
