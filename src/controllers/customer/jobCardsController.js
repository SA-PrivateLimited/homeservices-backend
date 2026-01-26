/**
 * Job Cards Controller (Customer App)
 * Customer-specific job card operations
 */

const JobCard = require('../../models/JobCard');
const {logDatabaseOperation, logPerformance} = require('../../middleware/logger');
const {t} = require('../../utils/translations');

/**
 * Get customer's job cards
 */
exports.getMyJobCards = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const {status, limit = 50, offset = 0} = req.query;

    const query = {customerId: req.user.uid};
    if (status) {
      query.status = status;
    }

    logDatabaseOperation('find', 'jobCards', query);

    const jobCards = await JobCard.find(query)
      .sort({createdAt: -1})
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const duration = Date.now() - startTime;
    logPerformance('getMyJobCards', duration);

    res.json({
      success: true,
      data: jobCards,
      count: jobCards.length,
    });
  } catch (error) {
    console.error(`❌ [getMyJobCards] Failed for user ${req.user.uid}:`, error.message);
    next(error);
  }
};

/**
 * Get single job card by ID (customer's own)
 */
exports.getMyJobCardById = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const jobCard = await JobCard.findOne({
      _id: jobCardId,
      customerId: req.user.uid,
    });

    if (!jobCard) {
      const lang = req.lang || 'en';
      return res.status(404).json({
        success: false,
        error: t('jobCards.notFound', lang),
        message: t('jobCards.notFound', lang),
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
 * Cancel job card with reason
 */
exports.cancelJobCard = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const {cancellationReason} = req.body;

    const lang = req.lang || 'en';

    if (!cancellationReason || !cancellationReason.trim()) {
      return res.status(400).json({
        success: false,
        error: t('jobCards.badRequest', lang),
        message: t('jobCards.cancellationReasonRequired', lang),
      });
    }

    const jobCard = await JobCard.findOne({
      _id: jobCardId,
      customerId: req.user.uid,
    });

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: t('jobCards.notFound', lang),
        message: t('jobCards.notFound', lang),
      });
    }

    if (jobCard.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: t('jobCards.badRequest', lang),
        message: t('jobCards.alreadyCancelled', lang),
      });
    }

    if (jobCard.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: t('jobCards.badRequest', lang),
        message: t('jobCards.cannotCancelCompleted', lang),
      });
    }

    const updatedJobCard = await JobCard.findByIdAndUpdate(
      jobCardId,
      {
        $set: {
          status: 'cancelled',
          cancellationReason: cancellationReason.trim(),
          cancelledAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {new: true},
    );

    // Update Realtime DB equivalent
    try {
      const {getCollection, connectDB} = require('../../config/database');
      await connectDB(); // Ensure database is connected
      const jobCardsRTDB = await getCollection('jobCards_rtdb');
      await jobCardsRTDB.updateOne(
        {_id: jobCardId},
        {$set: {status: 'cancelled', updatedAt: new Date()}},
        {upsert: true},
      );
    } catch (rtdbError) {
      console.warn('⚠️  Could not update Realtime DB equivalent:', rtdbError.message);
    }

    res.json({
      success: true,
      data: updatedJobCard,
      message: t('jobCards.cancelledSuccessfully', lang),
    });
  } catch (error) {
    next(error);
  }
};
