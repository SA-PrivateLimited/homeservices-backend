/**
 * Job Cards Controller (Provider App)
 * Provider-specific job card operations
 */

const JobCard = require('../../models/JobCard');

/**
 * Get provider's job cards
 */
exports.getMyJobCards = async (req, res, next) => {
  try {
    const {status, limit = 50, offset = 0} = req.query;

    const query = {providerId: req.user.uid};
    if (status) {
      query.status = status;
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
 * Get single job card by ID (provider's own)
 */
exports.getMyJobCardById = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const jobCard = await JobCard.findOne({
      _id: jobCardId,
      providerId: req.user.uid,
    });

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
 * Create new job card
 */
exports.createJobCard = async (req, res, next) => {
  try {
    const jobCardData = {
      ...req.body,
      _id: new (require('mongodb').ObjectId)().toString(),
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

    // Update Realtime DB equivalent
    try {
      const {getCollection, connectDB} = require('../../config/database');
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
 * Update job card status (provider can update status)
 */
exports.updateJobCardStatus = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const {
      status,
      taskPIN,
      pinGeneratedAt,
      cancellationReason,
      serviceAmount,
      materialsUsed,
      jobCardPdfUrl,
      completedAt,
    } = req.body;

    let jobCard = req.jobCard;
    if (!jobCard) {
      jobCard = await JobCard.findOne({
        _id: jobCardId,
        providerId: String(req.user.uid),
      });
    }

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
        message: 'Job card not found or you do not own this job card',
      });
    }

    // Ownership (middleware may already have checked)
    if (String(jobCard.providerId || '') !== String(req.user.uid)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not own this job card',
      });
    }

    const validStatuses = [
      'pending',
      'accepted',
      'in-progress',
      'completed',
      'cancelled',
    ];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const update = {
      updatedAt: new Date(),
    };

    if (status) update.status = status;
    if (taskPIN) {
      update.taskPIN = taskPIN;
      update.pinGeneratedAt = pinGeneratedAt
        ? new Date(pinGeneratedAt)
        : new Date();
    }
    if (cancellationReason) {
      update.cancellationReason = cancellationReason;
      update.cancelledAt = new Date();
    }
    if (serviceAmount !== undefined && serviceAmount !== null) {
      update.serviceAmount = Number(serviceAmount) || 0;
    }
    if (materialsUsed !== undefined) {
      update.materialsUsed = materialsUsed;
    }
    if (jobCardPdfUrl) {
      update.jobCardPdfUrl = jobCardPdfUrl;
    }
    if (completedAt || status === 'completed') {
      update.completedAt = completedAt ? new Date(completedAt) : new Date();
    }

    const updatedJobCard = await JobCard.findByIdAndUpdate(
      jobCardId,
      {$set: update},
      {new: true},
    );

    // Mirror in Mongo RTDB collection (not Firebase)
    try {
      const {getCollection, connectDB} = require('../../config/database');
      await connectDB();
      const jobCardsRTDB = await getCollection('jobCards_rtdb');
      await jobCardsRTDB.updateOne(
        {_id: jobCardId},
        {
          $set: {
            status: update.status || jobCard.status,
            updatedAt: update.updatedAt,
          },
        },
        {upsert: true},
      );
    } catch (rtdbError) {
      console.warn('⚠️  Could not update jobCards_rtdb:', rtdbError.message);
    }

    // Notify customer via Mongo FCM token when service starts
    if (status === 'in-progress' && updatedJobCard?.customerId) {
      try {
        const {notifyUser} = require('../../utils/notify');
        const pinText = update.taskPIN
          ? ` Your verification PIN is: ${update.taskPIN}.`
          : '';
        await notifyUser(updatedJobCard.customerId, {
          title: 'Service Started',
          body: `${updatedJobCard.providerName || 'Provider'} has started your ${updatedJobCard.serviceType || 'service'}.${pinText}`,
          data: {
            type: 'service',
            status: 'in-progress',
            jobCardId: String(jobCardId),
            pin: update.taskPIN || '',
          },
        });
      } catch (notifyErr) {
        console.warn('⚠️  Customer start notify failed:', notifyErr.message);
      }
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
 * POST /api/provider/jobCards/:jobCardId/comments
 */
exports.addCommentToJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const {text} = req.body;
    const {addJobCardComment} = require('../../utils/jobCardComments');
    const jobCard = await addJobCardComment({
      jobCardId,
      role: 'provider',
      req,
      text,
    });
    res.json({
      success: true,
      data: jobCard,
      message: 'Comment added',
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.message,
        message: error.message,
      });
    }
    next(error);
  }
};
