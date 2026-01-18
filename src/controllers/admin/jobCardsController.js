/**
 * Job Cards Controller (Admin App)
 * Admin-specific job card operations
 */

const JobCard = require('../../models/JobCard');

/**
 * Get all job cards (admin can see all)
 */
exports.getAllJobCards = async (req, res, next) => {
  try {
    const {status, customerId, providerId, limit = 50, offset = 0} = req.query;

    const query = {};

    if (status) query.status = status;
    if (customerId) query.customerId = customerId;
    if (providerId) query.providerId = providerId;

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
 * Get single job card (admin can see any)
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

    res.json({
      success: true,
      data: jobCard,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update job card (admin can update any)
 */
exports.updateJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const updateData = {
      ...req.body,
      updatedAt: new Date(),
    };

    const jobCard = await JobCard.findByIdAndUpdate(
      jobCardId,
      {$set: updateData},
      {new: true},
    );

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    // Update Realtime DB equivalent
    try {
      const {getCollection} = require('../../config/database');
      const jobCardsRTDB = getCollection('jobCards_rtdb');
      await jobCardsRTDB.updateOne(
        {_id: jobCardId},
        {$set: {status: updateData.status || jobCard.status, updatedAt: updateData.updatedAt}},
        {upsert: true},
      );
    } catch (rtdbError) {
      console.warn('⚠️  Could not update Realtime DB equivalent:', rtdbError.message);
    }

    res.json({
      success: true,
      data: jobCard,
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
