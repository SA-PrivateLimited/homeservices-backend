/**
 * Service Requests Controller (Customer App)
 * Customer-specific service request operations
 */

const ServiceRequest = require('../../models/ServiceRequest');
const Provider = require('../../models/Provider');
const {logDatabaseOperation, logPerformance} = require('../../middleware/logger');
const {t} = require('../../utils/translations');
const mongoose = require('mongoose');
const {notifyBooking} = require('../../realtime/socket');

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
      data: serviceRequests,
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
      data: serviceRequest,
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

    // Create service request
    const generatedId = req.body._id || req.body.id || generateId();
    const {
      providerId: _ignoreProviderId,
      providerName: _ignoreProviderName,
      providerPhone: _ignoreProviderPhone,
      providerSpecialization: _ignoreProviderSpecialization,
      providerRating: _ignoreProviderRating,
      providerImage: _ignoreProviderImage,
      providerAddress: _ignoreProviderAddress,
      providerEmail: _ignoreProviderEmail,
      ...bodyWithoutProvider
    } = req.body;

    const serviceRequestData = {
      ...bodyWithoutProvider,
      _id: generatedId,
      consultationId: generatedId, // For backward compatibility - allows lookup by either _id or consultationId
      customerId: userId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (targetedProvider) {
      // Specific-provider flow: reserve for this provider until they accept/reject
      serviceRequestData.providerId = targetedProvider._id.toString();
      serviceRequestData.providerName =
        req.body.providerName || targetedProvider.name || '';
      if (req.body.providerPhone || targetedProvider.phone) {
        serviceRequestData.providerPhone =
          req.body.providerPhone || targetedProvider.phone;
      }
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
    await serviceRequest.save();

    const duration = Date.now() - startTime;
    logPerformance('createServiceRequest', duration);

    // Emit websocket notification to providers
    try {
      let providersToNotify = [];

      if (targetedProvider) {
        // Specific-provider request: always try that provider (online or not)
        providersToNotify = [targetedProvider];
      } else {
        // Open request: notify online + available providers for this service type
        providersToNotify = await Provider.find({
          approvalStatus: 'approved',
          isOnline: true,
          isAvailable: true,
          $or: [
            {serviceCategories: serviceType},
            {specialization: serviceType},
          ],
        })
          .select('_id name')
          .lean();
      }

      // Prepare booking data for websocket
      const bookingData = {
        id: serviceRequest._id.toString(),
        serviceRequestId: serviceRequest._id.toString(),
        consultationId: serviceRequest._id.toString(), // For backward compatibility
        customerId: userId,
        customerName: serviceRequest.customerName || req.body.customerName || 'Customer',
        customerPhone: serviceRequest.customerPhone || req.body.customerPhone || '',
        serviceType: serviceType,
        problem: serviceRequest.problem || req.body.problem || '',
        address: customerAddress.address,
        pincode: customerAddress.pincode,
        status: 'pending',
        createdAt: serviceRequest.createdAt,
        providerId: targetedProvider ? targetedProvider._id.toString() : undefined,
        isTargeted: !!targetedProvider,
      };

      // Emit to selected providers (in-process Socket.IO; optional remote fallback)
      const emitPromises = providersToNotify.map(async (provider) => {
        try {
          const result = await notifyBooking({
            providerId: provider._id.toString(),
            bookingData,
          });
          if (result.ok) {
            console.log(
              `✅ [WebSocket] Notification sent to provider ${provider._id} via ${result.via}`,
            );
          } else {
            console.warn(
              `⚠️ [WebSocket] Failed to notify provider ${provider._id}:`,
              result.reason,
            );
          }
        } catch (error) {
          console.warn(
            `⚠️ [WebSocket] Failed to notify provider ${provider._id}:`,
            error.message,
          );
        }
      });

      Promise.all(emitPromises).catch((err) => {
        console.warn('⚠️ [WebSocket] Some provider notifications failed:', err.message);
      });

      console.log(
        targetedProvider
          ? `📤 [WebSocket] Emitting targeted service request to provider ${targetedProvider._id}`
          : `📤 [WebSocket] Emitting service request to ${providersToNotify.length} provider(s) for service type: ${serviceType}`,
      );
    } catch (websocketError) {
      // Don't fail the request if websocket fails
      console.warn('⚠️ [WebSocket] Failed to emit service request notification:', websocketError.message);
    }

    res.status(201).json({
      success: true,
      data: serviceRequest.toObject(),
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

    res.json({
      success: true,
      data: serviceRequest.toObject(),
      message: t('serviceRequests.cancelled', lang),
    });
  } catch (error) {
    console.error(`❌ [cancelServiceRequest] Failed for user ${req.user.uid}:`, error.message);
    next(error);
  }
};
