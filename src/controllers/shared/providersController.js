/**
 * Providers Controller (Shared)
 * Handles provider operations for all apps
 */

const Provider = require('../../models/Provider');
const User = require('../../models/User');
const {connectDB} = require('../../config/database');
const ADMIN_LIST_SORT = require('../../utils/adminListSort');
const {toPublicProvider} = require('../../utils/contactAccess');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get all providers (public, but admins can see all statuses)
 */
exports.getProviders = async (req, res, next) => {
  try {
    await connectDB();

    const {
      serviceType,
      city,
      state,
      district,
      stateId,
      districtId,
      pincode,
      isOnline,
      minRating,
      approvalStatus, // Allow filtering by approval status
      includeInactive,
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

    const andClauses = [];

    // Filters - check both serviceType (string) and serviceCategories (array) fields
    if (serviceType) {
      andClauses.push({
        $or: [
          {serviceType: serviceType},
          {serviceCategories: {$in: [serviceType]}},
          {specialization: serviceType},
        ],
      });
    }
    if (city) {
      query['location.city'] = new RegExp(`^${escapeRegex(city)}$`, 'i');
    }
    if (stateId || state) {
      const stateParts = [];
      if (stateId) {
        stateParts.push({'location.stateId': String(stateId).trim()});
      }
      if (state) {
        stateParts.push({
          'location.state': new RegExp(`^${escapeRegex(String(state).trim())}$`, 'i'),
        });
      }
      if (stateParts.length === 1) {
        Object.assign(query, stateParts[0]);
      } else {
        andClauses.push({$or: stateParts});
      }
    }
    if (districtId || district) {
      const districtParts = [];
      if (districtId) {
        districtParts.push({'location.districtId': String(districtId).trim()});
      }
      if (district) {
        const d = String(district).trim();
        districtParts.push({
          'location.district': new RegExp(`^${escapeRegex(d)}$`, 'i'),
        });
        // Legacy: some providers stored district name in city
        districtParts.push({
          'location.city': new RegExp(`^${escapeRegex(d)}$`, 'i'),
        });
      }
      if (districtParts.length === 1) {
        Object.assign(query, districtParts[0]);
      } else {
        andClauses.push({$or: districtParts});
      }
    }
    if (pincode) {
      const pin = String(pincode).trim();
      // Match provider.location or linked user.location (same _id)
      const usersWithPin = await User.find({
        role: 'provider',
        'location.pincode': pin,
      })
        .select('_id')
        .lean();
      const userIds = usersWithPin.map((u) => u._id);
      andClauses.push({
        $or: [
          {'location.pincode': pin},
          {_id: {$in: userIds}},
        ],
      });
    }
    if (isOnline === 'true') query.isOnline = true;
    if (minRating) query.rating = {$gte: parseFloat(minRating)};
    if (String(includeInactive) !== 'true') {
      query.isActive = {$ne: false};
    }

    if (andClauses.length === 1) {
      Object.assign(query, andClauses[0]);
    } else if (andClauses.length > 1) {
      query.$and = andClauses;
    }

    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const providers = await Provider.find(query)
      .sort(ADMIN_LIST_SORT)
      .limit(lim)
      .skip(off)
      .lean();

    const total = await Provider.countDocuments(query);

    let enriched = providers;
    if (isAdmin && providers.length > 0) {
      try {
        const ids = providers.map((p) => p._id);
        const users = await User.find({_id: {$in: ids}})
          .select('+encryptedPin +pinHash')
          .lean();
        const byId = new Map(users.map((u) => [u._id, u]));
        enriched = providers.map((p) => {
          const u = byId.get(p._id);
          return {
            ...p,
            phone: p.phone || p.phoneNumber || u?.phone || u?.phoneNumber,
            phoneNumber:
              p.phoneNumber || p.phone || u?.phoneNumber || u?.phone,
            location: p.location || u?.location || undefined,
            hasPin: Boolean(u?.pinHash || u?.encryptedPin),
            isActive:
              p.isActive !== false && (u ? u.isActive !== false : true),
            deactivationReason:
              p.deactivationReason || u?.deactivationReason || undefined,
          };
        });
      } catch (e) {
        console.warn('Could not enrich providers with PIN status:', e.message);
      }
    } else {
      // Public / non-admin browse — never expose private contact fields
      enriched = providers.map((p) => toPublicProvider(p));
    }

    res.json({
      success: true,
      data: enriched,
      count: enriched.length,
      total,
      limit: lim,
      offset: off,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get provider by ID (public)
 * Also fetches real-time location from Firebase Realtime Database
 */
exports.getProviderById = async (req, res, next) => {
  try {
    await connectDB();

    const {providerId} = req.params;
    // Try to find by string _id first (for Firestore-style IDs)
    let provider = await Provider.findOne({_id: providerId});
    
    // If not found and the ID looks like an ObjectId, try with ObjectId conversion
    if (!provider && require('mongoose').Types.ObjectId.isValid(providerId)) {
      try {
        provider = await Provider.findById(providerId);
      } catch (objectIdError) {
        // Continue with null
      }
    }

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
      });
    }

    // Get provider location from Firebase Realtime Database
    let realtimeLocation = null;
    try {
      const admin = require('firebase-admin');
      if (admin.apps.length > 0) {
        const db = admin.database();
        const locationRef = db.ref(`providers/${providerId}/location`);
        const snapshot = await locationRef.once('value');
        if (snapshot.exists()) {
          realtimeLocation = snapshot.val();
        }
      }
    } catch (rtdbError) {
      console.warn('Could not fetch provider location from Realtime Database:', rtdbError.message);
      // Continue without location - not critical
    }

    // Merge real-time location with provider data
    const providerData = provider.toObject ? provider.toObject() : provider;
    if (realtimeLocation) {
      providerData.currentLocation = {
        latitude: realtimeLocation.latitude,
        longitude: realtimeLocation.longitude,
        address: realtimeLocation.address,
        city: realtimeLocation.city,
        state: realtimeLocation.state,
        pincode: realtimeLocation.pincode,
        updatedAt: realtimeLocation.updatedAt || Date.now(),
      };
    }

    // Admin: PIN presence only — reveal via GET /api/users/:id/pin
    if (req.user?.role === 'admin') {
      try {
        const linkedUser = await User.findById(providerId).select(
          '+encryptedPin +pinHash',
        );
        providerData.hasPin = Boolean(
          linkedUser?.pinHash || linkedUser?.encryptedPin,
        );
        providerData.userId = linkedUser?._id || providerId;
        const userLoc = linkedUser?.location;
        if (userLoc && typeof userLoc === 'object') {
          const existing = providerData.location || {};
          providerData.location = {
            ...userLoc,
            ...existing,
            address: existing.address || userLoc.address || undefined,
            city: existing.city || userLoc.city || undefined,
            state: existing.state || userLoc.state || undefined,
            pincode: existing.pincode || userLoc.pincode || undefined,
            country: existing.country || userLoc.country || undefined,
          };
        }
        if (
          providerData.currentLocation?.address &&
          !(providerData.location && providerData.location.address)
        ) {
          providerData.location = {
            ...(providerData.location || {}),
            address:
              providerData.location?.address ||
              providerData.currentLocation.address,
            city:
              providerData.location?.city ||
              providerData.currentLocation.city,
            state:
              providerData.location?.state ||
              providerData.currentLocation.state,
            pincode:
              providerData.location?.pincode ||
              providerData.currentLocation.pincode,
          };
        }
        if (providerData.isActive === undefined || providerData.isActive === null) {
          providerData.isActive = linkedUser?.isActive !== false;
        }
        if (!providerData.deactivationReason && linkedUser?.deactivationReason) {
          providerData.deactivationReason = linkedUser.deactivationReason;
        }
      } catch (pinErr) {
        console.warn('Could not load provider PIN status:', pinErr.message);
      }
    }

    const isAdmin = req.user && req.user.role === 'admin';
    const isSelfProvider =
      req.user &&
      req.user.role === 'provider' &&
      String(req.user.uid) === String(providerId);

    res.json({
      success: true,
      data:
        isAdmin || isSelfProvider
          ? providerData
          : toPublicProvider(providerData),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current provider's profile (provider only)
 */
exports.getMyProfile = async (req, res, next) => {
  try {
    await connectDB();
    const provider = await Provider.findById(req.user.uid);

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider profile not found',
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
    await connectDB();
    const updateData = {
      ...req.body,
      updatedAt: new Date(),
    };

    // Prevent changing approval status or role directly
    delete updateData.approvalStatus;
    delete updateData.role;

    // Keep location + address in sync when either is sent
    if (updateData.address && typeof updateData.address === 'object') {
      const addr = updateData.address;
      updateData.location = {
        ...(updateData.location || {}),
        address: addr.address,
        landmark: addr.landmark,
        city: addr.district || addr.city,
        district: addr.district || addr.city,
        state: addr.state,
        stateId: addr.stateId,
        districtId: addr.districtId,
        pincode: addr.pincode,
        latitude: addr.latitude,
        longitude: addr.longitude,
      };
    } else if (updateData.location && typeof updateData.location === 'object') {
      const loc = updateData.location;
      if (!updateData.address) {
        updateData.address = {
          type: 'home',
          address: loc.address,
          landmark: loc.landmark,
          city: loc.district || loc.city,
          district: loc.district || loc.city,
          state: loc.state,
          stateId: loc.stateId,
          districtId: loc.districtId,
          pincode: loc.pincode,
          latitude: loc.latitude,
          longitude: loc.longitude,
        };
      }
    }

    const provider = await Provider.findByIdAndUpdate(
      req.user.uid,
      {$set: updateData},
      {new: true, runValidators: false, upsert: true},
    );

    // Sync linked user profile address fields (incl. landmark)
    try {
      const userPatch = {updatedAt: new Date()};
      if (updateData.name) {
        userPatch.name = updateData.name;
        userPatch.displayName = updateData.name;
      }
      if (updateData.location) {
        userPatch.location = updateData.location;
      }
      if (updateData.address) {
        userPatch.homeAddress = {
          address: updateData.address.address,
          landmark: updateData.address.landmark,
          city: updateData.address.city || updateData.address.district,
          district: updateData.address.district || updateData.address.city,
          state: updateData.address.state,
          stateId: updateData.address.stateId,
          districtId: updateData.address.districtId,
          pincode: updateData.address.pincode,
          latitude: updateData.address.latitude,
          longitude: updateData.address.longitude,
        };
      }
      await User.findByIdAndUpdate(req.user.uid, {$set: userPatch});
    } catch (syncErr) {
      console.warn('Could not sync user from provider self-update:', syncErr.message);
    }

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
    
    // Ensure database is connected before using getCollection
    const {getCollection, connectDB} = require('../../config/database');
    
    // Ensure connection is established
    try {
      await connectDB();
    } catch (dbError) {
      console.warn('⚠️ Database connection check failed, continuing with Mongoose models only:', dbError.message);
    }
    
    let providerStatusCollection = null;
    try {
      providerStatusCollection = await getCollection('providerStatus');
    } catch (collectionError) {
      console.warn('⚠️ Could not get providerStatus collection, skipping real-time status update:', collectionError.message);
      // Continue without providerStatus collection - not critical
    }

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
    try {
      await Provider.findByIdAndUpdate(
        req.user.uid,
        {$set: updateData},
        {new: true, upsert: true},
      );
    } catch (mongoError) {
      const msg = mongoError?.message || String(mongoError);
      const isTransient =
        /timed out|timeout|ECONNREFUSED|MongoNetwork|server selection|27017/i.test(
          msg,
        );
      // Location-only pings are best-effort; don't fail the app hard on DB blips
      const locationOnly =
        currentLocation &&
        typeof isOnline !== 'boolean' &&
        typeof isAvailable !== 'boolean';
      if (isTransient && locationOnly) {
        console.warn(
          '⚠️ Location update skipped (transient Mongo issue):',
          msg,
        );
        return res.status(503).json({
          success: false,
          message: 'Location update temporarily unavailable',
        });
      }
      throw mongoError;
    }

    // Update providerStatus collection (Realtime DB equivalent) - only if collection is available
    if (providerStatusCollection) {
      try {
        await providerStatusCollection.updateOne(
          {_id: req.user.uid},
          {$set: {...updateData, _id: req.user.uid}},
          {upsert: true},
        );
      } catch (statusUpdateError) {
        console.warn('⚠️ Failed to update providerStatus collection (non-critical):', statusUpdateError.message);
        // Don't fail the request if providerStatus update fails
      }
    }

    res.json({
      success: true,
      message: 'Provider status updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update provider details (admin only)
 * Allows admins to update any provider field including document verification
 * Role is verified by requireRole('admin') middleware
 */
exports.updateProvider = async (req, res, next) => {
  try {
    await connectDB();
    const {providerId} = req.params;
    const adminId = req.user.uid; // Admin ID from verified auth token
    const adminRole = req.user.role; // Role verified by requireRole middleware

    // Verify admin role (double-check, though middleware already ensures this)
    if (adminRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only administrators can update provider details',
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: new Date(),
      updatedBy: adminId, // Track which admin made the update
    };

    // Prevent changing critical fields that should use specific endpoints
    delete updateData._id;
    delete updateData.createdAt;

    if (updateData.phone !== undefined || updateData.phoneNumber !== undefined) {
      const {syncPhoneFields} = require('../../utils/phone');
      const synced = syncPhoneFields(
        updateData.phoneNumber ?? updateData.phone,
      );
      updateData.phone = synced.phone;
      updateData.phoneNumber = synced.phoneNumber;
    }

    // Allow updating documents verification status
    // The updateData may contain documents object with verification fields
    const provider = await Provider.findByIdAndUpdate(
      providerId,
      {$set: updateData},
      {new: true, runValidators: false},
    );

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
        message: 'Provider not found',
      });
    }

    console.log(`✅ Admin ${adminId} updated provider ${providerId}`);

    // Keep linked user profile fields in sync for address/phone display
    try {
      const userPatch = {updatedAt: new Date()};
      if (updateData.name) {
        userPatch.name = updateData.name;
        userPatch.displayName = updateData.name;
      }
      if (updateData.phone || updateData.phoneNumber) {
        userPatch.phone = updateData.phone || updateData.phoneNumber;
        userPatch.phoneNumber =
          updateData.phoneNumber || updateData.phone;
      }
      if (updateData.phoneVerified !== undefined) {
        userPatch.phoneVerified = Boolean(updateData.phoneVerified);
      }
      if (updateData.location) {
        userPatch.location = updateData.location;
      }
      await User.findByIdAndUpdate(providerId, {$set: userPatch});
    } catch (syncErr) {
      console.warn('Could not sync user from provider update:', syncErr.message);
    }

    res.json({
      success: true,
      data: provider,
      message: 'Provider updated successfully',
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
    await connectDB();
    const {providerId} = req.params;
    const {approvalStatus, rejectionReason} = req.body;

    if (!['pending', 'approved', 'rejected'].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid approval status',
      });
    }

    const updateData = {
      approvalStatus,
      updatedAt: new Date(),
      approvedBy: req.user.uid,
      approvedAt: new Date(),
    };

    // Handle rejection reason
    if (approvalStatus === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    } else if (approvalStatus === 'approved') {
      // Clear rejection reason when approved
      updateData.rejectionReason = null;
      updateData.verified = true;
    }

    const provider = await Provider.findByIdAndUpdate(
      providerId,
      {$set: updateData},
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

const ALLOWED_DOC_KEYS = ['idProof', 'addressProof', 'certificate'];

/**
 * POST /api/providers/:providerId/documents/:docKey
 * Admin upload provider document (multipart field: file) → S3 + CloudFront
 */
exports.uploadProviderDocument = async (req, res, next) => {
  try {
    const s3 = require('../../services/s3.service');
    const {validateDocumentBuffer} = require('../../utils/assetValidation');
    const {
      buildProviderDocumentKey,
      keyFromUrlOrKey,
      normalizeObjectKey,
    } = require('../../utils/s3Keys');

    await connectDB();
    const {providerId, docKey} = req.params;

    if (!ALLOWED_DOC_KEYS.includes(docKey)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `docKey must be one of: ${ALLOWED_DOC_KEYS.join(', ')}`,
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'file is required',
      });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
      });
    }

    const validated = validateDocumentBuffer(
      req.file.buffer,
      req.file.mimetype,
    );
    const key = buildProviderDocumentKey(
      providerId,
      docKey,
      validated.extension,
    );
    const uploaded = await s3.uploadFile({
      body: req.file.buffer,
      key,
      contentType: validated.contentType,
      userId: req.user?.uid,
    });

    const previousDocs = provider.documents?.toObject
      ? provider.documents.toObject()
      : provider.documents || {};
    const previousUrl = previousDocs[docKey];

    const documents = {
      ...previousDocs,
      [docKey]: uploaded.url,
      [`${docKey}Verified`]: false,
      [`${docKey}Rejected`]: false,
      [`${docKey}RejectionReason`]: '',
    };

    provider.documents = documents;
    provider.updatedAt = new Date();
    await provider.save();

    if (previousUrl && previousUrl !== uploaded.url) {
      try {
        const oldKey = keyFromUrlOrKey(previousUrl);
        normalizeObjectKey(oldKey);
        await s3.deleteObject(oldKey, {userId: req.user?.uid});
      } catch {
        /* ignore legacy disk URLs */
      }
    }

    res.json({
      success: true,
      data: {
        url: uploaded.url,
        key: uploaded.key,
        contentType: uploaded.contentType,
        size: uploaded.size,
        documents: provider.documents,
        provider,
      },
      message: 'Document uploaded successfully',
    });
  } catch (error) {
    next(error);
  }
};
