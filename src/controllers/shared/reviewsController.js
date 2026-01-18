/**
 * Reviews Controller (Shared)
 * Handles review operations for all apps
 */

const Review = require('../../models/Review');
const JobCard = require('../../models/JobCard');
const Provider = require('../../models/Provider');
const User = require('../../models/User');

/**
 * Get reviews with optional filters (public)
 */
exports.getReviews = async (req, res, next) => {
  try {
    const {providerId, customerId, limit = 50, offset = 0} = req.query;

    const query = {};
    if (providerId) query.providerId = providerId;
    if (customerId) query.customerId = customerId;

    const reviews = await Review.find(query)
      .sort({createdAt: -1})
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    res.json({
      success: true,
      data: reviews,
      count: reviews.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single review
 */
exports.getReviewById = async (req, res, next) => {
  try {
    const {reviewId} = req.params;
    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Review not found',
      });
    }

    res.json({
      success: true,
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create review (customer only)
 */
exports.createReview = async (req, res, next) => {
  try {
    const {providerId, jobCardId, rating, comment} = req.body;

    if (!providerId || !jobCardId || !rating) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'providerId, jobCardId, and rating are required',
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Rating must be between 1 and 5',
      });
    }

    // Check if job card exists and belongs to customer
    const jobCard = await JobCard.findById(jobCardId);

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found',
      });
    }

    if (jobCard.customerId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Job card does not belong to you',
      });
    }

    if (jobCard.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Can only review completed jobs',
      });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({
      jobCardId,
      customerId: req.user.uid,
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Review already exists for this job card',
      });
    }

    // Get customer name
    const customer = await User.findById(req.user.uid);
    const provider = await Provider.findById(providerId);

    const reviewData = {
      _id: require('mongodb').ObjectId().toString(),
      providerId,
      jobCardId,
      customerId: req.user.uid,
      customerName: customer?.displayName || customer?.name || 'Customer',
      providerName: provider?.displayName || provider?.name || 'Provider',
      serviceType: jobCard.serviceType || 'Service',
      rating,
      comment: comment || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const review = new Review(reviewData);
    await review.save();

    // Update provider's rating
    const providerReviews = await Review.find({providerId}).lean();
    const averageRating = providerReviews.reduce((sum, r) => sum + r.rating, 0) / providerReviews.length;

    await Provider.findByIdAndUpdate(providerId, {
      $set: {
        rating: averageRating,
        totalReviews: providerReviews.length,
        updatedAt: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      data: review,
      message: 'Review created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update review (customer can only update comment, not rating)
 */
exports.updateReview = async (req, res, next) => {
  try {
    const {reviewId} = req.params;
    const {comment} = req.body;

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Review not found',
      });
    }

    if (review.customerId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only update your own reviews',
      });
    }

    // Customers cannot change rating, only comment
    const updatedReview = await Review.findByIdAndUpdate(
      reviewId,
      {
        $set: {
          comment: comment || review.comment,
          updatedAt: new Date(),
        },
      },
      {new: true},
    );

    res.json({
      success: true,
      data: updatedReview,
      message: 'Review updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete review (admin or customer)
 */
exports.deleteReview = async (req, res, next) => {
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

    // Only admin or review owner can delete
    if (userRole !== 'admin' && review.customerId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
      });
    }

    await Review.findByIdAndDelete(reviewId);

    res.json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
