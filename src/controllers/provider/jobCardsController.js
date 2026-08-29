/**
 * Job Cards Controller (Provider App)
 * Provider-specific job card operations
 */

const JobCard = require('../../models/JobCard');
const ServiceRequest = require('../../models/ServiceRequest');
const {notifyBooking} = require('../../realtime/socket');
const {onServiceRequestStatusChange} = require('../../services/activeServiceRequestService');
const {redactJobCardForViewer} = require('../../utils/contactAccess');
const {getContactSettings} = require('../../services/contactPolicyService');
const {
  backfillProviderJobCards,
} = require('../../utils/ensureJobCardFromServiceRequest');
const {
  attachCustomerProfileImages,
} = require('../../utils/attachCustomerProfileImages');

/** Providers must not see the customer verification PIN; phones follow contact rules. */
function sanitizeJobCardForProvider(job, viewer, settings) {
  if (!job) return job;
  const obj = job.toObject ? job.toObject() : {...job};
  const hasPin = Boolean(obj.taskPIN);
  delete obj.taskPIN;
  return redactJobCardForViewer(
    {...obj, hasVerificationPin: hasPin},
    viewer,
    settings,
  );
}

/**
 * Get provider's job cards
 */
exports.getMyJobCards = async (req, res, next) => {
  try {
    const {status, limit = 50, offset = 0} = req.query;

    try {
      await backfillProviderJobCards(req.user.uid);
    } catch (backfillErr) {
      console.warn(
        '⚠️ [getMyJobCards] Could not backfill missing job cards:',
        backfillErr.message,
      );
    }

    const query = {providerId: req.user.uid};
    if (status) {
      query.status = status;
    }

    const jobCards = await JobCard.find(query)
      .sort({createdAt: -1})
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const settings = await getContactSettings();
    const enriched = await attachCustomerProfileImages(jobCards);
    res.json({
      success: true,
      data: enriched.map((job) =>
        sanitizeJobCardForProvider(job, req.user, settings),
      ),
      count: enriched.length,
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

    const settings = await getContactSettings();
    const [enriched] = await attachCustomerProfileImages([
      jobCard.toObject ? jobCard.toObject() : jobCard,
    ]);

    res.json({
      success: true,
      data: sanitizeJobCardForProvider(
        enriched,
        req.user,
        settings,
      ),
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

    res.status(201).json({
      success: true,
      data: sanitizeJobCardForProvider(
        jobCard,
        req.user,
        await getContactSettings(),
      ),
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
      completionPhotos,
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

    if (status === 'in-progress') {
      // Always server-generate the PIN — never trust / reveal it to the provider client
      const existingPin = (jobCard.taskPIN || '').trim();
      if (!existingPin) {
        update.taskPIN = String(Math.floor(1000 + Math.random() * 9000));
        update.pinGeneratedAt = new Date();
      }
    } else if (taskPIN && status !== 'completed' && status !== 'in-progress') {
      update.taskPIN = taskPIN;
      update.pinGeneratedAt = pinGeneratedAt
        ? new Date(pinGeneratedAt)
        : new Date();
    }

    if (status === 'completed') {
      const verificationPIN = String(
        req.body.verificationPIN || req.body.taskPIN || '',
      ).trim();
      const expectedPin = String(jobCard.taskPIN || update.taskPIN || '').trim();
      if (!verificationPIN || !/^\d{4}$/.test(verificationPIN)) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Enter the 4-digit PIN from the customer',
        });
      }
      if (!expectedPin) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'No verification PIN on this job. Ask the customer to refresh their app.',
        });
      }
      if (verificationPIN !== expectedPin) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Verification PIN does not match',
        });
      }
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

    if (completionPhotos !== undefined) {
      if (status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Completion photos can only be added when marking the job complete',
        });
      }
      try {
        const {normalizePhotoReferences} = require('../../utils/normalizeAssetPhotos');
        update.completionPhotos = normalizePhotoReferences(
          completionPhotos,
          req.user,
          {max: 3},
        );
      } catch (photoErr) {
        return res.status(photoErr.statusCode || 400).json({
          success: false,
          error: photoErr.message || 'Bad Request',
          message: photoErr.message || 'Invalid completion photos',
        });
      }
    }

    const updatedJobCard = await JobCard.findByIdAndUpdate(
      jobCardId,
      {$set: update},
      {new: true},
    );

    // Notify customer via Mongo FCM token when service starts
    if (status === 'in-progress' && updatedJobCard?.customerId) {
      try {
        const {notifyUser} = require('../../utils/notify');
        const pinText = (update.taskPIN || updatedJobCard.taskPIN)
          ? ` Your verification PIN is: ${update.taskPIN || updatedJobCard.taskPIN}.`
          : '';
        await notifyUser(updatedJobCard.customerId, {
          title: 'Service Started',
          body: `${updatedJobCard.providerName || 'Provider'} has started your ${updatedJobCard.serviceType || 'service'}.${pinText}`,
          data: {
            type: 'service',
            status: 'in-progress',
            jobCardId: String(jobCardId),
            pin: String(update.taskPIN || updatedJobCard.taskPIN || ''),
          },
        });
      } catch (notifyErr) {
        console.warn('⚠️  Customer start notify failed:', notifyErr.message);
      }
    }

    // Mirror job status onto linked service request for customer-facing state
    if (
      status === 'in-progress' ||
      status === 'completed' ||
      status === 'cancelled' ||
      status === 'canceled'
    ) {
      try {
        const srKey = String(
          updatedJobCard.serviceRequestId ||
            updatedJobCard.bookingId ||
            updatedJobCard._id ||
            '',
        );
        if (srKey) {
          const sr = await ServiceRequest.findOne({
            $or: [{_id: srKey}, {consultationId: srKey}],
          });
          if (sr && String(sr.customerId) === String(updatedJobCard.customerId)) {
            const next =
              status === 'in-progress'
                ? 'in-progress'
                : status === 'completed'
                  ? 'completed'
                  : 'cancelled';
            sr.status = next;
            sr.updatedAt = new Date();
            if (next === 'cancelled') {
              sr.cancelledAt = new Date();
              if (cancellationReason) sr.cancellationReason = cancellationReason;
            }
            if (
              status === 'completed' &&
              Array.isArray(update.completionPhotos)
            ) {
              sr.completionPhotos = update.completionPhotos;
            }
            await sr.save();
            await onServiceRequestStatusChange(sr, next);

            if (status === 'in-progress') {
              try {
                await notifyBooking({
                  customerId: sr.customerId,
                  bookingData: {
                    type: 'service-request-status',
                    serviceRequestId: String(sr._id),
                    status: 'in-progress',
                    providerName: updatedJobCard.providerName,
                    serviceType: updatedJobCard.serviceType,
                  },
                });
              } catch (socketErr) {
                console.warn(
                  '⚠️  Could not emit in-progress service-request-status:',
                  socketErr.message,
                );
              }
            }

            if (status === 'completed') {
              try {
                const {notifyUser} = require('../../utils/notify');
                const {emitServiceCompleted} = require('../../realtime/socket');
                const srId = String(sr._id);
                await notifyUser(updatedJobCard.customerId, {
                  title: 'Service Complete',
                  body: `${updatedJobCard.providerName || 'Your partner'} has completed your ${updatedJobCard.serviceType || 'service'}.`,
                  data: {
                    type: 'service',
                    status: 'completed',
                    serviceRequestId: srId,
                    jobCardId: String(jobCardId),
                  },
                });
                emitServiceCompleted({
                  customerId: updatedJobCard.customerId,
                  jobCardId: String(jobCardId),
                  consultationId: srId,
                  providerName: updatedJobCard.providerName,
                  serviceType: updatedJobCard.serviceType,
                });
              } catch (completeErr) {
                console.warn(
                  '⚠️  Customer completion notify failed:',
                  completeErr.message,
                );
              }
            }
          }
        }
      } catch (mirrorErr) {
        console.warn('⚠️  Could not mirror job status to service request:', mirrorErr.message);
      }
    }

    res.json({
      success: true,
      data: sanitizeJobCardForProvider(
        updatedJobCard,
        req.user,
        await getContactSettings(),
      ),
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
    const settings = await getContactSettings();
    const plain = jobCard.toObject ? jobCard.toObject() : jobCard;
    const [enriched] = await attachCustomerProfileImages([plain]);
    res.json({
      success: true,
      data: sanitizeJobCardForProvider(enriched, req.user, settings),
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
