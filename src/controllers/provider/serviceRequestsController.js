/**
 * Service Requests Controller (Provider App)
 * Provider-specific service request operations
 */

const ServiceRequest = require('../../models/ServiceRequest');
const Provider = require('../../models/Provider');
const {logDatabaseOperation, logPerformance} = require('../../middleware/logger');
const {t} = require('../../utils/translations');
const {notifyBooking} = require('../../realtime/socket');
const {findNearbyOpenPendingForProvider} = require('../../utils/findProvidersInArea');
const {
  findServiceRequestFlexible,
  saveServiceRequestFlexible,
} = require('../../utils/findServiceRequestFlexible');
const {notifyUser, notifyAdmins} = require('../../utils/notify');
const {onServiceRequestStatusChange} = require('../../services/activeServiceRequestService');
const {
  redactServiceRequestForViewer,
  sanitizeBookingNotifyPayload,
  canAccessCustomerContact,
  pickPhone,
} = require('../../utils/contactAccess');

function serializeRequest(doc, viewer) {
  return redactServiceRequestForViewer(doc, viewer);
}

function serializeList(rows, viewer) {
  return (rows || []).map((row) => serializeRequest(row, viewer));
}

/**
 * Get pending service requests assigned to this provider
 * (includes requests directed at them while they were offline)
 */
exports.getMyPendingServiceRequests = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const providerId = req.user.uid;
    const {limit = 20} = req.query;

    const query = {
      status: 'pending',
      providerId: String(providerId),
    };

    logDatabaseOperation('find', 'serviceRequests', query);

    const serviceRequests = await ServiceRequest.find(query)
      .sort({createdAt: -1})
      .limit(parseInt(limit, 10) || 20)
      .lean();

    const duration = Date.now() - startTime;
    logPerformance('getMyPendingServiceRequests', duration);

    res.json({
      success: true,
      data: serializeList(serviceRequests, req.user),
      count: serviceRequests.length,
    });
  } catch (error) {
    console.error(
      `❌ [getMyPendingServiceRequests] Failed for provider ${req.user.uid}:`,
      error.message,
    );
    next(error);
  }
};

/**
 * Open pending requests near this provider (district / pincode + service type).
 * Used as a poll fallback when Socket.IO events are missed.
 */
exports.getNearbyPendingServiceRequests = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.user.uid).lean();
    if (!provider) {
      return res.json({success: true, data: [], count: 0});
    }
    if (!provider.isOnline) {
      return res.json({success: true, data: [], count: 0});
    }

    const serviceRequests = await findNearbyOpenPendingForProvider(provider);
    res.json({
      success: true,
      data: serializeList(serviceRequests, req.user),
      count: serviceRequests.length,
    });
  } catch (error) {
    console.error(
      `❌ [getNearbyPendingServiceRequests] Failed for provider ${req.user.uid}:`,
      error.message,
    );
    next(error);
  }
};

/**
 * Get service request by ID (assigned provider, or pending open/targeted)
 */
exports.getServiceRequestById = async (req, res, next) => {
  try {
    const {serviceRequestId} = req.params;
    const lang = req.lang || 'en';
    const providerId = String(req.user.uid);

    logDatabaseOperation('findOne', 'serviceRequests', {_id: serviceRequestId});

    const serviceRequest = await findServiceRequestFlexible(serviceRequestId);

    if (!serviceRequest) {
      return res.status(404).json({
        success: false,
        error: t('serviceRequests.notFound', lang),
        message: t('serviceRequests.notFound', lang),
      });
    }

    const assignedId = String(serviceRequest.providerId || '');
    const isAssigned = assignedId === providerId;
    const status = String(serviceRequest.status || '').toLowerCase();
    const isPendingVisible =
      status === 'pending' && (!assignedId || assignedId === providerId);

    if (!isAssigned && !isPendingVisible) {
      return res.status(404).json({
        success: false,
        error: t('serviceRequests.notFound', lang),
        message: t('serviceRequests.notFound', lang),
      });
    }

    const data = serializeRequest(serviceRequest, req.user);
    // Defense in depth: never expose customer phone unless authorized
    if (!canAccessCustomerContact(req.user, serviceRequest)) {
      delete data.customerPhone;
      delete data.secondaryPhone;
      if (data.contact) {
        data.contact.customerPhoneAvailable = false;
        data.contact.canCallCustomer = false;
      }
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(`❌ [getServiceRequestById] Failed:`, error.message);
    next(error);
  }
};

/**
 * Accept a service request (provider endpoint)
 */
exports.acceptServiceRequest = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const {serviceRequestId} = req.params;
    const lang = req.lang || 'en';
    const providerId = req.user.uid;

    console.log('📋 [ACCEPT] Request received:', {
      serviceRequestId,
      providerId,
      serviceRequestIdType: typeof serviceRequestId,
      serviceRequestIdLength: serviceRequestId?.length,
    });

    logDatabaseOperation('findOne', 'serviceRequests', {_id: serviceRequestId});

    const serviceRequest = await findServiceRequestFlexible(serviceRequestId);

    if (!serviceRequest) {
      console.error('❌ [ACCEPT] Service request not found:', serviceRequestId);
      return res.status(404).json({
        success: false,
        error: t('serviceRequests.notFound', lang),
        message: `Service request not found: ${serviceRequestId}. Please check the ID and try again.`,
      });
    }

    console.log('✅ [ACCEPT] Service request found:', {
      _id: String(serviceRequest._id),
      status: serviceRequest.status,
      currentProviderId: serviceRequest.providerId,
    });

    if (serviceRequest.providerId && serviceRequest.providerId !== providerId) {
      return res.status(409).json({
        success: false,
        error: 'Already Assigned',
        message: 'This service request has already been assigned to another provider',
      });
    }

    if (serviceRequest.status === 'accepted' && serviceRequest.providerId === providerId) {
      return res.json({
        success: true,
        data: serializeRequest(serviceRequest, req.user),
        message: 'Service request already accepted',
      });
    }

    if (serviceRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Invalid Status',
        message: `Cannot accept service request with status: ${serviceRequest.status}`,
      });
    }

    const providerDoc = await Provider.findOne({_id: providerId})
      .select('isOnline isAvailable approvalStatus phone phoneNumber name displayName')
      .lean();
    if (!providerDoc || providerDoc.approvalStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        error: 'Not Allowed',
        message: 'Only approved providers can accept service requests',
      });
    }
    if (!providerDoc.isOnline) {
      return res.status(400).json({
        success: false,
        error: 'Provider Offline',
        message: 'You must be online to accept a service request',
      });
    }

    const providerName =
      req.body.providerName ||
      providerDoc.displayName ||
      providerDoc.name ||
      req.user.name ||
      'Provider';
    const providerPhone = pickPhone(
      providerDoc.phoneNumber,
      providerDoc.phone,
      req.user.phoneNumber,
      req.user.phone,
    );
    const providerEmail = req.body.providerEmail || req.user.email || '';
    const providerSpecialization = req.body.providerSpecialization || '';
    const providerRating = req.body.providerRating || 0;
    const providerImage = req.body.providerImage || '';
    const providerAddress = req.body.providerAddress || null;

    serviceRequest.status = 'accepted';
    serviceRequest.providerId = providerId;
    serviceRequest.providerName = providerName;
    serviceRequest.providerPhone = providerPhone;
    serviceRequest.providerEmail = providerEmail;
    serviceRequest.providerSpecialization = providerSpecialization;
    serviceRequest.providerRating = providerRating;
    serviceRequest.providerImage = providerImage;
    serviceRequest.providerAddress = providerAddress;
    serviceRequest.needsAdminAssignment = false;
    const acceptedAt = new Date();
    if (!serviceRequest.acceptedAt) {
      serviceRequest.acceptedAt = acceptedAt;
    }
    serviceRequest.updatedAt = acceptedAt;

    await saveServiceRequestFlexible(serviceRequest);

    // Clear admin-assist flag on any linked unassigned job card created earlier
    try {
      const JobCard = require('../../models/JobCard');
      const srKey = String(serviceRequest._id);
      await JobCard.updateMany(
        {
          $or: [
            {_id: srKey},
            {bookingId: srKey},
            {serviceRequestId: srKey},
          ],
        },
        {
          $set: {
            providerId,
            providerName,
            providerPhone,
            providerAddress: providerAddress || undefined,
            status: 'accepted',
            needsAdminAssignment: false,
            acceptedAt: serviceRequest.acceptedAt,
            updatedAt: acceptedAt,
            ...(serviceRequest.problem
              ? {problem: serviceRequest.problem}
              : {}),
            ...(serviceRequest.serviceType
              ? {serviceType: serviceRequest.serviceType}
              : {}),
            ...(serviceRequest.scheduledTime
              ? {scheduledTime: serviceRequest.scheduledTime}
              : {}),
            ...(Array.isArray(serviceRequest.photos) &&
            serviceRequest.photos.length
              ? {photos: serviceRequest.photos}
              : {}),
          },
        },
      );
    } catch (syncErr) {
      console.warn(
        '⚠️ [acceptServiceRequest] Could not sync linked job card:',
        syncErr.message,
      );
    }

    const duration = Date.now() - startTime;
    logPerformance('acceptServiceRequest', duration);

    const acceptedAtIso = new Date(serviceRequest.acceptedAt).toISOString();
    const createdAtIso = serviceRequest.createdAt
      ? new Date(serviceRequest.createdAt).toISOString()
      : '';
    const serviceType = serviceRequest.serviceType || 'service';
    const problemRaw = serviceRequest.problem
      ? String(serviceRequest.problem)
      : '';
    const problemShort =
      problemRaw.length > 100
        ? `${problemRaw.substring(0, 100)}...`
        : problemRaw;

    try {
      await notifyBooking({
        customerId: serviceRequest.customerId,
        bookingData: sanitizeBookingNotifyPayload(
          {
            type: 'service-request-status',
            serviceRequestId: String(serviceRequest._id),
            status: 'accepted',
            providerId,
            providerName,
            providerPhone,
            serviceType,
            problem: problemRaw,
            acceptedAt: acceptedAtIso,
            createdAt: createdAtIso,
          },
          {includeProviderPhone: true},
        ),
      });
    } catch (_) {
      // non-fatal
    }

    // Push via Mongo-stored FCM tokens (server-side). No client Firestore dependency.
    try {
      const bodyParts = [
        `${providerName} has accepted your ${serviceType} request`,
      ];
      if (problemShort) bodyParts.push(`Problem: ${problemShort}`);
      bodyParts.push(`Accepted: ${new Date(serviceRequest.acceptedAt).toLocaleString()}`);
      const body = bodyParts.join('. ');

      await notifyUser(serviceRequest.customerId, {
        title: 'Service Request Accepted',
        body,
        data: {
          type: 'service',
          status: 'accepted',
          serviceRequestId: String(serviceRequest._id),
          consultationId: String(serviceRequest._id),
          providerName: String(providerName || ''),
          providerPhone: String(providerPhone || ''),
          serviceType: String(serviceType),
          problem: problemShort,
          acceptedAt: acceptedAtIso,
          createdAt: createdAtIso,
        },
      });
      await notifyAdmins({
        title: 'Service Request Accepted',
        body: `${providerName} accepted a ${serviceType} request`,
        data: {
          type: 'service',
          status: 'accepted',
          serviceRequestId: String(serviceRequest._id),
          acceptedAt: acceptedAtIso,
        },
      });
    } catch (_) {
      // non-fatal
    }

    res.json({
      success: true,
      data: serializeRequest(serviceRequest, req.user),
      message:
        t('serviceRequests.accepted', lang) ||
        'Service request accepted successfully',
    });
  } catch (error) {
    console.error(
      `❌ [acceptServiceRequest] Failed for provider ${req.user.uid}:`,
      error.message,
    );
    next(error);
  }
};

/**
 * Reject a service request (provider endpoint)
 */
exports.rejectServiceRequest = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const {serviceRequestId} = req.params;
    const {rejectionReason} = req.body;
    const lang = req.lang || 'en';
    const providerId = req.user.uid;

    logDatabaseOperation('findOne', 'serviceRequests', {_id: serviceRequestId});

    const serviceRequest = await findServiceRequestFlexible(serviceRequestId);

    if (!serviceRequest) {
      return res.status(404).json({
        success: false,
        error: t('serviceRequests.notFound', lang),
        message: t('serviceRequests.notFound', lang),
      });
    }

    if (serviceRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Invalid Status',
        message: `Cannot reject service request with status: ${serviceRequest.status}`,
      });
    }

    // Open (broadcast) requests: record decline, keep pending for others
    if (!serviceRequest.providerId) {
      const reason =
        rejectionReason || 'Provider is not ready to take this request';

      let providerDoc = null;
      try {
        providerDoc = await Provider.findById(providerId)
          .select('name displayName phoneNumber phone')
          .lean();
      } catch (_) {
        // non-fatal
      }

      const entry = {
        providerId: String(providerId),
        providerName:
          providerDoc?.displayName ||
          providerDoc?.name ||
          req.user?.name ||
          req.user?.displayName ||
          'Provider',
        providerPhone:
          providerDoc?.phoneNumber || providerDoc?.phone || '',
        reason,
        declinedAt: new Date(),
      };

      const existing = Array.isArray(serviceRequest.declinedProviders)
        ? serviceRequest.declinedProviders
        : [];
      const already = existing.some(
        d => String(d.providerId) === String(providerId),
      );
      if (!already) {
        serviceRequest.declinedProviders = [...existing, entry];
        serviceRequest.updatedAt = new Date();
        await saveServiceRequestFlexible(serviceRequest);

        const declinedProviders = (serviceRequest.declinedProviders || []).map(
          d => ({
            providerId: String(d.providerId),
            providerName: d.providerName || '',
            providerPhone: d.providerPhone || '',
            reason: d.reason || '',
            declinedAt: d.declinedAt || entry.declinedAt,
          }),
        );

        try {
          await notifyBooking({
            customerId: serviceRequest.customerId,
            bookingData: {
              type: 'service-request-status',
              serviceRequestId: String(serviceRequest._id),
              consultationId: String(serviceRequest._id),
              status: 'pending',
              declinedProviders,
              lastDeclinedProvider: {
                providerId: entry.providerId,
                providerName: entry.providerName,
              },
              message: `${entry.providerName} declined; still waiting for others`,
            },
          });
        } catch (_) {
          // non-fatal
        }
      }

      const duration = Date.now() - startTime;
      logPerformance('rejectServiceRequest', duration);

      return res.json({
        success: true,
        data: serializeRequest(serviceRequest, req.user),
        dismissed: true,
        message: 'Request declined for this provider; still available to others',
      });
    }

    if (serviceRequest.providerId !== providerId) {
      return res.status(403).json({
        success: false,
        error: 'Not Assigned',
        message: 'Only the assigned provider can reject this service request',
      });
    }

    const reason =
      rejectionReason || 'Provider is not ready to take this request';

    serviceRequest.status = 'rejected';
    serviceRequest.rejectionReason = reason;
    serviceRequest.rejectedAt = new Date();
    serviceRequest.updatedAt = new Date();

    await saveServiceRequestFlexible(serviceRequest);
    await onServiceRequestStatusChange(serviceRequest, 'rejected');

    const duration = Date.now() - startTime;
    logPerformance('rejectServiceRequest', duration);

    try {
      await notifyBooking({
        customerId: serviceRequest.customerId,
        bookingData: {
          type: 'service-request-status',
          serviceRequestId: String(serviceRequest._id),
          status: 'rejected',
          providerId,
          providerName: serviceRequest.providerName || '',
          rejectionReason: reason,
          message: 'Provider is not ready to take this request',
        },
      });
    } catch (_) {
      // non-fatal
    }

    try {
      await notifyUser(serviceRequest.customerId, {
        title: 'Provider unavailable',
        body: reason,
        data: {
          type: 'service',
          status: 'rejected',
          serviceRequestId: String(serviceRequest._id),
        },
      });
    } catch (_) {
      // non-fatal
    }

    res.json({
      success: true,
      data: serializeRequest(serviceRequest, req.user),
      message:
        t('serviceRequests.rejected', lang) ||
        'Service request rejected successfully',
    });
  } catch (error) {
    console.error(
      `❌ [rejectServiceRequest] Failed for provider ${req.user.uid}:`,
      error.message,
    );
    next(error);
  }
};
