/**
 * Service Requests Controller (Customer App)
 * Customer-specific service request operations
 */

const ServiceRequest = require('../../models/ServiceRequest');
const Provider = require('../../models/Provider');
const {logDatabaseOperation, logPerformance} = require('../../middleware/logger');
const {t} = require('../../utils/translations');
const axios = require('axios');
const mongoose = require('mongoose');

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

    // Create service request
    const generatedId = req.body._id || req.body.id || generateId();
    const serviceRequestData = {
      ...req.body,
      _id: generatedId,
      consultationId: generatedId, // For backward compatibility - allows lookup by either _id or consultationId
      customerId: userId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    logDatabaseOperation('create', 'serviceRequests', {customerId: userId, serviceType});

    const serviceRequest = new ServiceRequest(serviceRequestData);
    await serviceRequest.save();

    const duration = Date.now() - startTime;
    logPerformance('createServiceRequest', duration);

    // Emit websocket notification to providers
    // Find providers for this service type and notify them
    try {
      const providers = await Provider.find({
        approvalStatus: 'approved',
        isOnline: true, // Only notify online providers
        isAvailable: true, // Only notify available providers
        $or: [
          {serviceCategories: serviceType},
          {specialization: serviceType},
        ],
      }).select('_id name').lean();

      // Get websocket server URL from environment or use Cloud Run URL
      const websocketServerUrl = process.env.WEBSOCKET_SERVER_URL || 'https://websocket-server-425944993130.us-central1.run.app';
      
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
      };

      // Emit to all providers of this service type
      const emitPromises = providers.map(async (provider) => {
        try {
          await axios.post(`${websocketServerUrl}/emit-booking`, {
            providerId: provider._id.toString(),
            bookingData: bookingData,
          }, {
            timeout: 5000, // 5 second timeout
          });
          console.log(`✅ [WebSocket] Notification sent to provider ${provider._id}`);
        } catch (error) {
          // Don't fail the request if websocket fails
          console.warn(`⚠️ [WebSocket] Failed to notify provider ${provider._id}:`, error.message);
        }
      });

      // Emit notifications in parallel (don't wait for all to complete)
      Promise.all(emitPromises).catch(err => {
        console.warn('⚠️ [WebSocket] Some provider notifications failed:', err.message);
      });

      console.log(`📤 [WebSocket] Emitting service request to ${providers.length} provider(s) for service type: ${serviceType}`);
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
