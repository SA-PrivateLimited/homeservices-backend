/**
 * Service Requests Controller (Provider App)
 * Provider-specific service request operations
 */

const ServiceRequest = require('../../models/ServiceRequest');
const Provider = require('../../models/Provider');
const {logDatabaseOperation, logPerformance} = require('../../middleware/logger');
const {t} = require('../../utils/translations');
const mongoose = require('mongoose');
const {notifyBooking} = require('../../realtime/socket');

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
      data: serviceRequests,
      count: serviceRequests.length,
    });
  } catch (error) {
    console.error(`❌ [getMyPendingServiceRequests] Failed for provider ${req.user.uid}:`, error.message);
    next(error);
  }
};

/**
 * Get service request by ID (provider can view any service request)
 */
exports.getServiceRequestById = async (req, res, next) => {
  try {
    const {serviceRequestId} = req.params;
    const lang = req.lang || 'en';

    logDatabaseOperation('findOne', 'serviceRequests', {_id: serviceRequestId});

    // Try to find by string _id first (for Firestore-style IDs)
    let serviceRequest = await ServiceRequest.findOne({
      _id: serviceRequestId,
    }).lean();

    // If not found and the ID looks like an ObjectId, try with ObjectId conversion
    if (!serviceRequest && mongoose.Types.ObjectId.isValid(serviceRequestId)) {
      try {
        serviceRequest = await ServiceRequest.findOne({
          _id: new mongoose.Types.ObjectId(serviceRequestId),
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

    // Try multiple query strategies to find the service request
    let serviceRequest = null;
    
    // Strategy 1: Direct string _id match (most common for Firestore-style IDs)
    try {
      serviceRequest = await ServiceRequest.findOne({
        _id: serviceRequestId,
      });
      console.log('📋 [ACCEPT] Strategy 1 (string _id) result:', {
        found: !!serviceRequest,
        serviceRequestId,
      });
    } catch (queryError) {
      console.warn('⚠️ [ACCEPT] Strategy 1 query error:', queryError.message);
    }

    // Strategy 2: Try with trimmed/cleaned ID
    if (!serviceRequest && serviceRequestId) {
      try {
        const cleanedId = String(serviceRequestId).trim();
        if (cleanedId !== serviceRequestId) {
          serviceRequest = await ServiceRequest.findOne({
            _id: cleanedId,
          });
          console.log('📋 [ACCEPT] Strategy 2 (trimmed ID) result:', {
            found: !!serviceRequest,
            cleanedId,
          });
        }
      } catch (queryError) {
        console.warn('⚠️ [ACCEPT] Strategy 2 query error:', queryError.message);
      }
    }

    // Strategy 3: If ID looks like ObjectId, try ObjectId conversion
    if (!serviceRequest && mongoose.Types.ObjectId.isValid(serviceRequestId)) {
      try {
        console.log('📋 [ACCEPT] Strategy 3: Trying ObjectId conversion...');
        serviceRequest = await ServiceRequest.findOne({
          _id: new mongoose.Types.ObjectId(serviceRequestId),
        });
        console.log('📋 [ACCEPT] Strategy 3 (ObjectId) result:', {
          found: !!serviceRequest,
        });
      } catch (objectIdError) {
        console.warn('⚠️ [ACCEPT] Strategy 3 ObjectId conversion failed:', objectIdError.message);
      }
    }

    // Strategy 4: Try using getCollection for direct MongoDB query (last resort)
    if (!serviceRequest) {
      try {
        console.log('📋 [ACCEPT] Strategy 4: Trying direct MongoDB collection query...');
        const {getCollection, connectDB} = require('../../config/database');
        await connectDB();
        const serviceRequestsCollection = await getCollection('serviceRequests');
        const doc = await serviceRequestsCollection.findOne({_id: serviceRequestId});
        if (doc) {
          // Convert to Mongoose document
          serviceRequest = new ServiceRequest(doc);
          console.log('📋 [ACCEPT] Strategy 4 (direct collection) result: FOUND');
        } else {
          console.log('📋 [ACCEPT] Strategy 4 (direct collection) result: NOT FOUND');
        }
      } catch (collectionError) {
        console.warn('⚠️ [ACCEPT] Strategy 4 direct collection query failed:', collectionError.message);
      }
    }

    // Strategy 5: Search by consultationId field (for backward compatibility with Firestore IDs)
    if (!serviceRequest) {
      try {
        console.log('📋 [ACCEPT] Strategy 5: Trying consultationId field search...');
        serviceRequest = await ServiceRequest.findOne({
          consultationId: serviceRequestId,
          status: 'pending',
        });
        if (serviceRequest) {
          console.log('📋 [ACCEPT] Strategy 5 (consultationId field) result: FOUND', {
            _id: serviceRequest._id,
            consultationId: serviceRequest.consultationId,
          });
        } else {
          console.log('📋 [ACCEPT] Strategy 5 (consultationId field) result: NOT FOUND');
        }
      } catch (consultationIdError) {
        console.warn('⚠️ [ACCEPT] Strategy 5 consultationId search failed:', consultationIdError.message);
      }
    }

    // Strategy 6: Search by any matching ID field (id, bookingId) using $or
    if (!serviceRequest) {
      try {
        console.log('📋 [ACCEPT] Strategy 6: Trying $or search with multiple ID fields...');
        const {getCollection, connectDB} = require('../../config/database');
        await connectDB();
        const serviceRequestsCollection = await getCollection('serviceRequests');
        const doc = await serviceRequestsCollection.findOne({
          $or: [
            {_id: serviceRequestId},
            {consultationId: serviceRequestId},
            {id: serviceRequestId},
            {bookingId: serviceRequestId},
          ],
          status: 'pending',
        });
        if (doc) {
          serviceRequest = new ServiceRequest(doc);
          console.log('📋 [ACCEPT] Strategy 6 ($or search) result: FOUND', {
            _id: doc._id,
            consultationId: doc.consultationId,
          });
        } else {
          console.log('📋 [ACCEPT] Strategy 6 ($or search) result: NOT FOUND');
        }
      } catch (orSearchError) {
        console.warn('⚠️ [ACCEPT] Strategy 6 $or search failed:', orSearchError.message);
      }
    }

    if (!serviceRequest) {
      // Debug: Try to find any service requests to see what IDs exist
      try {
        const sampleRequests = await ServiceRequest.find({}).limit(5).select('_id status').lean();
        console.error('❌ [ACCEPT] Service request not found. Debug info:', {
          serviceRequestId,
          serviceRequestIdType: typeof serviceRequestId,
          serviceRequestIdLength: serviceRequestId?.length,
          serviceRequestIdValue: JSON.stringify(serviceRequestId),
          providerId,
          triedStringId: true,
          triedObjectId: mongoose.Types.ObjectId.isValid(serviceRequestId),
          sampleRequestIds: sampleRequests.map(r => ({_id: r._id, _idType: typeof r._id, status: r.status})),
        });
      } catch (debugError) {
        console.error('❌ [ACCEPT] Debug query failed:', debugError.message);
      }
      
      return res.status(404).json({
        success: false,
        error: t('serviceRequests.notFound', lang),
        message: `Service request not found: ${serviceRequestId}. Please check the ID and try again.`,
      });
    }

    console.log('✅ [ACCEPT] Service request found:', {
      _id: serviceRequest._id,
      status: serviceRequest.status,
      currentProviderId: serviceRequest.providerId,
    });

    // Check if already assigned to another provider
    if (serviceRequest.providerId && serviceRequest.providerId !== providerId) {
      return res.status(409).json({
        success: false,
        error: 'Already Assigned',
        message: 'This service request has already been assigned to another provider',
      });
    }

    // Check if already accepted by this provider
    if (serviceRequest.status === 'accepted' && serviceRequest.providerId === providerId) {
      return res.json({
        success: true,
        data: serviceRequest.toObject(),
        message: 'Service request already accepted',
      });
    }

    // Check if status allows acceptance
    if (serviceRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Invalid Status',
        message: `Cannot accept service request with status: ${serviceRequest.status}`,
      });
    }

    // Provider must be online to accept (offline providers see pending when they come online)
    const providerDoc = await Provider.findOne({_id: providerId}).select('isOnline isAvailable approvalStatus').lean();
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

    // Get provider details from request body or use defaults
    const providerName = req.body.providerName || req.user.name || 'Provider';
    const providerPhone = req.body.providerPhone || req.user.phoneNumber || '';
    const providerEmail = req.body.providerEmail || req.user.email || '';
    const providerSpecialization = req.body.providerSpecialization || '';
    const providerRating = req.body.providerRating || 0;
    const providerImage = req.body.providerImage || '';
    const providerAddress = req.body.providerAddress || null;

    // Update service request with provider details
    serviceRequest.status = 'accepted';
    serviceRequest.providerId = providerId;
    serviceRequest.providerName = providerName;
    serviceRequest.providerPhone = providerPhone;
    serviceRequest.providerEmail = providerEmail;
    serviceRequest.providerSpecialization = providerSpecialization;
    serviceRequest.providerRating = providerRating;
    serviceRequest.providerImage = providerImage;
    serviceRequest.providerAddress = providerAddress;
    serviceRequest.updatedAt = new Date();

    await serviceRequest.save();

    const duration = Date.now() - startTime;
    logPerformance('acceptServiceRequest', duration);

    // Best-effort: notify customer that request was accepted (ActiveService also polls)
    try {
      await notifyBooking({
        customerId: serviceRequest.customerId,
        bookingData: {
          type: 'service-request-status',
          serviceRequestId: serviceRequest._id.toString(),
          status: 'accepted',
          providerId,
          providerName,
        },
      });
    } catch (_) {
      // non-fatal
    }

    res.json({
      success: true,
      data: serviceRequest.toObject(),
      message: t('serviceRequests.accepted', lang) || 'Service request accepted successfully',
    });
  } catch (error) {
    console.error(`❌ [acceptServiceRequest] Failed for provider ${req.user.uid}:`, error.message);
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

    // Try to find by string _id first (for Firestore-style IDs)
    let serviceRequest = await ServiceRequest.findOne({
      _id: serviceRequestId,
    });

    // If not found and the ID looks like an ObjectId, try with ObjectId conversion
    if (!serviceRequest && mongoose.Types.ObjectId.isValid(serviceRequestId)) {
      try {
        serviceRequest = await ServiceRequest.findOne({
          _id: new mongoose.Types.ObjectId(serviceRequestId),
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

    // Check if status allows rejection
    if (serviceRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Invalid Status',
        message: `Cannot reject service request with status: ${serviceRequest.status}`,
      });
    }

    // Open (broadcast) requests: declining only dismisses for this provider — do not cancel for the customer
    if (!serviceRequest.providerId) {
      return res.json({
        success: true,
        data: serviceRequest.toObject(),
        dismissed: true,
        message: 'Request declined for this provider; still available to others',
      });
    }

    // Specific-provider requests: only the assigned provider can reject
    if (serviceRequest.providerId !== providerId) {
      return res.status(403).json({
        success: false,
        error: 'Not Assigned',
        message: 'Only the assigned provider can reject this service request',
      });
    }

    const reason =
      rejectionReason ||
      'Provider is not ready to take this request';

    serviceRequest.status = 'rejected';
    serviceRequest.rejectionReason = reason;
    serviceRequest.rejectedAt = new Date();
    serviceRequest.updatedAt = new Date();

    await serviceRequest.save();

    const duration = Date.now() - startTime;
    logPerformance('rejectServiceRequest', duration);

    // Best-effort notify customer (ActiveService also polls status)
    try {
      await notifyBooking({
        customerId: serviceRequest.customerId,
        bookingData: {
          type: 'service-request-status',
          serviceRequestId: serviceRequest._id.toString(),
          status: 'rejected',
          providerId,
          providerName: serviceRequest.providerName || '',
          rejectionReason: reason,
          message: 'Provider is not ready to take this request',
        },
      });
    } catch (_) {
      // non-fatal — customer UI polls status
    }

    res.json({
      success: true,
      data: serviceRequest.toObject(),
      message: t('serviceRequests.rejected', lang) || 'Service request rejected successfully',
    });
  } catch (error) {
    console.error(`❌ [rejectServiceRequest] Failed for provider ${req.user.uid}:`, error.message);
    next(error);
  }
};
