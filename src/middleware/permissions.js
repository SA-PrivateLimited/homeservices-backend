/**
 * Permission Middleware
 * Checks resource ownership and permissions
 */

const JobCard = require('../models/JobCard');
const Review = require('../models/Review');
const User = require('../models/User');

/**
 * Check if user owns the job card (customer or provider)
 */
exports.checkJobCardOwnership = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const userDoc = await User.findById(req.user.uid);
    const userRole = userDoc?.role || 'customer';

    // Admins can access any job card
    if (userRole === 'admin') {
      return next();
    }

    const jobCard = await JobCard.findById(jobCardId);

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    // Check if user owns the job card
    const isOwner = jobCard.customerId === req.user.uid || jobCard.providerId === req.user.uid;

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have access to this job card',
      });
    }

    // Attach job card to request for use in controllers
    req.jobCard = jobCard;
    next();
  } catch (error) {
    next(error);
  }
};

async function loadCustomerJobCard(req, res) {
  const {jobCardId} = req.params;
  const jobCard = await JobCard.findById(jobCardId);

  if (!jobCard) {
    res.status(404).json({
      success: false,
      error: 'Job card not found',
    });
    return null;
  }

  if (jobCard.customerId !== req.user.uid) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You do not own this job card',
    });
    return null;
  }

  return jobCard;
}

/**
 * Check if user is the customer of the job card (any status, including history).
 */
exports.checkJobCardCustomer = async (req, res, next) => {
  try {
    const jobCard = await loadCustomerJobCard(req, res);
    if (!jobCard) return;
    req.jobCard = jobCard;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Customer may cancel only while the job is still active.
 */
exports.checkJobCardCustomerCancellable = async (req, res, next) => {
  try {
    const jobCard = await loadCustomerJobCard(req, res);
    if (!jobCard) return;
    if (jobCard.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Job card is already cancelled',
      });
    }
    if (jobCard.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Cannot cancel a completed job',
      });
    }
    req.jobCard = jobCard;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user is the provider of the job card
 */
exports.checkJobCardProvider = async (req, res, next) => {
  try {
    const {jobCardId} = req.params;
    const jobCard = await JobCard.findById(jobCardId);

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    if (jobCard.providerId !== req.user.uid && String(jobCard.providerId) !== String(req.user.uid)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not own this job card',
      });
    }

    req.jobCard = jobCard;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user owns the review
 */
exports.checkReviewOwnership = async (req, res, next) => {
  try {
    const {reviewId} = req.params;
    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Review not found',
      });
    }

    const userDoc = await User.findById(req.user.uid);
    const userRole = userDoc?.role || 'customer';

    // Admins can access any review
    if (userRole === 'admin') {
      req.review = review;
      return next();
    }

    // Users can only access their own reviews
    if (review.customerId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not own this review',
      });
    }

    req.review = review;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if job card is completed before creating review
 */
exports.checkJobCardCompleted = async (req, res, next) => {
  try {
    const {jobCardId} = req.body;
    const jobCard = await JobCard.findById(jobCardId);

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    if (jobCard.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Can only review completed jobs',
      });
    }

    if (jobCard.customerId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only review your own completed jobs',
      });
    }

    req.jobCard = jobCard;
    next();
  } catch (error) {
    next(error);
  }
};
