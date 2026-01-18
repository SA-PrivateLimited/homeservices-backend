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

    // Filters
    if (serviceType) {
      query.serviceCategories = {$in: [serviceType]};
    }
    if (city) query['location.city'] = city;
    if (state) query['location.state'] = state;
    if (isOnline === 'true') query.isOnline = true;
    if (minRating) query.rating = {$gte: parseFloat(minRating)};

    const providers = await Provider.find(query)
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
 */
exports.getProviderById = async (req, res, next) => {
  try {
    const {providerId} = req.params;
    const provider = await Provider.findById(providerId);

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
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
    const {getCollection} = require('../../config/database');
    const providerStatusCollection = getCollection('providerStatus');

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

    // Update providerStatus collection (Realtime DB equivalent)
    await providerStatusCollection.updateOne(
      {_id: req.user.uid},
      {$set: {...updateData, _id: req.user.uid}},
      {upsert: true},
    );

    res.json({
      success: true,
      message: 'Provider status updated successfully',
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
    const {approvalStatus} = req.body;

    if (!['pending', 'approved', 'rejected'].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid approval status',
      });
    }

    const provider = await Provider.findByIdAndUpdate(
      providerId,
      {
        $set: {
          approvalStatus,
          updatedAt: new Date(),
        },
      },
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
