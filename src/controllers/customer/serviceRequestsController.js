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
const {notifyAdmins, notifyProvider} = require('../../utils/notify');
const {
  findActiveServiceRequest,
  acquireActiveRequestLock,
  bindLockToRequest,
  releaseActiveRequestLock,
  onServiceRequestStatusChange,
  activeRequestConflictPayload,
  normalizeServiceTypeKey,
} = require('../../services/activeServiceRequestService');
const {
  redactServiceRequestForViewer,
  sanitizeBookingNotifyPayload,
} = require('../../utils/contactAccess');
const {normalizePhotoReferences} = require('../../utils/normalizeAssetPhotos');

function newObjectIdString() {
  return new (require('mongodb').ObjectId)().toString();
}

/**
 * Get customer's service requests
 */
exports.getMyServiceRequests = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const {status, limit = 50, offset = 0} = req.query;
    const lang = req.lang || 'en';

    const query = {customerId: req.user.uid};
    if (status) {
      query.status = status;
    }

    logDatabaseOperation('find', 'serviceRequests', query);

    const serviceRequests = await ServiceRequest.find(query)
      .sort({createdAt: -1})
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const duration = Date.now() - startTime;
    logPerformance('getMyServiceRequests', duration);

    res.json({
      success: true,
      data: serviceRequests.map((doc) =>
        redactServiceRequestForViewer(doc, req.user),
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
      data: redactServiceRequestForViewer(serviceRequest, req.user),
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
        .select('_id name phone specialization specialty serviceCategories')
        .lean();

      if (!targetedProvider) {
        return res.status(400).json({
          success: false,
          error: t('serviceRequests.providerNotFound', lang) || 'Provider not found or not approved',
          message: t('serviceRequests.providerNotFound', lang) || 'Provider not found or not approved',
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
      // Do NOT set providerPhone here — revealed only after accept.
      serviceRequestData.providerId = targetedProvider._id.toString();
      serviceRequestData.providerName =
        req.body.providerName || targetedProvider.name || '';
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
      await bindLockToRequest(userId, serviceType, serviceRequest._id);
    } catch (saveErr) {
      await releaseActiveRequestLock(userId, serviceType);
      if (saveErr && (saveErr.code === 11000 || saveErr.code === 'E11000')) {
        const existing = await findActiveServiceRequest(userId, serviceType);
        return res.status(409).json(
          activeRequestConflictPayload(existing, lang, t),
        );
      }
      throw saveErr;
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
        const areaResult = await findProvidersInArea(serviceType, customerAddress);
        providersToNotify = areaResult.providers;
        matchBy = areaResult.matchBy;
        if (providersToNotify.length === 0) {
          console.log(
            `ℹ️ [Notify] No online providers in area for ${serviceType} ` +
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

      const emitPromises = providersToNotify.map(async (provider) => {
        const providerId = provider._id.toString();
        try {
          const result = await notifyBooking({
            providerId,
            bookingData,
          });
          if (result.ok) {
            console.log(
              `✅ [WebSocket] Notification sent to provider ${providerId} via ${result.via}`,
            );
          } else {
            console.warn(
              `⚠️ [WebSocket] Failed to notify provider ${providerId}:`,
              result.reason,
            );
          }
        } catch (error) {
          console.warn(
            `⚠️ [WebSocket] Failed to notify provider ${providerId}:`,
            error.message,
          );
        }

        // FCM fallback when provider app is backgrounded / socket down
        try {
          await notifyProvider(providerId, {
            title: 'New service request',
            body: `${bookingData.customerName} needs ${serviceType} nearby`,
            data: {
              type: 'new-booking',
              serviceRequestId: bookingData.serviceRequestId,
              serviceType,
            },
          });
        } catch (fcmErr) {
          console.warn(
            `⚠️ [FCM] Provider ${providerId}:`,
            fcmErr.message,
          );
        }
      });

      Promise.all(emitPromises).catch((err) => {
        console.warn('⚠️ [Notify] Some provider notifications failed:', err.message);
      });

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
      data: redactServiceRequestForViewer(serviceRequest.toObject(), req.user),
      message: t('serviceRequests.created', lang),
    });
  } catch (error) {
    console.error(`❌ [createServiceRequest] Failed for user ${req.user.uid}:`, error.message);
    next(error);
  }
};

/**
 * Update service request
 */
exports.updateServiceRequest = async (req, res, next) => {
  try {
    const {serviceRequestId} = req.params;
    const lang = req.lang || 'en';
    const userId = req.user.uid;

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

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        serviceRequest[key] = req.body[key];
      }
    });

    serviceRequest.updatedAt = new Date();

    await serviceRequest.save();

    res.json({
      success: true,
      data: serviceRequest.toObject(),
      message: t('serviceRequests.updated', lang),
    });
  } catch (error) {
    console.error(`❌ [updateServiceRequest] Failed for user ${req.user.uid}:`, error.message);
    next(error);
  }
};

/**
 * Cancel service request with reason
 */
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

    serviceRequest.status = 'cancelled';
    serviceRequest.cancellationReason = cancellationReason.trim();
    serviceRequest.cancelledAt = new Date();
    serviceRequest.updatedAt = new Date();

    await serviceRequest.save();
    await onServiceRequestStatusChange(serviceRequest, 'cancelled');

    res.json({
      success: true,
      data: redactServiceRequestForViewer(serviceRequest.toObject(), req.user),
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
