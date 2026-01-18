/**
 * Validation Middleware
 * Validates request body, params, and query parameters
 */

/**
 * Validate job card creation
 */
exports.validateJobCard = (req, res, next) => {
  const {customerId, serviceType} = req.body;

  if (!customerId || !serviceType) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'customerId and serviceType are required',
    });
  }

  next();
};

/**
 * Validate job card status update
 */
exports.validateJobCardStatus = (req, res, next) => {
  const {status} = req.body;

  if (status) {
    const validStatuses = ['pending', 'accepted', 'in-progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }
  }

  next();
};

/**
 * Validate review creation
 */
exports.validateReview = (req, res, next) => {
  const {providerId, jobCardId, rating} = req.body;

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

  next();
};

/**
 * Validate cancellation reason
 */
exports.validateCancellationReason = (req, res, next) => {
  const {cancellationReason} = req.body;

  if (!cancellationReason || !cancellationReason.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Cancellation reason is required',
    });
  }

  next();
};

/**
 * Validate MongoDB ObjectId format
 */
exports.validateObjectId = (req, res, next) => {
  const {id, jobCardId, reviewId, providerId, categoryId, userId} = req.params;
  const objectId = id || jobCardId || reviewId || providerId || categoryId || userId;

  if (objectId && objectId.length !== 24 && !/^[a-zA-Z0-9_-]+$/.test(objectId)) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Invalid ID format',
    });
  }

  next();
};

/**
 * Validate pagination parameters
 */
exports.validatePagination = (req, res, next) => {
  const {limit, offset} = req.query;

  if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Limit must be between 1 and 100',
    });
  }

  if (offset && (isNaN(offset) || parseInt(offset) < 0)) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Offset must be 0 or greater',
    });
  }

  next();
};
