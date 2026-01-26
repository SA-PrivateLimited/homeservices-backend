/**
 * Providers Controller (Shared)
 * Handles provider operations for all apps
 */

const Provider = require('../../models/Provider');
const User = require('../../models/User');

/**
 * Get all providers (public, but admins can see all statuses)
 */
exports.getProviders = async (req, res, next) => {
  try {
    const {
      serviceType,
      city,
      state,
      isOnline,
      minRating,
      approvalStatus, // Allow filtering by approval status
      limit = 50,
      offset = 0,
    } = req.query;

    // Default to 'approved' for non-admin users, but allow admins to see all
    const isAdmin = req.user && req.user.role === 'admin';
    const query = {};
    
    // If approvalStatus is explicitly provided, use it
    if (approvalStatus) {
      query.approvalStatus = approvalStatus;
    } else if (!isAdmin) {
      // Non-admin users only see approved providers
      query.approvalStatus = 'approved';
    }
    // If admin and no approvalStatus filter, show all providers

    // Filters - check both serviceType (string) and serviceCategories (array) fields
    if (serviceType) {
      query.$or = [
        { serviceType: serviceType },
        { serviceCategories: { $in: [serviceType] } },
        { specialization: serviceType }
      ];
    }
    if (city) query['location.city'] = city;
    if (state) query['location.state'] = state;
    if (isOnline === 'true') query.isOnline = true;
    if (minRating) query.rating = {$gte: parseFloat(minRating)};

    const providers = await Provider.find(query)
      .select('+phoneNumber') // Ensure phoneNumber is included
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    res.json({
      success: true,
      data: providers,
      count: providers.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get provider by ID (public)
 * Also fetches real-time location from Firebase Realtime Database
 */
exports.getProviderById = async (req, res, next) => {
  try {
    const {providerId} = req.params;
    // Try to find by string _id first (for Firestore-style IDs)
    let provider = await Provider.findOne({_id: providerId});
    
    // If not found and the ID looks like an ObjectId, try with ObjectId conversion
    if (!provider && require('mongoose').Types.ObjectId.isValid(providerId)) {
      try {
        provider = await Provider.findById(providerId);
      } catch (objectIdError) {
        // Continue with null
      }
    }

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
      });
    }

    // Get provider location from Firebase Realtime Database
    let realtimeLocation = null;
    try {
      const admin = require('firebase-admin');
      if (admin.apps.length > 0) {
        const db = admin.database();
        const locationRef = db.ref(`providers/${providerId}/location`);
        const snapshot = await locationRef.once('value');
        if (snapshot.exists()) {
          realtimeLocation = snapshot.val();
        }
      }
    } catch (rtdbError) {
      console.warn('Could not fetch provider location from Realtime Database:', rtdbError.message);
      // Continue without location - not critical
    }

    // Merge real-time location with provider data
    const providerData = provider.toObject ? provider.toObject() : provider;
    if (realtimeLocation) {
      providerData.currentLocation = {
        latitude: realtimeLocation.latitude,
        longitude: realtimeLocation.longitude,
        address: realtimeLocation.address,
        city: realtimeLocation.city,
        state: realtimeLocation.state,
        pincode: realtimeLocation.pincode,
        updatedAt: realtimeLocation.updatedAt || Date.now(),
      };
    }

    res.json({
      success: true,
      data: providerData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current provider's profile (provider only)
 */
exports.getMyProfile = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.user.uid);

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider profile not found',
      });
    }

    res.json({
      success: true,
      data: provider,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update provider profile (provider only)
 */
exports.updateMyProfile = async (req, res, next) => {
  try {
    const updateData = {
      ...req.body,
      updatedAt: new Date(),
    };

    // Prevent changing approval status or role directly
    delete updateData.approvalStatus;
    delete updateData.role;

    const provider = await Provider.findByIdAndUpdate(
      req.user.uid,
      {$set: updateData},
      {new: true, runValidators: false, upsert: true},
    );

    res.json({
      success: true,
      data: provider,
      message: 'Provider profile updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update provider online/offline status (provider only)
 */
exports.updateMyStatus = async (req, res, next) => {
  try {
    const {isOnline, isAvailable, currentLocation} = req.body;
    
    // Ensure database is connected before using getCollection
    const {getCollection, connectDB} = require('../../config/database');
    
    // Ensure connection is established
    try {
      await connectDB();
    } catch (dbError) {
      console.warn('⚠️ Database connection check failed, continuing with Mongoose models only:', dbError.message);
    }
    
    let providerStatusCollection = null;
    try {
      providerStatusCollection = await getCollection('providerStatus');
    } catch (collectionError) {
      console.warn('⚠️ Could not get providerStatus collection, skipping real-time status update:', collectionError.message);
      // Continue without providerStatus collection - not critical
    }

    const updateData = {
      updatedAt: new Date(),
    };

    if (typeof isOnline === 'boolean') {
      updateData.isOnline = isOnline;
    }
    if (typeof isAvailable === 'boolean') {
      updateData.isAvailable = isAvailable;
    }
    if (currentLocation) {
      updateData.currentLocation = currentLocation;
      updateData.lastUpdated = new Date();
    }

    // Update providers collection
    await Provider.findByIdAndUpdate(
      req.user.uid,
      {$set: updateData},
      {new: true, upsert: true},
    );

    // Update providerStatus collection (Realtime DB equivalent) - only if collection is available
    if (providerStatusCollection) {
      try {
        await providerStatusCollection.updateOne(
          {_id: req.user.uid},
          {$set: {...updateData, _id: req.user.uid}},
          {upsert: true},
        );
      } catch (statusUpdateError) {
        console.warn('⚠️ Failed to update providerStatus collection (non-critical):', statusUpdateError.message);
        // Don't fail the request if providerStatus update fails
      }
    }

    res.json({
      success: true,
      message: 'Provider status updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update provider details (admin only)
 * Allows admins to update any provider field including document verification
 * Role is verified by requireRole('admin') middleware
 */
exports.updateProvider = async (req, res, next) => {
  try {
    const {providerId} = req.params;
    const adminId = req.user.uid; // Admin ID from verified auth token
    const adminRole = req.user.role; // Role verified by requireRole middleware

    // Verify admin role (double-check, though middleware already ensures this)
    if (adminRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only administrators can update provider details',
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: new Date(),
      updatedBy: adminId, // Track which admin made the update
    };

    // Prevent changing critical fields that should use specific endpoints
    delete updateData._id;
    delete updateData.createdAt;

    // Allow updating documents verification status
    // The updateData may contain documents object with verification fields
    const provider = await Provider.findByIdAndUpdate(
      providerId,
      {$set: updateData},
      {new: true, runValidators: false},
    );

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
        message: 'Provider not found',
      });
    }

    console.log(`✅ Admin ${adminId} updated provider ${providerId}`);

    res.json({
      success: true,
      data: provider,
      message: 'Provider updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve/reject provider (admin only)
 */
exports.updateProviderApproval = async (req, res, next) => {
  try {
    const {providerId} = req.params;
    const {approvalStatus, rejectionReason} = req.body;

    if (!['pending', 'approved', 'rejected'].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid approval status',
      });
    }

    const updateData = {
      approvalStatus,
      updatedAt: new Date(),
      approvedBy: req.user.uid,
      approvedAt: new Date(),
    };

    // Handle rejection reason
    if (approvalStatus === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    } else if (approvalStatus === 'approved') {
      // Clear rejection reason when approved
      updateData.rejectionReason = null;
      updateData.verified = true;
    }

    const provider = await Provider.findByIdAndUpdate(
      providerId,
      {$set: updateData},
      {new: true},
    );

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
      });
    }

    res.json({
      success: true,
      data: provider,
      message: `Provider ${approvalStatus} successfully`,
    });
  } catch (error) {
    next(error);
  }
};
