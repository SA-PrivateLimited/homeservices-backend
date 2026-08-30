/**
 * Providers Controller (Shared)
 * Handles provider operations for all apps
 */

const Provider = require('../../models/Provider');
const {normalizePhotoReferences} = require('../../utils/normalizeAssetPhotos');
const User = require('../../models/User');
const ServiceCategory = require('../../models/ServiceCategory');
const {connectDB} = require('../../config/database');
const ADMIN_LIST_SORT = require('../../utils/adminListSort');
const {toPublicProviderForSettings} = require('../../utils/contactAccess');
const {
  partnerNamePatch,
  syncPartnerDisplayNames,
} = require('../../utils/partnerNameSync');
const {getContactSettings} = require('../../services/contactPolicyService');
const {
  allServicesForProvider,
  isServiceVerified,
  isServiceCustomerVisible,
  addServiceToProvider,
  upsertQualification,
  setInactive,
  ensureQualifications,
  ensureServiceOnProfile,
  applyCustomerServiceView,
  hasAnyCustomerVisibleService,
  VERIFICATION_STATUSES,
  qualificationForService,
  canEditServiceQualification,
  documentsForCategory,
  providerOwnsDocumentUrl,
  summarizePartnerServices,
  syncProfileExperienceToPrimaryService,
} = require('../../utils/providerServiceAvailability');
const {
  excludeSelfProviderClause,
  filterOutSelfProvider,
  normalizeUserId,
} = require('../../utils/excludeSelfProvider');
const {adminProfileFlags} = require('../../utils/userProfiles');
const {hasPinForPurpose, PIN_SELECT} = require('../../utils/rolePins');
const {autoVerifyPartnerIfEligible} = require('../../utils/partnerAutoVerification');
const {
  getPartnerVerificationMode,
  isPartnerAutoVerifyEnabled,
} = require('../../services/partnerVerificationPolicyService');
const {
  isOfflineOpenRequestsEnabled,
} = require('../../services/providerOpenRequestPolicyService');
const {
  applyLinkedProfileImageFallback,
} = require('../../utils/resolvePartnerProfileImage');

async function providerPayloadWithPolicy(provider) {
  if (!provider) return provider;
  const [mode, allowOfflineProviderOpenRequests] = await Promise.all([
    getPartnerVerificationMode(),
    isOfflineOpenRequestsEnabled(),
  ]);
  const raw = provider.toObject ? provider.toObject() : {...provider};
  return {...raw, partnerVerificationMode: mode, allowOfflineProviderOpenRequests};
}

async function maybeAutoVerifyPartner(provider, userId) {
  if (!provider || !userId) return provider;
  if (!(await isPartnerAutoVerifyEnabled())) return provider;
  const user = await User.findById(userId)
    .select('phoneVerified name displayName')
    .lean();
  const result = autoVerifyPartnerIfEligible(provider, user);
  if (result.changed) {
    await provider.save();
  }
  return provider;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function serviceDocStorageKey(serviceName, docKey) {
  const svc = String(serviceName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const doc = String(docKey || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `service-${svc || 'unknown'}-${doc || 'doc'}`;
}

function serviceInfoText(q) {
  const raw = q?.serviceInfo;
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    if (typeof raw.text === 'string') return raw.text.trim();
    if (typeof raw.description === 'string') return raw.description.trim();
  }
  return String(q?.notes || '').trim();
}

async function resolveActiveCategoryName(raw) {
  const name = String(raw || '').trim();
  if (!name) return null;
  const re = new RegExp(`^${escapeRegex(name)}$`, 'i');
  const cat = await ServiceCategory.findOne({name: re, isActive: true}).lean();
  return cat?.name || null;
}

function publicProviderRow(provider, settings, serviceQuery) {
  return toPublicProviderForSettings(
    applyCustomerServiceView(provider, serviceQuery),
    settings,
  );
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
      blockId,
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
    if (blockId) {
      const blockParts = [];
      const bid = String(blockId).trim();
      blockParts.push({'location.blockId': bid});
      blockParts.push({'address.blockId': bid});
      if (blockParts.length === 1) {
        Object.assign(query, blockParts[0]);
      } else {
        andClauses.push({$or: blockParts});
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

    // Customer discovery: never show the viewer's own Partner profile.
    const viewerId = normalizeUserId(req.user?.uid);
    if (viewerId && !isAdmin) {
      Object.assign(query, excludeSelfProviderClause(viewerId));
    }

    if (andClauses.length === 1) {
      Object.assign(query, andClauses[0]);
    } else if (andClauses.length > 1) {
      query.$and = andClauses;
    }

    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const CUSTOMER_LIST_EXCLUDE =
      '-documents -bankAccount -bankDetails -encryptedPin -pinHash -fcmToken -aadharNumber -aadhaarNumber -panNumber -gstNumber -rejectionReason';

    let listQuery = Provider.find(query)
      .sort(ADMIN_LIST_SORT)
      .limit(lim)
      .skip(off);
    if (!isAdmin) {
      listQuery = listQuery.select(CUSTOMER_LIST_EXCLUDE);
    }
    const providers = await listQuery.lean();

    const total = await Provider.countDocuments(query);

    let enriched = providers;
    if (isAdmin && providers.length > 0) {
      try {
        const ids = providers.map((p) => p._id);
        const users = await User.find({_id: {$in: ids}})
          .select(PIN_SELECT + ' customerProfileEnabled customerAccessActive role isActive')
          .lean();
        const byId = new Map(users.map((u) => [u._id, u]));
        enriched = providers.map((p) => {
          const u = byId.get(p._id);
          const flags = adminProfileFlags(u || {role: 'provider'}, p);
          return {
            ...p,
            phone: p.phone || p.phoneNumber || u?.phone || u?.phoneNumber,
            phoneNumber:
              p.phoneNumber || p.phone || u?.phoneNumber || u?.phone,
            location: p.location || u?.location || undefined,
            hasPin: hasPinForPurpose(u, 'partner'),
            hasPartnerPin: hasPinForPurpose(u, 'partner'),
            hasCustomerPin: hasPinForPurpose(u, 'customer'),
            ...flags,
            isActive: p.isActive !== false,
            deactivationReason:
              p.deactivationReason || u?.deactivationReason || undefined,
            services: summarizePartnerServices(p),
          };
        });
      } catch (e) {
        console.warn('Could not enrich providers with PIN status:', e.message);
      }
    } else {
      const settings = await getContactSettings();
      const serviceQuery = serviceType ? String(serviceType).trim() : '';
      enriched = providers
        .filter((p) =>
          serviceQuery
            ? isServiceCustomerVisible(p, serviceQuery)
            : hasAnyCustomerVisibleService(p),
        )
        .map((p) => publicProviderRow(p, settings, serviceQuery));
    }

    if (viewerId && !isAdmin) {
      enriched = filterOutSelfProvider(enriched, viewerId);
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

    const providerData = provider.toObject ? provider.toObject() : provider;

    // Admin: PIN presence only — reveal via GET /api/users/:id/pin
    if (req.user?.role === 'admin') {
      try {
        const linkedUser = await User.findById(providerId).select(
          PIN_SELECT + ' customerProfileEnabled customerAccessActive role isActive',
        );
        providerData.hasPin = hasPinForPurpose(linkedUser, 'partner');
        providerData.hasPartnerPin = hasPinForPurpose(linkedUser, 'partner');
        providerData.hasCustomerPin = hasPinForPurpose(linkedUser, 'customer');
        Object.assign(
          providerData,
          adminProfileFlags(linkedUser || {role: 'provider'}, providerData),
        );
        providerData.userId = linkedUser?._id || providerId;
        providerData.services = summarizePartnerServices(providerData);
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
          providerData.isActive = true;
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

    let payload = providerData;
    if (!isAdmin && !isSelfProvider) {
      const settings = await getContactSettings();
      const serviceQuery = String(req.query.serviceType || '').trim();
      payload = publicProviderRow(providerData, settings, serviceQuery);
    }

    res.json({
      success: true,
      data: payload,
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

    ensureQualifications(provider);

    let linkedUser = null;
    try {
      linkedUser = await User.findById(req.user.uid).select(
        'name displayName phoneVerified profileImage photoURL',
      );
      const {providerChanged, userChanged} = syncPartnerDisplayNames(
        provider,
        linkedUser,
      );
      if (providerChanged) await provider.save();
      if (userChanged && linkedUser) await linkedUser.save();
    } catch (syncErr) {
      console.warn('Could not repair partner display name:', syncErr.message);
    }

    if (provider.isModified()) {
      await provider.save();
    }

    const payload = await providerPayloadWithPolicy(provider);
    applyLinkedProfileImageFallback(payload, linkedUser);

    res.json({
      success: true,
      data: payload,
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
    delete updateData.verified;
    delete updateData.serviceCategories;
    delete updateData.serviceQualifications;
    delete updateData.inactiveServiceCategories;

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

    const requestedPrimary = String(
      updateData.serviceType || updateData.specialization || '',
    ).trim();
    delete updateData.serviceType;
    delete updateData.specialization;
    delete updateData.specialty;

    try {
      const existing = await Provider.findById(req.user.uid).select(
        'name displayName',
      );
      const linkedUser = await User.findById(req.user.uid).select(
        'name displayName',
      );
      const namePatch = partnerNamePatch(
        updateData.name,
        existing?.name,
        existing?.displayName,
        linkedUser?.name,
        linkedUser?.displayName,
      );
      if (namePatch) {
        updateData.name = namePatch.name;
        updateData.displayName = namePatch.displayName;
      }
    } catch (syncErr) {
      console.warn('Could not resolve partner name before update:', syncErr.message);
    }

    if (updateData.name) {
      const trimmedName = String(updateData.name).trim();
      updateData.name = trimmedName;
      updateData.displayName = trimmedName;
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'photos')) {
      try {
        updateData.photos = normalizePhotoReferences(updateData.photos, req.user, {
          max: 3,
        });
      } catch (photoErr) {
        if (photoErr.statusCode || photoErr.status) {
          return res.status(photoErr.statusCode || photoErr.status).json({
            success: false,
            error: photoErr.name || 'Bad Request',
            message: photoErr.message,
          });
        }
        throw photoErr;
      }
    }

    const provider = await Provider.findByIdAndUpdate(
      req.user.uid,
      {$set: updateData},
      {new: true, runValidators: false, upsert: true},
    );

    if (provider && requestedPrimary) {
      const known = allServicesForProvider(provider);
      const existing = known.find(
        (s) => s.toLowerCase() === requestedPrimary.toLowerCase(),
      );
      if (existing) {
        provider.serviceType = existing;
        provider.specialization = existing;
        await provider.save();
      } else if (!known.length) {
        const canonical = (await resolveActiveCategoryName(requestedPrimary)) || requestedPrimary;
        addServiceToProvider(provider, canonical, {source: 'self'});
        await provider.save();
      }
    }

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

    let saved = provider ? await Provider.findById(req.user.uid) : null;
    if (saved) {
      if (syncProfileExperienceToPrimaryService(saved)) {
        await saved.save();
      }
      saved = await maybeAutoVerifyPartner(saved, req.user.uid);
    }

    const linkedUser = await User.findById(req.user.uid)
      .select('profileImage photoURL')
      .lean();
    const payload = await providerPayloadWithPolicy(saved || provider);
    applyLinkedProfileImageFallback(payload, linkedUser);

    res.json({
      success: true,
      data: payload,
      message: 'Provider profile updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

function applyServiceAvailabilityChange(provider, serviceName, active) {
  const name = String(serviceName || '').trim();
  if (!name) {
    return {
      ok: false,
      status: 400,
      message: 'Service name is required.',
    };
  }
  if (typeof active !== 'boolean') {
    return {
      ok: false,
      status: 400,
      message: 'active must be true or false.',
    };
  }

  const known = allServicesForProvider(provider);
  const match = known.find((s) => s.toLowerCase() === name.toLowerCase());
  if (!match) {
    return {
      ok: false,
      status: 400,
      message: 'This service is not on the Partner profile.',
    };
  }

  if (active && !isServiceVerified(provider, match)) {
    return {
      ok: false,
      status: 400,
      message:
        'This service cannot receive new jobs until verification is complete.',
    };
  }

  setInactive(provider, match, !active);
  provider.updatedAt = new Date();
  return {ok: true, match, active};
}

/**
 * Toggle per-service availability (provider only).
 * PUT /api/providers/me/service-availability
 * Body: { serviceName: string, active: boolean }
 */
exports.updateMyServiceAvailability = async (req, res, next) => {
  try {
    await connectDB();
    const {serviceName, active} = req.body || {};

    const provider = await Provider.findById(req.user.uid);
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Provider profile not found.',
      });
    }

    const result = applyServiceAvailabilityChange(provider, serviceName, active);
    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        error: 'Validation Error',
        message: result.message,
      });
    }

    await provider.save();

    res.json({
      success: true,
      data: provider,
      message: active
        ? 'Service is now active for new jobs.'
        : 'Service is now inactive for new jobs.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: toggle per-service availability for a Partner.
 * PUT /api/providers/:providerId/service-availability
 * Body: { serviceName: string, active: boolean }
 */
exports.updateProviderServiceAvailability = async (req, res, next) => {
  try {
    await connectDB();
    const {serviceName, active} = req.body || {};

    const provider = await Provider.findById(req.params.providerId);
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Provider not found.',
      });
    }

    const result = applyServiceAvailabilityChange(provider, serviceName, active);
    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        error: 'Validation Error',
        message: result.message,
      });
    }

    await provider.save();

    res.json({
      success: true,
      data: provider,
      message: active
        ? 'Service is now active for new jobs.'
        : 'Service is now inactive for new jobs.',
    });
  } catch (error) {
    next(error);
  }
};

async function addServiceToExistingProvider(provider, rawName, source) {
  const canonical = await resolveActiveCategoryName(rawName);
  if (!canonical) {
    return {
      error: {
        status: 400,
        body: {
          success: false,
          error: 'Validation Error',
          message: 'This service is not available.',
        },
      },
    };
  }
  const result = addServiceToProvider(provider, canonical, {source});
  if (result.duplicate) {
    return {
      error: {
        status: 409,
        body: {
          success: false,
          error: 'Conflict',
          message: 'This service is already added.',
        },
      },
    };
  }
  provider.updatedAt = new Date();
  await provider.save();
  return {provider};
}

/**
 * Add another professional service to the same Partner profile.
 * POST /api/providers/me/services
 * Body: { serviceName: string }
 */
exports.addMyService = async (req, res, next) => {
  try {
    await connectDB();
    const provider = await Provider.findById(req.user.uid);
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Provider profile not found.',
      });
    }
    const result = await addServiceToExistingProvider(
      provider,
      req.body?.serviceName || req.body?.name,
      'self',
    );
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }
    const saved = await maybeAutoVerifyPartner(result.provider, req.user.uid);
    res.status(201).json({
      success: true,
      data: await providerPayloadWithPolicy(saved),
      message: 'Service added.',
    });
  } catch (error) {
    next(error);
  }
};

function findOwnedService(provider, raw) {
  const name = decodeURIComponent(String(raw || '')).trim();
  if (!name) return null;
  return allServicesForProvider(provider).find(
    (s) => s.toLowerCase() === name.toLowerCase(),
  );
}

function sanitizeServiceDocuments(providerId, docs) {
  if (!Array.isArray(docs)) return null;
  const out = [];
  const seen = new Set();
  for (const d of docs) {
    const key = String(d?.key || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 40);
    const url = String(d?.url || '').trim();
    if (!key || !url || seen.has(key)) continue;
    if (!providerOwnsDocumentUrl(providerId, url)) continue;
    seen.add(key);
    out.push({
      key,
      label: String(d.label || '').trim().slice(0, 80),
      url,
      fileName: String(d.fileName || '').trim().slice(0, 120),
      uploadedAt: d.uploadedAt ? new Date(d.uploadedAt) : new Date(),
    });
  }
  return out;
}

function applyServiceDetailsBody(provider, match, body) {
  const extra = {};
  if (body?.experience !== undefined) {
    const n = Number(body.experience);
    extra.experience = Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : 0;
  }
  if (body?.notes !== undefined) {
    extra.notes = String(body.notes || '').trim().slice(0, 1000);
  }
  if (body?.serviceInfo && typeof body.serviceInfo === 'object') {
    extra.serviceInfo = body.serviceInfo;
  }
  const docs = sanitizeServiceDocuments(provider._id, body?.documents);
  if (docs) extra.documents = docs;
  const current = qualificationForService(provider, match);
  upsertQualification(
    provider,
    match,
    current?.verificationStatus === 'rejected' ? 'rejected' : 'required',
    extra,
  );
}

/**
 * GET /api/providers/me/services/:serviceName
 */
exports.getMyServiceDetails = async (req, res, next) => {
  try {
    await connectDB();
    const provider = await Provider.findById(req.user.uid);
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Provider profile not found.',
      });
    }
    const match = findOwnedService(provider, req.params.serviceName);
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'This service is not on your profile.',
      });
    }
    const category = await ServiceCategory.findOne({
      name: new RegExp(`^${escapeRegex(match)}$`, 'i'),
    }).lean();
    const docs = provider.documents || {};
    const partnerVerificationMode = await getPartnerVerificationMode();
    res.json({
      success: true,
      data: {
        serviceName: match,
        qualification: qualificationForService(provider, match),
        requiredDocuments: documentsForCategory(category),
        identityReady: Boolean(docs.idProof),
        addressReady: Boolean(docs.addressProof),
        partnerVerificationMode,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/providers/me/services/:serviceName
 * Save service-specific draft (experience, notes, documents).
 */
exports.updateMyServiceDetails = async (req, res, next) => {
  try {
    await connectDB();
    const provider = await Provider.findById(req.user.uid);
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Provider profile not found.',
      });
    }
    const match = findOwnedService(provider, req.params.serviceName);
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'This service is not on your profile.',
      });
    }
    const current = qualificationForService(provider, match);
    if (!canEditServiceQualification(current?.verificationStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'This service information cannot be edited right now.',
      });
    }
    applyServiceDetailsBody(provider, match, req.body || {});
    provider.updatedAt = new Date();
    await provider.save();
    const saved = await maybeAutoVerifyPartner(provider, req.user.uid);
    res.json({
      success: true,
      data: await providerPayloadWithPolicy(saved),
      message: 'Service information saved.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/providers/me/services/:serviceName/submit
 */
exports.submitMyServiceForReview = async (req, res, next) => {
  try {
    await connectDB();
    const provider = await Provider.findById(req.user.uid);
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Provider profile not found.',
      });
    }
    const match = findOwnedService(provider, req.params.serviceName);
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'This service is not on your profile.',
      });
    }
    const current = qualificationForService(provider, match);
    if (!canEditServiceQualification(current?.verificationStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'This service is already under review or verified.',
      });
    }
    applyServiceDetailsBody(provider, match, req.body || {});
    const next = qualificationForService(provider, match);
    if (next?.experience == null || Number(next.experience) < 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please enter your experience for this service.',
      });
    }

    const autoMode = await isPartnerAutoVerifyEnabled();

    if (autoMode) {
      upsertQualification(provider, match, 'approved', {
        submittedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: 'auto',
        rejectionReason: '',
      });
      setInactive(provider, match, false);
      provider.updatedAt = new Date();
      await provider.save();
      const saved = await maybeAutoVerifyPartner(provider, req.user.uid);
      return res.json({
        success: true,
        data: await providerPayloadWithPolicy(saved),
        message: 'Service is verified and active for new jobs.',
      });
    }

    const category = await ServiceCategory.findOne({
      name: new RegExp(`^${escapeRegex(match)}$`, 'i'),
    }).lean();
    const required = documentsForCategory(category).filter((d) => d.required);
    const uploaded = next?.documents || [];
    const missing = required.find(
      (d) => !uploaded.some((u) => u.key === d.key && u.url),
    );
    if (missing) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please upload the required documents for this service.',
      });
    }
    upsertQualification(provider, match, 'pending', {
      submittedAt: new Date(),
      rejectionReason: '',
    });
    setInactive(provider, match, true);
    provider.updatedAt = new Date();
    await provider.save();
    res.json({
      success: true,
      data: await providerPayloadWithPolicy(provider),
      message: 'Service information submitted for review.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: add a service to an existing Partner (same account).
 * POST /api/providers/:providerId/services
 */
exports.addProviderService = async (req, res, next) => {
  try {
    await connectDB();
    const provider = await Provider.findById(req.params.providerId);
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Provider not found.',
      });
    }
    const result = await addServiceToExistingProvider(
      provider,
      req.body?.serviceName || req.body?.name,
      'admin',
    );
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }
    res.status(201).json({
      success: true,
      data: result.provider,
      message: 'Service added to this Partner.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: update verification for one professional service.
 * PUT /api/providers/:providerId/service-qualifications
 * Body: { serviceName, verificationStatus, rejectionReason? }
 */
exports.updateProviderServiceQualification = async (req, res, next) => {
  try {
    await connectDB();
    const name = String(req.body?.serviceName || req.body?.name || '').trim();
    const verificationStatus = String(req.body?.verificationStatus || '')
      .trim()
      .toLowerCase();
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Service name is required.',
      });
    }
    if (!VERIFICATION_STATUSES.includes(verificationStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Invalid verification status.',
      });
    }
    if (verificationStatus === 'rejected' && !String(req.body?.rejectionReason || '').trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please provide a reason for rejecting this service.',
      });
    }

    const provider = await Provider.findById(req.params.providerId);
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Provider not found.',
      });
    }

    const match = allServicesForProvider(provider).find(
      (s) => s.toLowerCase() === name.toLowerCase(),
    );
    if (!match) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'This service is not on the Partner profile.',
      });
    }

    upsertQualification(provider, match, verificationStatus, {
      rejectionReason: req.body?.rejectionReason,
      reviewedAt: new Date(),
      reviewedBy: req.user.uid,
    });
    if (verificationStatus !== 'approved') {
      setInactive(provider, match, true);
    }
    provider.updatedAt = new Date();
    await provider.save();

    res.json({
      success: true,
      data: provider,
      message: 'Service verification updated.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/providers/:providerId/service-profile
 * Admin updates per-service profile fields (experience, notes) without
 * changing the service verification status or other services.
 */
exports.updateProviderServiceProfile = async (req, res, next) => {
  try {
    await connectDB();
    const name = String(req.body?.serviceName || req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Service name is required.',
      });
    }

    const provider = await Provider.findById(req.params.providerId);
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Provider not found.',
      });
    }

    const match = allServicesForProvider(provider).find(
      (s) => s.toLowerCase() === name.toLowerCase(),
    );
    if (!match) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'This service is not on the Partner profile.',
      });
    }

    // Only update the profile fields — preserve verificationStatus as-is
    const list = (provider.serviceQualifications || []).map((q) => ({...q}));
    let idx = list.findIndex(
      (q) => String(q.name || '').toLowerCase() === name.toLowerCase(),
    );
    if (idx < 0) {
      list.push({name: match});
      idx = list.length - 1;
    }
    const existing = list[idx];
    const body = req.body || {};
    if (body.experience !== undefined) {
      existing.experience =
        body.experience === null || body.experience === ''
          ? undefined
          : Number(body.experience);
    }
    const nextServiceInfo =
      body.serviceInfo !== undefined
        ? String(body.serviceInfo || '')
        : body.notes !== undefined
          ? String(body.notes || '')
          : undefined;
    if (body.notes !== undefined) existing.notes = String(body.notes || '');
    if (nextServiceInfo !== undefined) {
      existing.notes = nextServiceInfo;
      existing.serviceInfo = nextServiceInfo;
    }
    existing.updatedAt = new Date();
    list[idx] = existing;
    provider.serviceQualifications = list;
    provider.updatedAt = new Date();
    await provider.save();

    res.json({
      success: true,
      data: provider,
      message: 'Service profile updated.',
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
    delete updateData.serviceQualifications;

    const existing = await Provider.findById(providerId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
        message: 'Provider not found',
      });
    }

    const incomingCats = updateData.serviceCategories;
    if (Array.isArray(incomingCats) && incomingCats.length === 1) {
      const existingNames = allServicesForProvider(existing);
      if (existingNames.length > 1) {
        delete updateData.serviceCategories;
      }
    }

    if (updateData.phone !== undefined || updateData.phoneNumber !== undefined) {
      const {syncPhoneFields} = require('../../utils/phone');
      const synced = syncPhoneFields(
        updateData.phoneNumber ?? updateData.phone,
      );
      updateData.phone = synced.phone;
      updateData.phoneNumber = synced.phoneNumber;
    }

    if (updateData.name) {
      const trimmedName = String(updateData.name).trim();
      updateData.name = trimmedName;
      updateData.displayName = trimmedName;
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

    const primaryName = String(
      updateData.serviceType || updateData.specialization || '',
    ).trim();
    if (primaryName) {
      const known = allServicesForProvider(provider);
      const match = known.find(
        (s) => s.toLowerCase() === primaryName.toLowerCase(),
      );
      if (match) {
        provider.serviceType = match;
        provider.specialization = match;
        ensureServiceOnProfile(provider, match);
      } else {
        addServiceToProvider(provider, primaryName, {source: 'admin'});
        provider.serviceType = primaryName;
        provider.specialization = primaryName;
      }
      ensureQualifications(provider);
      await provider.save();
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

    const existing = await Provider.findById(providerId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
      });
    }

    const previouslyApproved = String(existing.approvalStatus || '') === 'approved';

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

    if (approvalStatus === 'approved' && !previouslyApproved) {
      for (const name of allServicesForProvider(provider)) {
        upsertQualification(provider, name, 'approved');
      }
      provider.updatedAt = new Date();
      await provider.save();
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
    const requestedServiceName = String(
      req.body?.serviceName || req.query?.serviceName || '',
    ).trim();

    if (!requestedServiceName && !ALLOWED_DOC_KEYS.includes(docKey)) {
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

    const validated = validateDocumentBuffer(req.file.buffer, req.file.mimetype);

    if (requestedServiceName) {
      const match = allServicesForProvider(provider).find(
        (s) => s.toLowerCase() === requestedServiceName.toLowerCase(),
      );
      if (!match) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'This service is not on the Partner profile.',
        });
      }

      const category = await ServiceCategory.findOne({
        name: new RegExp(`^${escapeRegex(match)}$`, 'i'),
      }).lean();
      const allowedDocs = documentsForCategory(category);
      const allowedDoc = allowedDocs.find(
        (d) => String(d.key || '').trim() === String(docKey || '').trim(),
      );
      if (!allowedDoc) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Invalid service document key for this category.',
        });
      }

      const storageKey = buildProviderDocumentKey(
        providerId,
        serviceDocStorageKey(match, docKey),
        validated.extension,
      );
      const uploaded = await s3.uploadFile({
        body: req.file.buffer,
        key: storageKey,
        contentType: validated.contentType,
        userId: req.user?.uid,
      });

      const list = Array.isArray(provider.serviceQualifications)
        ? provider.serviceQualifications.map((q) => ({
            ...q.toObject?.(),
            ...q,
            documents: Array.isArray(q.documents)
              ? q.documents.map((d) => ({...d}))
              : [],
          }))
        : [];
      let idx = list.findIndex(
        (q) => String(q.name || '').toLowerCase() === match.toLowerCase(),
      );
      if (idx < 0) {
        list.push({name: match, documents: []});
        idx = list.length - 1;
      }
      const existing = list[idx] || {name: match, documents: []};
      const previousDoc = (existing.documents || []).find(
        (d) => String(d.key || '') === String(docKey || ''),
      );
      existing.documents = [
        ...(existing.documents || []).filter(
          (d) => String(d.key || '') !== String(docKey || ''),
        ),
        {
          key: String(docKey),
          label: allowedDoc.label || String(docKey),
          url: uploaded.url,
          fileName:
            String(req.file.originalname || '').trim() ||
            uploaded.key.split('/').pop(),
          uploadedAt: new Date(),
        },
      ];
      existing.updatedAt = new Date();
      if (!existing.serviceInfo || serviceInfoText(existing) === '') {
        existing.serviceInfo = existing.serviceInfo || '';
      }
      list[idx] = existing;
      provider.serviceQualifications = list;
      provider.updatedAt = new Date();
      await provider.save();

      if (previousDoc?.url && previousDoc.url !== uploaded.url) {
        try {
          const oldKey = keyFromUrlOrKey(previousDoc.url);
          normalizeObjectKey(oldKey);
          await s3.deleteObject(oldKey, {userId: req.user?.uid});
        } catch {
          /* ignore legacy disk URLs */
        }
      }

      return res.json({
        success: true,
        data: {
          url: uploaded.url,
          key: uploaded.key,
          contentType: uploaded.contentType,
          size: uploaded.size,
          serviceName: match,
          serviceDocuments: existing.documents,
          provider,
        },
        message: 'Service document uploaded successfully',
      });
    }

    const key = buildProviderDocumentKey(providerId, docKey, validated.extension);
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
