/**
 * Authorized contact endpoints — reveal phone only after job accept.
 */

const ServiceRequest = require('../models/ServiceRequest');
const JobCard = require('../models/JobCard');
const {
  canAccessProviderContact,
  canAccessCustomerContact,
  contactDeniedMessage,
  statusAllowsContact,
  pickPhone,
  viewerId,
} = require('../utils/contactAccess');
const {
  findServiceRequestFlexible,
} = require('../utils/findServiceRequestFlexible');

async function loadServiceRequestForViewer(id, viewer) {
  let sr = null;
  try {
    sr = await findServiceRequestFlexible(id);
  } catch {
    sr = null;
  }
  if (!sr) {
    sr = await ServiceRequest.findById(id).lean();
  } else if (sr.toObject) {
    sr = sr.toObject();
  }
  if (!sr) return null;

  const uid = viewerId(viewer);
  const role = String(viewer?.role || '');
  if (role === 'admin') return sr;
  if (role === 'customer' && String(sr.customerId) === uid) return sr;
  if (role === 'provider' && String(sr.providerId || '') === uid) return sr;
  // Provider may look up a pending open request they are about to accept —
  // still do not return phones via this contact endpoint until assigned+accepted.
  if (role === 'provider' && (!sr.providerId || sr.status === 'pending')) {
    return sr;
  }
  return null;
}

async function loadJobCardForViewer(id, viewer) {
  const job = await JobCard.findById(id).lean();
  if (!job) return null;
  const uid = viewerId(viewer);
  const role = String(viewer?.role || '');
  if (role === 'admin') return job;
  if (role === 'customer' && String(job.customerId) === uid) return job;
  if (role === 'provider' && String(job.providerId || '') === uid) return job;
  return null;
}

function deny(res, code, status = 403) {
  const body = contactDeniedMessage(code);
  return res.status(status).json({success: false, ...body});
}

/**
 * GET customer → provider contact for a service request
 */
exports.getProviderContactForServiceRequest = async (req, res, next) => {
  try {
    const {serviceRequestId} = req.params;
    const sr = await loadServiceRequestForViewer(serviceRequestId, req.user);
    if (!sr) return deny(res, 'not_found', 404);

    if (!canAccessProviderContact(req.user, sr)) {
      if (!statusAllowsContact(sr.status)) {
        const blocked = ['cancelled', 'canceled', 'rejected'].includes(
          String(sr.status || '').toLowerCase(),
        );
        return deny(res, blocked ? 'blocked' : 'pending');
      }
      return deny(res, 'blocked');
    }

    const phone = pickPhone(sr.providerPhone);
    if (!phone) {
      return deny(res, 'blocked');
    }

    return res.json({
      success: true,
      data: {
        phone,
        name: sr.providerName || '',
        serviceRequestId: String(sr._id),
        status: sr.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET provider → customer contact for a service request
 */
exports.getCustomerContactForServiceRequest = async (req, res, next) => {
  try {
    const {serviceRequestId} = req.params;
    const sr = await loadServiceRequestForViewer(serviceRequestId, req.user);
    if (!sr) return deny(res, 'not_found', 404);

    if (!canAccessCustomerContact(req.user, sr)) {
      if (!statusAllowsContact(sr.status)) {
        const blocked = ['cancelled', 'canceled', 'rejected'].includes(
          String(sr.status || '').toLowerCase(),
        );
        return deny(res, blocked ? 'blocked' : 'pending');
      }
      return deny(res, 'blocked');
    }

    const phone = pickPhone(sr.customerPhone, sr.secondaryPhone);
    if (!phone) {
      return deny(res, 'blocked');
    }

    return res.json({
      success: true,
      data: {
        phone,
        name: sr.customerName || '',
        serviceRequestId: String(sr._id),
        status: sr.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET customer → provider contact for a job card
 */
exports.getProviderContactForJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const job = await loadJobCardForViewer(jobCardId, req.user);
    if (!job) return deny(res, 'not_found', 404);

    if (!canAccessProviderContact(req.user, job)) {
      if (!statusAllowsContact(job.status)) {
        const blocked = ['cancelled', 'canceled', 'rejected'].includes(
          String(job.status || '').toLowerCase(),
        );
        return deny(res, blocked ? 'blocked' : 'pending');
      }
      return deny(res, 'blocked');
    }

    const phone = pickPhone(job.providerPhone);
    if (!phone) return deny(res, 'blocked');

    return res.json({
      success: true,
      data: {
        phone,
        name: job.providerName || '',
        jobCardId: String(job._id),
        status: job.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET provider → customer contact for a job card
 */
exports.getCustomerContactForJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const job = await loadJobCardForViewer(jobCardId, req.user);
    if (!job) return deny(res, 'not_found', 404);

    if (!canAccessCustomerContact(req.user, job)) {
      if (!statusAllowsContact(job.status)) {
        const blocked = ['cancelled', 'canceled', 'rejected'].includes(
          String(job.status || '').toLowerCase(),
        );
        return deny(res, blocked ? 'blocked' : 'pending');
      }
      return deny(res, 'blocked');
    }

    const phone = pickPhone(job.customerPhone);
    if (!phone) return deny(res, 'blocked');

    return res.json({
      success: true,
      data: {
        phone,
        name: job.customerName || '',
        jobCardId: String(job._id),
        status: job.status,
      },
    });
  } catch (error) {
    next(error);
  }
};
