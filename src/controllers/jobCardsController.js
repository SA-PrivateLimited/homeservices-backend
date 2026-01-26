/**
 * Job Cards Controller
 * Handles all job card operations
 */

const JobCard = require('../models/JobCard');
const User = require('../models/User');

/**
 * Get job cards with filters
 */
exports.getJobCards = async (req, res, next) => {
  try {
    const {status, customerId, providerId, limit = 50, offset = 0} = req.query;

    // Build query based on user role
    const userDoc = await User.findById(req.user.uid);
    const userRole = userDoc?.role || 'customer';

    const query = {};

    if (status) {
      query.status = status;
    }

    // Role-based filtering
    if (userRole === 'customer') {
      query.customerId = req.user.uid;
    } else if (userRole === 'provider') {
      query.providerId = req.user.uid;
    } else if (userRole === 'admin') {
      if (customerId) query.customerId = customerId;
      if (providerId) query.providerId = providerId;
    }

    const jobCards = await JobCard.find(query)
      .sort({createdAt: -1})
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    res.json({
      success: true,
      data: jobCards,
      count: jobCards.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single job card by ID
 */
exports.getJobCardById = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const jobCard = await JobCard.findById(jobCardId);

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    // Check permissions
    const userDoc = await User.findById(req.user.uid);
    const userRole = userDoc?.role || 'customer';

    const hasAccess =
      userRole === 'admin' ||
      jobCard.customerId === req.user.uid ||
      jobCard.providerId === req.user.uid;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have access to this job card',
      });
    }

    res.json({
      success: true,
      data: jobCard,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new job card (provider/admin only)
 */
exports.createJobCard = async (req, res, next) => {
  try {
    const jobCardData = {
      ...req.body,
      _id: require('mongodb').ObjectId().toString(),
      providerId: req.user.uid,
      status: 'accepted',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Validate required fields
    if (!jobCardData.customerId || !jobCardData.serviceType) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'customerId and serviceType are required',
      });
    }

    const jobCard = new JobCard(jobCardData);
    await jobCard.save();

    // Update Realtime DB equivalent if exists
    try {
      const {getCollection, connectDB} = require('../config/database');
      await connectDB(); // Ensure database is connected
      const jobCardsRTDB = await getCollection('jobCards_rtdb');
      await jobCardsRTDB.updateOne(
        {_id: jobCard._id},
        {$set: {status: jobCard.status, updatedAt: jobCard.updatedAt}},
        {upsert: true},
      );
    } catch (rtdbError) {
      console.warn('⚠️  Could not update Realtime DB equivalent:', rtdbError.message);
    }

    res.status(201).json({
      success: true,
      data: jobCard,
      message: 'Job card created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update job card status
 */
exports.updateJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const {status, taskPIN, cancellationReason, ...updateData} = req.body;

    const jobCard = await JobCard.findById(jobCardId);

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    // Check permissions
    const userDoc = await User.findById(req.user.uid);
    const userRole = userDoc?.role || 'customer';

    const isProvider = userRole === 'provider' || userRole === 'admin';
    const isCustomer = jobCard.customerId === req.user.uid;
    const isAdmin = userRole === 'admin';

    if (!isProvider && !isCustomer && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this job card',
      });
    }

    // Validate status changes
    if (status) {
      if (isCustomer && status !== 'cancelled') {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Customers can only cancel job cards',
        });
      }

      const validStatuses = ['pending', 'accepted', 'in-progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      });
    }

    // Prepare update
    const update = {
      ...updateData,
      updatedAt: new Date(),
    };

    if (status) update.status = status;
    if (taskPIN) update.taskPIN = taskPIN;
    if (cancellationReason) update.cancellationReason = cancellationReason;
    if (status === 'cancelled') update.cancelledAt = new Date();

    const updatedJobCard = await JobCard.findByIdAndUpdate(
      jobCardId,
      {$set: update},
      {new: true},
    );

    // Update Realtime DB equivalent
    try {
      const {getCollection, connectDB} = require('../config/database');
      await connectDB(); // Ensure database is connected
      const jobCardsRTDB = await getCollection('jobCards_rtdb');
      await jobCardsRTDB.updateOne(
        {_id: jobCardId},
        {$set: {status: update.status || jobCard.status, updatedAt: update.updatedAt}},
        {upsert: true},
      );
    } catch (rtdbError) {
      console.warn('⚠️  Could not update Realtime DB equivalent:', rtdbError.message);
    }

    res.json({
      success: true,
      data: updatedJobCard,
      message: 'Job card updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete job card (admin only)
 */
exports.deleteJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const result = await JobCard.findByIdAndDelete(jobCardId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    res.json({
      success: true,
      message: 'Job card deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
