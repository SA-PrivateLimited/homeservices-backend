/**
 * Service Requests Controller (Customer App)
 * Customer-specific service request operations
 */

const ServiceRequest = require('../../models/ServiceRequest');
const Provider = require('../../models/Provider');
const JobCard = require('../../models/JobCard');
const AreaProviderDemand = require('../../models/AreaProviderDemand');
const {logDatabaseOperation, logPerformance} = require('../../middleware/logger');
const {t} = require('../../utils/translations');
const mongoose = require('mongoose');
const {notifyBooking, notifyAdminsRealtime} = require('../../realtime/socket');
const {findProvidersInArea} = require('../../utils/findProvidersInArea');
const {isShowRequestServiceEnabled} = require('../../utils/showRequestService');
const {notifyAdmins, notifyProvider} = require('../../utils/notify');
const {
  notifyMatchedProviders,
  notifyStoredProviderIds,
} = require('../../utils/notifyMatchedProviders');
const {
  partnerNewJob,
  partnerJobUpdated,
  partnerJobCancelled,
} = require('../../utils/fcmCopy');
const {
  findActiveServiceRequest,
  acquireActiveRequestLock,
  bindLockToRequest,
  releaseActiveRequestLock,
  sweepStaleActiveRequestLock,
  onServiceRequestStatusChange,
  activeRequestConflictPayload,
  normalizeServiceTypeKey,
} = require('../../services/activeServiceRequestService');
const {
  redactServiceRequestForViewer,
  sanitizeBookingNotifyPayload,
} = require('../../utils/contactAccess');
const {getContactSettings} = require('../../services/contactPolicyService');
const {normalizePhotoReferences} = require('../../utils/normalizeAssetPhotos');

function newObjectIdString() {
  return new (require('mongodb').ObjectId)().toString();
}

const LIVE_REQUEST_STATUSES = ['pending', 'accepted', 'in-progress'];
const ENDED_REQUEST_STATUSES = ['cancelled', 'rejected'];

/** Map list chips to Mongo status: now = live, cancelled includes rejected, all excludes ended. */
function customerListStatusQuery(status) {
  if (status == null || status === '') return {};
  const raw = String(status).trim().toLowerCase();
  if (raw === 'now' || raw === 'live') {
    return {status: {$in: LIVE_REQUEST_STATUSES}};
  }
  if (raw === 'cancelled' || raw === 'canceled') {
    return {status: {$in: ENDED_REQUEST_STATUSES}};
  }
  if (raw === 'all') {
    return {status: {$nin: ENDED_REQUEST_STATUSES}};
  }
  if (raw.includes(',')) {
    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length ? {status: {$in: parts}} : {};
  }
  return {status: raw};
}

/**
 * Get customer's service requests
 */
exports.getMyServiceRequests = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const {status, limit = 50, offset = 0} = req.query;
    const lang = req.lang || 'en';

    const query = {customerId: req.user.uid, ...customerListStatusQuery(status)};

    logDatabaseOperation('find', 'serviceRequests', query);

    const serviceRequests = await ServiceRequest.find(query)
      .sort({updatedAt: -1, createdAt: -1})
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const duration = Date.now() - startTime;
    logPerformance('getMyServiceRequests', duration);

    const settings = await getContactSettings();
    res.json({
      success: true,
      data: serviceRequests.map((doc) =>
        redactServiceRequestForViewer(doc, req.user, settings),
      ),
      count: serviceRequests.length,
    });
  } catch (error) {
    console.error(`❌ [getMyServiceRequests] Failed for user ${req.user.uid}:`, error.message);
    next(error);
  }
};

/**
 * Get single service request by ID (customer's own)
 */
exports.getMyServiceRequestById = async (req, res, next) => {
  try {
    const {serviceRequestId} = req.params;
    const lang = req.lang || 'en';

    logDatabaseOperation('findOne', 'serviceRequests', {_id: serviceRequestId, customerId: req.user.uid});

    // Try to find by string _id first (for Firestore-style IDs)
    let serviceRequest = await ServiceRequest.findOne({
      _id: serviceRequestId,
      customerId: req.user.uid,
    }).lean();

    // If not found and the ID looks like an ObjectId, try with ObjectId conversion
    if (!serviceRequest && mongoose.Types.ObjectId.isValid(serviceRequestId)) {
      try {
        serviceRequest = await ServiceRequest.findOne({
          _id: new mongoose.Types.ObjectId(serviceRequestId),
          customerId: req.user.uid,
        }).lean();
      } catch (objectIdError) {
        // If ObjectId conversion fails, continue with null
        console.warn('⚠️  ObjectId conversion failed:', objectIdError.message);
      }
    }

    if (!serviceRequest) {
      return res.status(404).json({
        success: false,
        error: t('serviceRequests.notFound', lang),
        message: t('serviceRequests.notFound', lang),
      });
    }

    res.json({
      success: true,
      data: redactServiceRequestForViewer(
        serviceRequest,
        req.user,
        await getContactSettings(),
      ),
    });
  } catch (error) {
    console.error(`❌ [getMyServiceRequestById] Failed for user ${req.user.uid}:`, error.message);
    next(error);
  }
};

/**
 * Create a new service request
 */
exports.createServiceRequest = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const lang = req.lang || 'en';
    const userId = req.user.uid;

    // Validate required fields
    const {customerAddress, serviceType} = req.body;

    if (!customerAddress || !customerAddress.address || !customerAddress.pincode) {
      return res.status(400).json({
        success: false,
        error: t('serviceRequests.invalidAddress', lang),
        message: t('serviceRequests.invalidAddress', lang),
      });
    }

    if (!serviceType) {
      return res.status(400).json({
        success: false,
        error: t('serviceRequests.serviceTypeRequired', lang),
        message: t('serviceRequests.serviceTypeRequired', lang),
      });
    }

    const serviceTypeKey = normalizeServiceTypeKey(serviceType);
    if (!serviceTypeKey) {
      return res.status(400).json({
        success: false,
        error: t('serviceRequests.serviceTypeRequired', lang),
        message: t('serviceRequests.serviceTypeRequired', lang),
      });
    }

    // Race-safe: claim active slot before create (one active request per service type)
    const lockResult = await acquireActiveRequestLock({
      customerId: userId,
      serviceType,
    });
    if (!lockResult.ok) {
      return res.status(409).json(
        activeRequestConflictPayload(lockResult.existing, lang, t),
      );
    }

    let keepLock = false;
    try {
    // Generate ID if not provided (Firestore-style 20 character alphanumeric)
    const generateId = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 20; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    // Optional: request directed at a specific provider (even if offline / unavailable).
    // Open requests (Services tab) omit providerId so any matching provider can accept.
    const targetedProviderId = req.body.providerId ? String(req.body.providerId).trim() : '';
    let targetedProvider = null;
    if (targetedProviderId) {
      targetedProvider = await Provider.findOne({
        _id: targetedProviderId,
        approvalStatus: 'approved',
      })
        .select(
          '_id name phone specialization specialty serviceCategories showRequestService onboardingSource',
        )
        .lean();

      if (!targetedProvider) {
        return res.status(400).json({
          success: false,
          error: t('serviceRequests.providerNotFound', lang) || 'Provider not found or not approved',
          message: t('serviceRequests.providerNotFound', lang) || 'Provider not found or not approved',
        });
      }

      if (!isShowRequestServiceEnabled(targetedProvider)) {
        return res.status(400).json({
          success: false,
          error:
            t('serviceRequests.requestServiceOff', lang) ||
            'This partner is not accepting in-app service requests yet.',
          message:
            t('serviceRequests.requestServiceOff', lang) ||
            'This partner is not accepting in-app service requests yet.',
        });
      }

      if (String(targetedProvider._id) === String(userId)) {
        return res.status(400).json({
          success: false,
          error:
            t('serviceRequests.cannotRequestSelf', lang) ||
            'You cannot request a service from your own provider profile',
          message:
            t('serviceRequests.cannotRequestSelf', lang) ||
            'You cannot request a service from your own provider profile',
        });
      }
    }

    // Create service request — always persist string _id (avoid ObjectId/string mix)
    const generatedId = String(req.body._id || req.body.id || generateId());
    const {
      providerId: _ignoreProviderId,
      providerName: _ignoreProviderName,
      providerPhone: _ignoreProviderPhone,
      providerSpecialization: _ignoreProviderSpecialization,
      providerRating: _ignoreProviderRating,
      providerImage: _ignoreProviderImage,
      providerAddress: _ignoreProviderAddress,
      providerEmail: _ignoreProviderEmail,
      requestAdminHelp: _ignoreRequestAdminHelp,
      photos: _ignorePhotos,
      ...bodyWithoutProvider
    } = req.body;

    const requestAdminHelp = req.body.requestAdminHelp === true;

    let normalizedPhotos;
    try {
      normalizedPhotos = normalizePhotoReferences(req.body.photos, req.user);
    } catch (photoErr) {
      if (photoErr.statusCode) {
        return res.status(photoErr.statusCode).json({
          success: false,
          error: photoErr.name || 'Bad Request',
          message: photoErr.message,
        });
      }
      throw photoErr;
    }

    const serviceRequestData = {
      ...bodyWithoutProvider,
      _id: generatedId,
      consultationId: generatedId, // For backward compatibility - allows lookup by either _id or consultationId
      customerId: userId,
      serviceType,
      serviceTypeKey,
      status: 'pending',
      needsAdminAssignment: requestAdminHelp,
      noProvidersInArea: requestAdminHelp,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (normalizedPhotos && normalizedPhotos.length) {
      serviceRequestData.photos = normalizedPhotos;
    } else {
      delete serviceRequestData.photos;
    }

    if (targetedProvider) {
      // Specific-provider flow: reserve for this provider until they accept/reject.
      // Phone may be stored; API redaction enforces visibility policy.
      serviceRequestData.providerId = targetedProvider._id.toString();
      serviceRequestData.providerName =
        req.body.providerName || targetedProvider.name || '';
      serviceRequestData.providerPhone =
        targetedProvider.phone || targetedProvider.phoneNumber || '';
      serviceRequestData.providerSpecialization =
        req.body.providerSpecialization ||
        targetedProvider.specialization ||
        targetedProvider.specialty ||
        '';
      if (req.body.providerRating != null) {
        serviceRequestData.providerRating = req.body.providerRating;
      }
      if (req.body.providerImage) {
        serviceRequestData.providerImage = req.body.providerImage;
      }
    }
    // else: open flow — leave provider fields unset so any provider can accept

    logDatabaseOperation('create', 'serviceRequests', {
      customerId: userId,
      serviceType,
      providerId: targetedProviderId || undefined,
    });

    const serviceRequest = new ServiceRequest(serviceRequestData);
    try {
      await serviceRequest.save();
    } catch (saveErr) {
      if (saveErr && (saveErr.code === 11000 || saveErr.code === 'E11000')) {
        const existing = await findActiveServiceRequest(userId, serviceType);
        return res.status(409).json(
          activeRequestConflictPayload(existing, lang, t),
        );
      }
      throw saveErr;
    }
    keepLock = true;
    try {
      await bindLockToRequest(userId, serviceType, serviceRequest._id);
    } catch (bindErr) {
      console.warn(
        '⚠️ [createServiceRequest] Failed to bind active lock:',
        bindErr?.message || bindErr,
      );
    }

    const duration = Date.now() - startTime;
    logPerformance('createServiceRequest', duration);

    // Notify providers (area-scoped for open requests) + admins
    try {
      let providersToNotify = [];
      let matchBy = 'targeted';

      if (targetedProvider) {
        providersToNotify = [targetedProvider];
      } else {
        const areaResult = await findProvidersInArea(serviceType, customerAddress, {
          excludeUserId: userId,
        });
        providersToNotify = areaResult.providers;
        matchBy = areaResult.matchBy;
        if (providersToNotify.length === 0) {
          console.log(
            `ℹ️ [Notify] No matching providers in area for ${serviceType} ` +
              `(district/pincode). Skipping nationwide blast.`,
          );
          // Mark for admin sourcing even if client forgot the flag
          if (!serviceRequest.needsAdminAssignment) {
            serviceRequest.needsAdminAssignment = true;
            serviceRequest.noProvidersInArea = true;
            await serviceRequest.save();
          }
        }
      }

      const needsAdmin =
        !!serviceRequest.needsAdminAssignment ||
        (!targetedProvider && providersToNotify.length === 0);

      // Create an unassigned job card so Admin Web Jobs can assign a provider
      let adminJobCardId = null;
      if (needsAdmin && !targetedProvider) {
        try {
          adminJobCardId = newObjectIdString();
          const jobCard = new JobCard({
            _id: adminJobCardId,
            providerId: '',
            providerName: '',
            customerId: userId,
            customerName:
              serviceRequest.customerName || req.body.customerName || 'Customer',
            customerPhone:
              serviceRequest.customerPhone || req.body.customerPhone || '',
            customerAddress: {
              address: customerAddress.address,
              landmark: customerAddress.landmark,
              city: customerAddress.district || customerAddress.city,
              district: customerAddress.district || customerAddress.city,
              state: customerAddress.state,
              stateId: customerAddress.stateId,
              districtId: customerAddress.districtId,
              pincode: customerAddress.pincode,
              latitude: customerAddress.latitude,
              longitude: customerAddress.longitude,
              label: customerAddress.label,
              customLabel: customerAddress.customLabel,
            },
            serviceType,
            problem: serviceRequest.problem || req.body.problem || '',
            questionnaireAnswers: serviceRequest.questionnaireAnswers,
            bookingId: serviceRequest._id.toString(),
            serviceRequestId: serviceRequest._id.toString(),
            needsAdminAssignment: true,
            status: 'unassigned',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await jobCard.save();
          console.log(
            `📋 [AdminAssist] Unassigned job card ${adminJobCardId} created for SR ${serviceRequest._id}`,
          );
        } catch (jobErr) {
          console.warn(
            '⚠️ [AdminAssist] Failed to create unassigned job card:',
            jobErr.message,
          );
        }
      }

      const bookingData = sanitizeBookingNotifyPayload(
        {
          id: serviceRequest._id.toString(),
          serviceRequestId: serviceRequest._id.toString(),
          consultationId: serviceRequest._id.toString(),
          customerId: userId,
          customerName: serviceRequest.customerName || req.body.customerName || 'Customer',
          customerPhone: serviceRequest.customerPhone || req.body.customerPhone || '',
          serviceType: serviceType,
          problem: serviceRequest.problem || req.body.problem || '',
          address: customerAddress.address,
          pincode: customerAddress.pincode,
          district: customerAddress.district || customerAddress.city || '',
          districtId: customerAddress.districtId || '',
          state: customerAddress.state || '',
          stateId: customerAddress.stateId || '',
          status: 'pending',
          createdAt: serviceRequest.createdAt,
          providerId: targetedProvider ? targetedProvider._id.toString() : undefined,
          isTargeted: !!targetedProvider,
          matchBy,
          needsAdminAssignment: needsAdmin,
          jobCardId: adminJobCardId || undefined,
        },
        {includeCustomerPhone: false},
      );

      const notifiedIds = await notifyMatchedProviders({
        providers: providersToNotify,
        bookingData,
        fcm: {
          ...partnerNewJob({
            customerName: bookingData.customerName,
            serviceType,
          }),
          data: {
            type: 'new-booking',
            serviceRequestId: bookingData.serviceRequestId,
            serviceType,
          },
        },
      });
      serviceRequest.notifiedProviderIds = notifiedIds;
      await serviceRequest.save();

      // Admin realtime + FCM — strip phones from broadcast; admin APIs keep DB phones
      const adminPayload = sanitizeBookingNotifyPayload(
        {
          serviceRequestId: bookingData.serviceRequestId,
          jobCardId: adminJobCardId || undefined,
          customerId: userId,
          customerName: bookingData.customerName,
          customerPhone: serviceRequest.customerPhone || req.body.customerPhone || '',
          serviceType,
          address: customerAddress.address,
          pincode: customerAddress.pincode,
          district: bookingData.district,
          status: needsAdmin ? 'unassigned' : 'pending',
          isTargeted: !!targetedProvider,
          providerId: bookingData.providerId,
          providersNotified: providersToNotify.length,
          matchBy,
          needsAdminAssignment: needsAdmin,
          createdAt: serviceRequest.createdAt,
        },
        {includeCustomerPhone: false},
      );

      try {
        const adminSocket = await notifyAdminsRealtime(adminPayload);
        console.log(
          `📤 [Admin] Realtime new-service-request via ${adminSocket.via} ` +
            `(providers notified: ${providersToNotify.length}, matchBy: ${matchBy}, needsAdmin: ${needsAdmin})`,
        );
      } catch (adminSockErr) {
        console.warn('⚠️ [Admin] Realtime emit failed:', adminSockErr.message);
      }

      notifyAdmins({
        title: needsAdmin
          ? 'No provider in area — assign needed'
          : 'New service request',
        body: needsAdmin
          ? `${bookingData.customerName} needs ${serviceType} at ${bookingData.pincode || bookingData.district || 'their address'} (no providers online)`
          : `${bookingData.customerName} requested ${serviceType}` +
            (bookingData.pincode ? ` (${bookingData.pincode})` : ''),
        data: {
          type: needsAdmin ? 'unmet-service-request' : 'new-service-request',
          serviceRequestId: bookingData.serviceRequestId,
          jobCardId: adminJobCardId || '',
          serviceType,
          needsAdminAssignment: needsAdmin ? 'true' : 'false',
        },
      }).catch((err) => {
        console.warn('⚠️ [Admin] FCM failed:', err?.message || err);
      });

      console.log(
        targetedProvider
          ? `📤 [Notify] Targeted request → provider ${targetedProvider._id}`
          : `📤 [Notify] Open request → ${providersToNotify.length} provider(s) ` +
              `matchBy=${matchBy} serviceType=${serviceType} needsAdmin=${needsAdmin}`,
      );
    } catch (websocketError) {
      console.warn(
        '⚠️ [Notify] Failed to emit service request notification:',
        websocketError.message,
      );
    }

    res.status(201).json({
      success: true,
      data: redactServiceRequestForViewer(
        serviceRequest.toObject(),
        req.user,
        await getContactSettings(),
      ),
      message: t('serviceRequests.created', lang),
    });
    } finally {
      if (!keepLock) {
        try {
          await releaseActiveRequestLock(userId, serviceType);
        } catch (releaseErr) {
          console.warn(
            '⚠️ [createServiceRequest] Failed to release active lock:',
            releaseErr?.message || releaseErr,
          );
        }
      }
    }
  } catch (error) {
    console.error(`❌ [createServiceRequest] Failed for user ${req.user.uid}:`, error.message);
    next(error);
  }
};

/**
 * Update service request
 */


function addressMatchSignature(address = {}) {
  return [
    String(address.pincode || '').trim(),
    String(address.districtId || '').trim(),
    String(address.district || address.city || '').trim().toLowerCase(),
    String(address.stateId || '').trim(),
    String(address.state || '').trim().toLowerCase(),
  ].join('|');
}

function clearProviderReservation(serviceRequest) {
  serviceRequest.providerId = undefined;
  serviceRequest.providerName = undefined;
  serviceRequest.providerPhone = undefined;
  serviceRequest.providerSpecialization = undefined;
  serviceRequest.providerRating = undefined;
  serviceRequest.providerImage = undefined;
  serviceRequest.declinedProviders = [];
}

/**
 * Re-run area matching after a customer edits service type / address while pending.
 */
async function rematchProvidersAfterEdit(serviceRequest, userId) {
  const serviceType = serviceRequest.serviceType;
  const customerAddress = serviceRequest.customerAddress || {};

  // Edits that affect matching always rematch openly (no stale targeted reservation).
  clearProviderReservation(serviceRequest);

  const areaResult = await findProvidersInArea(serviceType, customerAddress, {
    excludeUserId: userId,
  });
  const providersToNotify = areaResult.providers || [];
  const matchBy = areaResult.matchBy || 'area';

  const needsAdmin = providersToNotify.length === 0;
  serviceRequest.needsAdminAssignment = needsAdmin;
  serviceRequest.noProvidersInArea = needsAdmin;
  await serviceRequest.save();

  let adminJobCardId = null;
  try {
    if (needsAdmin) {
      const existing = await JobCard.findOne({
        serviceRequestId: serviceRequest._id.toString(),
        status: 'unassigned',
      });
      const addressPayload = {
        address: customerAddress.address,
        landmark: customerAddress.landmark,
        city: customerAddress.district || customerAddress.city,
        district: customerAddress.district || customerAddress.city,
        state: customerAddress.state,
        stateId: customerAddress.stateId,
        districtId: customerAddress.districtId,
        pincode: customerAddress.pincode,
        latitude: customerAddress.latitude,
        longitude: customerAddress.longitude,
        label: customerAddress.label,
        customLabel: customerAddress.customLabel,
      };
      if (existing) {
        existing.serviceType = serviceType;
        existing.problem = serviceRequest.problem || '';
        existing.questionnaireAnswers = serviceRequest.questionnaireAnswers;
        existing.customerAddress = addressPayload;
        existing.customerName = serviceRequest.customerName || existing.customerName;
        existing.customerPhone = serviceRequest.customerPhone || existing.customerPhone;
        existing.needsAdminAssignment = true;
        existing.updatedAt = new Date();
        await existing.save();
        adminJobCardId = existing._id.toString();
      } else {
        adminJobCardId = newObjectIdString();
        await new JobCard({
          _id: adminJobCardId,
          providerId: '',
          providerName: '',
          customerId: userId,
          customerName: serviceRequest.customerName || 'Customer',
          customerPhone: serviceRequest.customerPhone || '',
          customerAddress: addressPayload,
          serviceType,
          problem: serviceRequest.problem || '',
          questionnaireAnswers: serviceRequest.questionnaireAnswers,
          bookingId: serviceRequest._id.toString(),
          serviceRequestId: serviceRequest._id.toString(),
          needsAdminAssignment: true,
          status: 'unassigned',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).save();
      }
    } else {
      await JobCard.updateMany(
        {
          serviceRequestId: serviceRequest._id.toString(),
          status: 'unassigned',
        },
        {
          $set: {
            status: 'cancelled',
            cancellationReason: 'Customer updated request; providers available',
            updatedAt: new Date(),
          },
        },
      );
    }
  } catch (jobErr) {
    console.warn('⚠️ [updateServiceRequest] Job card sync failed:', jobErr.message);
  }

  const bookingData = sanitizeBookingNotifyPayload(
    {
      id: serviceRequest._id.toString(),
      serviceRequestId: serviceRequest._id.toString(),
      consultationId: serviceRequest._id.toString(),
      customerId: userId,
      customerName: serviceRequest.customerName || 'Customer',
      customerPhone: serviceRequest.customerPhone || '',
      serviceType,
      problem: serviceRequest.problem || '',
      address: customerAddress.address,
      pincode: customerAddress.pincode,
      district: customerAddress.district || customerAddress.city || '',
      districtId: customerAddress.districtId || '',
      state: customerAddress.state || '',
      stateId: customerAddress.stateId || '',
      status: 'pending',
      createdAt: serviceRequest.createdAt,
      matchBy,
      needsAdminAssignment: needsAdmin,
      jobCardId: adminJobCardId || undefined,
      updated: true,
    },
    {includeCustomerPhone: false},
  );

  const notifiedIds = await notifyMatchedProviders({
    providers: providersToNotify,
    bookingData,
    fcm: {
      ...partnerJobUpdated({
        customerName: bookingData.customerName,
        serviceType,
      }),
      data: {
        type: 'updated-booking',
        serviceRequestId: bookingData.serviceRequestId,
        serviceType,
      },
    },
  });
  serviceRequest.notifiedProviderIds = notifiedIds;
  await serviceRequest.save();

  try {
    await notifyAdminsRealtime(
      sanitizeBookingNotifyPayload(
        {
          serviceRequestId: bookingData.serviceRequestId,
          jobCardId: adminJobCardId || undefined,
          customerId: userId,
          customerName: bookingData.customerName,
          serviceType,
          address: customerAddress.address,
          pincode: customerAddress.pincode,
          district: bookingData.district,
          status: needsAdmin ? 'unassigned' : 'pending',
          providersNotified: providersToNotify.length,
          matchBy,
          needsAdminAssignment: needsAdmin,
          updated: true,
        },
        {includeCustomerPhone: false},
      ),
    );
  } catch (adminSockErr) {
    console.warn('⚠️ [updateServiceRequest] Admin realtime failed:', adminSockErr.message);
  }
}

exports.updateServiceRequest = async (req, res, next) => {
  try {
    const {serviceRequestId} = req.params;
    const lang = req.lang || 'en';
    const userId = req.user.uid;

    logDatabaseOperation('findOne', 'serviceRequests', {_id: serviceRequestId, customerId: userId});

    let serviceRequest = await ServiceRequest.findOne({
      _id: serviceRequestId,
      customerId: userId,
    });

    if (!serviceRequest && mongoose.Types.ObjectId.isValid(serviceRequestId)) {
      try {
        serviceRequest = await ServiceRequest.findOne({
          _id: new mongoose.Types.ObjectId(serviceRequestId),
          customerId: userId,
        });
      } catch (objectIdError) {
        console.warn('⚠️  ObjectId conversion failed:', objectIdError.message);
      }
    }

    if (!serviceRequest) {
      return res.status(404).json({
        success: false,
        error: t('serviceRequests.notFound', lang),
        message: t('serviceRequests.notFound', lang),
      });
    }

    // Backend is the authority: only unaccepted (pending) requests are editable.
    if (serviceRequest.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: 'REQUEST_NO_LONGER_EDITABLE',
        code: 'REQUEST_NO_LONGER_EDITABLE',
        message:
          t('serviceRequests.noLongerEditable', lang) ||
          'This request was accepted by a provider and can no longer be edited.',
        data: {
          serviceRequestId: String(serviceRequest._id),
          status: serviceRequest.status,
          providerId: serviceRequest.providerId || null,
          providerName: serviceRequest.providerName || null,
        },
      });
    }

    const previousServiceType = serviceRequest.serviceType;
    const previousServiceTypeKey =
      serviceRequest.serviceTypeKey || normalizeServiceTypeKey(previousServiceType);
    const previousAddressSig = addressMatchSignature(serviceRequest.customerAddress);

    const ALLOWED_UPDATE_FIELDS = new Set([
      'problem',
      'customerAddress',
      'photos',
      'secondaryPhone',
      'questionnaireAnswers',
      'scheduledTime',
      // serviceType is intentionally locked after create — edit UI cannot change it.
    ]);

    Object.keys(req.body || {}).forEach((key) => {
      if (!ALLOWED_UPDATE_FIELDS.has(key) || req.body[key] === undefined) {
        return;
      }
      if (key === 'photos') {
        try {
          serviceRequest.photos = normalizePhotoReferences(req.body.photos, req.user);
        } catch (photoErr) {
          photoErr.statusCode = photoErr.statusCode || 400;
          throw photoErr;
        }
        return;
      }
      serviceRequest[key] = req.body[key];
    });

    const nextServiceType = String(serviceRequest.serviceType || '').trim();
    if (!nextServiceType) {
      return res.status(400).json({
        success: false,
        error: t('serviceRequests.serviceTypeRequired', lang),
        message: t('serviceRequests.serviceTypeRequired', lang),
      });
    }

    const nextServiceTypeKey = normalizeServiceTypeKey(nextServiceType);
    serviceRequest.serviceType = nextServiceType;
    serviceRequest.serviceTypeKey = nextServiceTypeKey;

    const serviceTypeChanged = previousServiceTypeKey !== nextServiceTypeKey;
    const addressChanged =
      addressMatchSignature(serviceRequest.customerAddress) !== previousAddressSig;
    const matchingChanged = serviceTypeChanged || addressChanged;

    if (serviceTypeChanged) {
      const existing = await findActiveServiceRequest(userId, nextServiceType);
      if (existing && String(existing._id) !== String(serviceRequest._id)) {
        return res.status(409).json(activeRequestConflictPayload(existing, lang, t));
      }

      try {
        await releaseActiveRequestLock(userId, previousServiceType);
        const lock = await acquireActiveRequestLock({
          customerId: userId,
          serviceType: nextServiceType,
        });
        if (!lock.ok) {
          serviceRequest.serviceType = previousServiceType;
          serviceRequest.serviceTypeKey = previousServiceTypeKey;
          return res.status(409).json(activeRequestConflictPayload(lock.existing, lang, t));
        }
        await bindLockToRequest(userId, nextServiceType, serviceRequest._id);
      } catch (lockErr) {
        console.warn(
          '⚠️ [updateServiceRequest] Active lock migration failed:',
          lockErr?.message || lockErr,
        );
      }
    }

    if (matchingChanged) {
      clearProviderReservation(serviceRequest);
      serviceRequest.needsAdminAssignment = false;
      serviceRequest.noProvidersInArea = false;
    }

    serviceRequest.updatedAt = new Date();
    await serviceRequest.save();

    if (matchingChanged) {
      try {
        await rematchProvidersAfterEdit(serviceRequest, userId);
      } catch (rematchErr) {
        console.warn(
          '⚠️ [updateServiceRequest] Rematch failed:',
          rematchErr?.message || rematchErr,
        );
      }
    }

    const fresh = await ServiceRequest.findById(serviceRequest._id).lean();

    res.json({
      success: true,
      data: redactServiceRequestForViewer(
        fresh || serviceRequest.toObject(),
        req.user,
        await getContactSettings(),
      ),
      message: t('serviceRequests.updated', lang),
      rematched: matchingChanged,
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.name || 'Bad Request',
        message: error.message,
      });
    }
    console.error(
      `❌ [updateServiceRequest] Failed for user ${req.user.uid}:`,
      error.message,
    );
    next(error);
  }
};

exports.cancelServiceRequest = async (req, res, next) => {
  try {
    const {serviceRequestId} = req.params;
    const {cancellationReason} = req.body;
    const lang = req.lang || 'en';
    const userId = req.user.uid;

    if (!cancellationReason || cancellationReason.trim() === '') {
      return res.status(400).json({
        success: false,
        error: t('serviceRequests.cancellationReasonRequired', lang),
        message: t('serviceRequests.cancellationReasonRequired', lang),
      });
    }

    logDatabaseOperation('findOne', 'serviceRequests', {_id: serviceRequestId, customerId: userId});

    // Try to find by string _id first (for Firestore-style IDs)
    let serviceRequest = await ServiceRequest.findOne({
      _id: serviceRequestId,
      customerId: userId,
    });

    // If not found and the ID looks like an ObjectId, try with ObjectId conversion
    if (!serviceRequest && mongoose.Types.ObjectId.isValid(serviceRequestId)) {
      try {
        serviceRequest = await ServiceRequest.findOne({
          _id: new mongoose.Types.ObjectId(serviceRequestId),
          customerId: userId,
        });
      } catch (objectIdError) {
        // If ObjectId conversion fails, continue with null
        console.warn('⚠️  ObjectId conversion failed:', objectIdError.message);
      }
    }

    if (!serviceRequest) {
      return res.status(404).json({
        success: false,
        error: t('serviceRequests.notFound', lang),
        message: t('serviceRequests.notFound', lang),
      });
    }

    if (serviceRequest.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: t('serviceRequests.alreadyCancelled', lang),
        message: t('serviceRequests.alreadyCancelled', lang),
      });
    }

    if (serviceRequest.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: t('serviceRequests.cannotCancelCompleted', lang) ||
          'Cannot cancel a completed request',
        message: t('serviceRequests.cannotCancelCompleted', lang) ||
          'Cannot cancel a completed request',
      });
    }

    const trimmedReason = cancellationReason.trim();
    const assignedProviderIdBeforeCancel = serviceRequest.providerId
      ? String(serviceRequest.providerId)
      : null;
    const wasOpenRequest =
      !assignedProviderIdBeforeCancel &&
      String(serviceRequest.status || '') === 'pending';
    serviceRequest.status = 'cancelled';
    serviceRequest.cancellationReason = trimmedReason;
    serviceRequest.cancelledAt = new Date();
    serviceRequest.updatedAt = new Date();

    await serviceRequest.save();
    await onServiceRequestStatusChange(serviceRequest, 'cancelled');

    const srId = String(serviceRequest._id);
    const serviceType = serviceRequest.serviceType || 'service';
    const customerName = serviceRequest.customerName || 'Customer';
    let cancelledJobCardId = null;

    try {
      const activeJobStatuses = ['pending', 'accepted', 'in-progress', 'unassigned'];
      const linkedJobCards = await JobCard.find({
        serviceRequestId: srId,
        status: {$in: activeJobStatuses},
      });

      for (const jobCard of linkedJobCards) {
        jobCard.status = 'cancelled';
        jobCard.cancellationReason = trimmedReason;
        jobCard.updatedAt = new Date();
        await jobCard.save();
        if (
          serviceRequest.providerId &&
          String(jobCard.providerId) === String(serviceRequest.providerId)
        ) {
          cancelledJobCardId = String(jobCard._id);
        } else if (!cancelledJobCardId) {
          cancelledJobCardId = String(jobCard._id);
        }
      }
    } catch (jobErr) {
      console.warn(
        '⚠️ [cancelServiceRequest] Job card sync failed:',
        jobErr.message,
      );
    }

    const providerId = serviceRequest.providerId
      ? String(serviceRequest.providerId)
      : null;
    if (providerId) {
      const bookingData = sanitizeBookingNotifyPayload(
        {
          type: 'job-cancelled',
          status: 'cancelled',
          cancelledBy: 'customer',
          serviceRequestId: srId,
          jobCardId: cancelledJobCardId || undefined,
          customerName,
          serviceType,
          cancellationReason: trimmedReason,
          cancelledAt: serviceRequest.cancelledAt,
        },
        {includeCustomerPhone: false},
      );

      try {
        await notifyBooking({providerId, bookingData});
      } catch (notifyErr) {
        console.warn(
          `⚠️ [cancelServiceRequest] Realtime notify provider ${providerId}:`,
          notifyErr.message,
        );
      }

      try {
        await notifyProvider(providerId, {
          ...partnerJobCancelled({
            customerName,
            serviceType,
            reason: trimmedReason,
          }),
          data: {
            type: 'job-cancelled',
            status: 'cancelled',
            cancelledBy: 'customer',
            serviceRequestId: srId,
            jobCardId: cancelledJobCardId || '',
            serviceType,
            cancellationReason: trimmedReason,
          },
        });
      } catch (fcmErr) {
        console.warn(
          `⚠️ [cancelServiceRequest] FCM provider ${providerId}:`,
          fcmErr.message,
        );
      }
    }

    if (wasOpenRequest) {
      try {
        const storedIds = Array.isArray(serviceRequest.notifiedProviderIds)
          ? serviceRequest.notifiedProviderIds
          : [];
        await notifyStoredProviderIds({
          ids: storedIds,
          bookingData: sanitizeBookingNotifyPayload(
            {
              type: 'request-cancelled',
              status: 'cancelled',
              cancelledBy: 'customer',
              serviceRequestId: srId,
              customerName,
              serviceType,
              cancellationReason: trimmedReason,
              cancelledAt: serviceRequest.cancelledAt,
            },
            {includeCustomerPhone: false},
          ),
        });
      } catch (areaErr) {
        console.warn(
          '⚠️ [cancelServiceRequest] Area cancel notify:',
          areaErr.message,
        );
      }
    }

    res.json({
      success: true,
      data: redactServiceRequestForViewer(
        serviceRequest.toObject(),
        req.user,
        await getContactSettings(),
      ),
      message: t('serviceRequests.cancelled', lang),
    });
  } catch (error) {
    console.error(`❌ [cancelServiceRequest] Failed for user ${req.user.uid}:`, error.message);
    next(error);
  }
};

/**
 * POST /api/customer/serviceRequests/request-area-providers
 * Customer asks admin to onboard / assign providers for a service type in their area
 * (used when the service-type picker shows "Not available").
 */
exports.requestAreaProviders = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const serviceType = String(req.body.serviceType || '').trim();
    const customerAddress = req.body.customerAddress || {};
    const pincode = String(customerAddress.pincode || req.body.pincode || '').trim();

    if (!serviceType) {
      return res.status(400).json({
        success: false,
        error: 'serviceType is required',
        message: 'serviceType is required',
      });
    }
    if (!pincode) {
      return res.status(400).json({
        success: false,
        error: 'Service address pincode is required',
        message: 'Service address pincode is required',
      });
    }

    const customerName =
      req.body.customerName ||
      req.user.name ||
      req.user.displayName ||
      'Customer';
    const customerPhone = req.body.customerPhone || req.user.phone || '';
    const district =
      customerAddress.district ||
      customerAddress.city ||
      req.body.district ||
      '';
    const addressLine = customerAddress.address || '';
    const city = customerAddress.city || '';
    const state = customerAddress.state || '';

    // Reuse open demand for same customer + service + pincode (avoid spam)
    let demand = await AreaProviderDemand.findOne({
      customerId: userId,
      serviceType,
      pincode,
      status: {$in: ['open', 'in_progress']},
    });

    if (demand) {
      demand.customerName = customerName;
      demand.customerPhone = customerPhone;
      demand.address = addressLine;
      demand.city = city;
      demand.district = district;
      demand.state = state;
      if (customerAddress.latitude != null) {
        demand.latitude = customerAddress.latitude;
      }
      if (customerAddress.longitude != null) {
        demand.longitude = customerAddress.longitude;
      }
      await demand.save();
    } else {
      demand = await AreaProviderDemand.create({
        customerId: userId,
        customerName,
        customerPhone,
        serviceType,
        address: addressLine,
        city,
        district,
        state,
        pincode,
        latitude: customerAddress.latitude,
        longitude: customerAddress.longitude,
        status: 'open',
      });
    }

    const payload = {
      type: 'area_provider_demand',
      needsProvidersInArea: true,
      serviceRequestId: String(demand._id),
      demandId: String(demand._id),
      customerId: userId,
      customerName,
      customerPhone,
      serviceType,
      address: addressLine,
      pincode,
      district,
      status: demand.status,
      createdAt: (demand.createdAt || new Date()).toISOString(),
    };

    try {
      await notifyAdminsRealtime(payload);
    } catch (socketErr) {
      console.warn(
        '⚠️ [requestAreaProviders] Admin socket notify failed:',
        socketErr?.message || socketErr,
      );
    }

    try {
      await notifyAdmins({
        title: 'Provider needed in area',
        body: `${customerName} needs ${serviceType} providers near ${pincode}${
          district ? ` (${district})` : ''
        }`,
        data: {
          type: 'area_provider_demand',
          serviceType,
          pincode,
          district: district || '',
          customerId: userId,
          demandId: String(demand._id),
          needsProvidersInArea: 'true',
        },
      });
    } catch (fcmErr) {
      console.warn(
        '⚠️ [requestAreaProviders] Admin FCM notify failed:',
        fcmErr?.message || fcmErr,
      );
    }

    res.json({
      success: true,
      data: {
        serviceType,
        pincode,
        demandId: String(demand._id),
        status: demand.status,
      },
      message: 'Admin has been notified about provider demand in your area',
    });
  } catch (error) {
    console.error(
      `❌ [requestAreaProviders] Failed for user ${req.user?.uid}:`,
      error.message,
    );
    next(error);
  }
};


/**
 * GET /api/customer/serviceRequests/active?serviceType=
 * Returns the customer's active request for a service type (UX helper).
 */
exports.getActiveServiceRequestForType = async (req, res, next) => {
  try {
    const serviceType = String(req.query.serviceType || req.query.service || '').trim();
    if (!serviceType) {
      return res.status(400).json({
        success: false,
        error: 'serviceType is required',
        message: 'serviceType is required',
      });
    }
    const existing = await findActiveServiceRequest(req.user.uid, serviceType);
    if (!existing) {
      await sweepStaleActiveRequestLock(req.user.uid, serviceType);
      return res.json({success: true, data: null});
    }
    return res.json({
      success: true,
      data: {
        serviceRequestId: String(existing._id),
        serviceType: existing.serviceType,
        status: existing.status,
        providerId: existing.providerId || null,
        providerName: existing.providerName || null,
        createdAt: existing.createdAt || null,
      },
    });
  } catch (error) {
    next(error);
  }
};
