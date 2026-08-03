/**
 * Contact Recommendations Controller
 * Handles contact recommendation operations
 */

const ContactRecommendation = require('../../models/ContactRecommendation');
const User = require('../../models/User');

const POINTS_PER_RECOMMENDATION = 5;

/**
 * Create a new contact recommendation
 * POST /api/contactRecommendations
 */
exports.createContactRecommendation = async (req, res, next) => {
  try {
    const userId = req.user.uid; // From verified auth token
    const userRole = req.user.role; // From verified auth token

    // Only customers and providers can create recommendations
    if (userRole !== 'customer' && userRole !== 'provider') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only customers and providers can create contact recommendations',
      });
    }

    const {
      recommendedProviderName,
      recommendedProviderPhone,
      serviceType,
      address,
    } = req.body;

    // Validation
    if (!recommendedProviderName || !recommendedProviderName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Provider name is required',
      });
    }

    if (!recommendedProviderPhone || !recommendedProviderPhone.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Provider phone number is required',
      });
    }

    if (!serviceType || !serviceType.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Service type is required',
      });
    }

    // Get user details for the recommendation
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: 'User not found',
      });
    }

    // Create recommendation
    const recommendation = new ContactRecommendation({
      recommendedProviderName: recommendedProviderName.trim(),
      recommendedProviderPhone: recommendedProviderPhone.trim(),
      serviceType: serviceType.trim(),
      address: address ? address.trim() : undefined,
      recommendedBy: userId,
      recommendedByName: user.name || user.displayName || '',
      recommendedByPhone: user.phone || user.phoneNumber || '',
      recommendedByRole: userRole,
      status: 'pending',
      pointsAwarded: 0,
    });

    await recommendation.save();

    // Award points to the user (only for customers)
    if (userRole === 'customer') {
      const currentPoints = user.points || 0;
      const newPoints = currentPoints + POINTS_PER_RECOMMENDATION;

      await User.findByIdAndUpdate(userId, {
        $set: {
          points: newPoints,
          updatedAt: new Date(),
        },
      });

      // Update recommendation with points awarded
      recommendation.pointsAwarded = POINTS_PER_RECOMMENDATION;
      await recommendation.save();

      console.log(`✅ Awarded ${POINTS_PER_RECOMMENDATION} points to customer ${userId} for recommendation`);
    }

    res.status(201).json({
      success: true,
      data: recommendation,
      message: userRole === 'customer'
        ? `Contact recommendation submitted successfully! You earned ${POINTS_PER_RECOMMENDATION} points.`
        : 'Contact recommendation submitted successfully!',
      pointsAwarded: userRole === 'customer' ? POINTS_PER_RECOMMENDATION : 0,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all contact recommendations (admin only)
 * GET /api/contactRecommendations
 */
exports.getAllContactRecommendations = async (req, res, next) => {
  try {
    const userRole = req.user.role;

    // Only admins can view all recommendations
    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only administrators can view all contact recommendations',
      });
    }

    const {status, serviceType, limit = 50, offset = 0} = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }
    if (serviceType) {
      query.serviceType = serviceType;
    }

    const recommendations = await ContactRecommendation.find(query)
      .sort({createdAt: -1})
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    // Fill sharer phone from user profile when missing on the recommendation
    const sharerIds = [
      ...new Set(
        recommendations
          .filter((r) => r.recommendedBy && !r.recommendedByPhone)
          .map((r) => r.recommendedBy),
      ),
    ];
    if (sharerIds.length) {
      try {
        const users = await User.find({_id: {$in: sharerIds}})
          .select('_id phone phoneNumber location')
          .lean();
        const byId = new Map(users.map((u) => [u._id, u]));
        for (const rec of recommendations) {
          if (rec.recommendedByPhone) continue;
          const u = byId.get(rec.recommendedBy);
          if (!u) continue;
          rec.recommendedByPhone = u.phone || u.phoneNumber || '';
          if (!rec.address && u.location?.address) {
            rec.recommendedByLocation = [
              u.location.address,
              u.location.city,
              u.location.pincode,
            ]
              .filter(Boolean)
              .join(', ');
          }
        }
      } catch (e) {
        console.warn('Could not enrich contact sharer phones:', e.message);
      }
    }

    const total = await ContactRecommendation.countDocuments(query);

    res.json({
      success: true,
      data: recommendations,
      count: recommendations.length,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get contact recommendations by user (for the user who created them)
 * GET /api/contactRecommendations/me
 */
exports.getMyContactRecommendations = async (req, res, next) => {
  try {
    const userId = req.user.uid;

    const recommendations = await ContactRecommendation.find({
      recommendedBy: userId,
    })
      .sort({createdAt: -1});

    res.json({
      success: true,
      data: recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update contact recommendation status (admin only)
 * PUT /api/contactRecommendations/:id/status
 */
exports.updateRecommendationStatus = async (req, res, next) => {
  try {
    const userRole = req.user.role;

    // Only admins can update recommendation status
    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only administrators can update recommendation status',
      });
    }

    const {id} = req.params;
    const {status, adminNotes} = req.body;

    if (!status || !['pending', 'contacted', 'registered', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Valid status is required (pending, contacted, registered, rejected)',
      });
    }

    const recommendation = await ContactRecommendation.findByIdAndUpdate(
      id,
      {
        $set: {
          status,
          adminNotes: adminNotes ? adminNotes.trim() : undefined,
          updatedAt: new Date(),
        },
      },
      {new: true}
    );

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Contact recommendation not found',
      });
    }

    res.json({
      success: true,
      data: recommendation,
      message: 'Recommendation status updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update contact recommendation details (admin only)
 * PUT /api/contactRecommendations/:id
 * Body: name?, phone?, serviceType?, address?, status?, adminNotes?
 */
exports.updateContactRecommendation = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only administrators can update contact recommendations',
      });
    }

    const {id} = req.params;
    const recommendation = await ContactRecommendation.findById(id);
    if (!recommendation) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Contact recommendation not found',
      });
    }

    const {
      recommendedProviderName,
      recommendedProviderPhone,
      serviceType,
      address,
      status,
      adminNotes,
    } = req.body;

    if (recommendedProviderName !== undefined) {
      const name = String(recommendedProviderName || '').trim();
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Provider name is required',
        });
      }
      recommendation.recommendedProviderName = name;
    }

    if (recommendedProviderPhone !== undefined) {
      const phone = String(recommendedProviderPhone || '').trim();
      if (!phone) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Provider phone number is required',
        });
      }
      recommendation.recommendedProviderPhone = phone;
    }

    if (serviceType !== undefined) {
      const service = String(serviceType || '').trim();
      if (!service) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Service type is required',
        });
      }
      recommendation.serviceType = service;
    }

    if (address !== undefined) {
      const addr = String(address || '').trim();
      recommendation.address = addr || undefined;
    }

    if (status !== undefined) {
      if (!['pending', 'contacted', 'registered', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message:
            'Valid status is required (pending, contacted, registered, rejected)',
        });
      }
      recommendation.status = status;
    }

    if (adminNotes !== undefined) {
      const notes = String(adminNotes || '').trim();
      recommendation.adminNotes = notes || undefined;
    }

    recommendation.updatedAt = new Date();
    await recommendation.save();

    res.json({
      success: true,
      data: recommendation,
      message: 'Contact recommendation updated successfully',
    });
  } catch (error) {
    next(error);
  }
};
