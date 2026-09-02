/**
 * Geography Controller (Admin)
 * States → Districts → Providers with job/review stats
 */

const State = require('../../models/State');
const District = require('../../models/District');
const Block = require('../../models/Block');
const Provider = require('../../models/Provider');
const JobCard = require('../../models/JobCard');
const User = require('../../models/User');
const {ensureGeographySeeded} = require('../../utils/geographySeed');
const {parseAdminOnboardingSource} = require('../../utils/onboardingSource');
const {syncPhoneFields} = require('../../utils/phone');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ADMIN_LIST_SORT = require('../../utils/adminListSort');
const {
  summarizePartnerServices,
  serviceMembershipBreakdown,
} = require('../../utils/providerServiceAvailability');
const {
  resolveGeographyFromCoords,
} = require('../../utils/resolveGeographyFromCoords');

const PASSWORD_SALT_ROUNDS = 10;

/** In-memory snapshot for GET meta — invalidated via invalidateGeographyMetaCache() */
let metaCache = null;

function invalidateGeographyMetaCache() {
  metaCache = null;
}

exports.invalidateGeographyMetaCache = invalidateGeographyMetaCache;

function emptyJobStats() {
  return {
    totalJobs: 0,
    pending: 0,
    accepted: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
  };
}

async function jobStatsForProviderIds(providerIds) {
  const stats = emptyJobStats();
  if (!providerIds.length) return stats;

  const rows = await JobCard.aggregate([
    {$match: {providerId: {$in: providerIds}}},
    {$group: {_id: '$status', count: {$sum: 1}}},
  ]);

  for (const row of rows) {
    const status = row._id || '';
    const n = row.count || 0;
    stats.totalJobs += n;
    if (status === 'pending' || status === 'unassigned') stats.pending += n;
    else if (status === 'accepted') stats.accepted += n;
    else if (status === 'in-progress') stats.inProgress += n;
    else if (status === 'completed') stats.completed += n;
    else if (status === 'cancelled') stats.cancelled += n;
  }
  return stats;
}

function avgRating(providers) {
  const withRating = providers.filter(
    (p) => typeof p.rating === 'number' && (p.totalReviews || 0) > 0,
  );
  if (!withRating.length) {
    const any = providers.filter((p) => typeof p.rating === 'number' && p.rating > 0);
    if (!any.length) return 0;
    return (
      Math.round(
        (any.reduce((s, p) => s + p.rating, 0) / any.length) * 10,
      ) / 10
    );
  }
  return (
    Math.round(
      (withRating.reduce((s, p) => s + p.rating, 0) / withRating.length) * 10,
    ) / 10
  );
}

function totalReviewsSum(providers) {
  return providers.reduce((s, p) => s + (p.totalReviews || 0), 0);
}

/**
 * GET /api/admin/geography/states
 */
exports.listStates = async (req, res, next) => {
  try {
    await ensureGeographySeeded();

    const states = await State.find({isActive: {$ne: false}})
      .sort(ADMIN_LIST_SORT)
      .lean();

    const grouped = await Provider.aggregate([
      {$match: {isActive: {$ne: false}}},
      {
        $group: {
          _id: '$location.stateId',
          providerCount: {$sum: 1},
          avgRating: {$avg: '$rating'},
          totalReviews: {$sum: {$ifNull: ['$totalReviews', 0]}},
        },
      },
    ]);
    const byStateId = new Map(
      grouped
        .filter((row) => row._id)
        .map((row) => [String(row._id), row]),
    );

    const data = [];
    for (const state of states) {
      const row = byStateId.get(String(state._id)) || {};
      data.push({
        _id: state._id,
        name: state.name,
        code: state.code || '',
        providerCount: row.providerCount || 0,
        avgRating: row.avgRating
          ? Math.round(row.avgRating * 10) / 10
          : 0,
        totalReviews: row.totalReviews || 0,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        jobStats: emptyJobStats(),
      });
    }

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/geography/states/:stateId/districts
 */
exports.listDistrictsByState = async (req, res, next) => {
  try {
    await ensureGeographySeeded();
    const {stateId} = req.params;

    const state = await State.findById(stateId).lean();
    if (!state) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'State not found',
      });
    }

    const districts = await District.find({
      stateId,
      isActive: {$ne: false},
    })
      .sort(ADMIN_LIST_SORT)
      .lean();

    const grouped = await Provider.aggregate([
      {
        $match: {
          isActive: {$ne: false},
          $or: [
            {'location.stateId': stateId},
            {
              'location.state': new RegExp(
                `^${escapeRegex(state.name)}$`,
                'i',
              ),
            },
          ],
        },
      },
      {
        $group: {
          _id: '$location.districtId',
          providerCount: {$sum: 1},
          avgRating: {$avg: '$rating'},
          totalReviews: {$sum: {$ifNull: ['$totalReviews', 0]}},
        },
      },
    ]);
    const byDistrictId = new Map(
      grouped
        .filter((row) => row._id)
        .map((row) => [String(row._id), row]),
    );

    const data = [];
    for (const district of districts) {
      const row = byDistrictId.get(String(district._id)) || {};
      data.push({
        _id: district._id,
        name: district.name,
        stateId: district.stateId,
        stateName: district.stateName || state.name,
        providerCount: row.providerCount || 0,
        serviceBreakdown: [],
        avgRating: row.avgRating
          ? Math.round(row.avgRating * 10) / 10
          : 0,
        totalReviews: row.totalReviews || 0,
        createdAt: district.createdAt,
        updatedAt: district.updatedAt,
        jobStats: emptyJobStats(),
      });
    }

    res.json({
      success: true,
      data: {
        districts: data,
        state: {_id: state._id, name: state.name, code: state.code || ''},
      },
      count: data.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/geography/districts/:districtId/providers
 */
exports.listProvidersByDistrict = async (req, res, next) => {
  try {
    await ensureGeographySeeded();
    const {districtId} = req.params;

    const district = await District.findById(districtId).lean();
    if (!district) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'District not found',
      });
    }

    const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const off = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const filter = {
      isActive: {$ne: false},
      $or: [
        {'location.districtId': districtId},
        {
          $and: [
            {
              'location.district': new RegExp(
                `^${escapeRegex(district.name)}$`,
                'i',
              ),
            },
            {
              $or: [
                {'location.stateId': district.stateId},
                {
                  'location.state': new RegExp(
                    `^${escapeRegex(district.stateName)}$`,
                    'i',
                  ),
                },
              ],
            },
          ],
        },
      ],
    };

    const [providers, total] = await Promise.all([
      Provider.find(filter).sort(ADMIN_LIST_SORT).limit(lim).skip(off).lean(),
      Provider.countDocuments(filter),
    ]);

    const pageIds = providers.map((p) => p._id);
    const jobStats = await jobStatsForProviderIds(pageIds);

    const data = providers.map((p) => ({
      _id: p._id,
      name: p.businessName || p.name || p.displayName || 'Provider',
      phone: p.phone || p.phoneNumber || '',
      serviceType: p.serviceType || p.specialization || '',
      services: summarizePartnerServices(p),
      approvalStatus: p.approvalStatus || 'pending',
      rating: p.rating || 0,
      totalReviews: p.totalReviews || 0,
      location: p.location || {},
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      jobStats,
    }));

    res.json({
      success: true,
      data: {
        providers: data,
        serviceBreakdown: serviceMembershipBreakdown(providers),
        district: {
          _id: district._id,
          name: district.name,
          stateId: district.stateId,
          stateName: district.stateName,
          pincode: district.pincode || '',
        },
      },
      count: data.length,
      total,
      limit: lim,
      offset: off,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/geography/districts/:districtId/providers
 * Body: { providerId } to assign existing
 *    or { name, phone, serviceType, address?, pincode?, experience?, rating? } to create
 */
exports.addProviderToDistrict = async (req, res, next) => {
  try {
    await ensureGeographySeeded();
    const {districtId} = req.params;
    const district = await District.findById(districtId).lean();
    if (!district) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'District not found',
      });
    }

    const state = await State.findById(district.stateId).lean();
    const stateName = district.stateName || state?.name || '';

    const locationPatch = {
      state: stateName,
      stateId: district.stateId,
      district: district.name,
      districtId: district._id,
      city: district.name,
    };

    const districtAddress = [district.name, stateName].filter(Boolean).join(', ');
    const districtPincode = String(district.pincode || '').trim() || undefined;

    // Assign existing
    if (req.body.providerId) {
      const providerId = String(req.body.providerId).trim();
      const provider = await Provider.findById(providerId);
      if (!provider) {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Provider not found',
        });
      }

      const bodyAddress = String(req.body.address || '').trim();
      const bodyPincode = String(req.body.pincode || '').trim();

      // Replace location with this district (do not keep the previous address/city/pin)
      provider.location = {
        ...locationPatch,
        address: bodyAddress || districtAddress,
        pincode: bodyPincode || districtPincode,
        country: 'IN',
      };
      provider.updatedAt = new Date();
      await provider.save({validateBeforeSave: false});

      const savedLoc =
        provider.location && typeof provider.location.toObject === 'function'
          ? provider.location.toObject()
          : provider.location || {};

      try {
        await User.findByIdAndUpdate(providerId, {
          $set: {
            location: {
              ...savedLoc,
              country: 'IN',
            },
            updatedAt: new Date(),
          },
        });
      } catch (_) {
        // non-fatal
      }

      return res.json({
        success: true,
        data: provider.toObject(),
        message: 'Provider assigned to district',
      });
    }

    // Create new
    const name = (req.body.name || '').trim();
    const phoneRaw = req.body.phone || req.body.phoneNumber || '';
    const synced = syncPhoneFields(phoneRaw);
    const serviceType = (req.body.serviceType || '').trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'name is required',
      });
    }
    if (!synced.phoneNumber && !synced.phone) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'phone is required',
      });
    }

    const _id = crypto.randomUUID();
    const location = {
      ...locationPatch,
      address: (req.body.address || '').trim() || undefined,
      pincode:
        String(req.body.pincode || '').trim() ||
        district.pincode ||
        undefined,
      country: 'IN',
    };

    const experience =
      req.body.experience != null && req.body.experience !== ''
        ? Number(req.body.experience)
        : undefined;
    const rating =
      req.body.rating != null && req.body.rating !== ''
        ? Number(req.body.rating)
        : 0;

    const userDoc = {
      _id,
      role: 'provider',
      name,
      displayName: name,
      phone: synced.phone || undefined,
      phoneNumber: synced.phoneNumber || synced.phone || undefined,
      phoneVerified: req.body.phoneVerified === true,
      location,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (req.body.password) {
      userDoc.passwordHash = await bcrypt.hash(
        String(req.body.password),
        PASSWORD_SALT_ROUNDS,
      );
    }

    await User.create(userDoc);

    const provider = await Provider.create({
      _id,
      name,
      displayName: name,
      phone: synced.phone || undefined,
      phoneNumber: synced.phoneNumber || synced.phone || undefined,
      phoneVerified: req.body.phoneVerified === true,
      serviceType: serviceType || undefined,
      specialization: serviceType || undefined,
      serviceCategories: serviceType ? [serviceType] : [],
      serviceQualifications: serviceType
        ? [
            {
              name: serviceType,
              verificationStatus: 'approved',
              updatedAt: new Date(),
            },
          ]
        : [],
      experience: Number.isFinite(experience) ? experience : undefined,
      rating: Number.isFinite(rating) ? rating : 0,
      location,
      approvalStatus: 'approved',
      verified: true,
      approvedAt: new Date(),
      isActive: true,
      onboardingSource: parseAdminOnboardingSource(
        req.body.onboardingSource,
      ),
      addedByAdminId: req.user?.uid || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      data: provider.toObject(),
      message: 'Provider created in district',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/geography/meta — flat lists for dropdowns
 */
exports.getGeographyMeta = async (req, res, next) => {
  try {
    await ensureGeographySeeded();
    // Rebuild when cache predates blocks support or was populated before block seed.
    if (metaCache && !Array.isArray(metaCache.blocks)) {
      metaCache = null;
    }
    if (metaCache) {
      // Blocks are ops-seeded; refresh on each meta read so a running server
      // picks up new blocks without restart.
      metaCache.blocks = await Block.find({isActive: {$ne: false}})
        .sort({stateName: 1, districtName: 1, name: 1})
        .select('_id name districtId districtName stateId stateName')
        .lean();
      return res.json({
        success: true,
        data: metaCache,
      });
    }
    const states = await State.find({isActive: {$ne: false}})
      .sort({name: 1})
      .select('_id name code')
      .lean();
    const districts = await District.find({isActive: {$ne: false}})
      .sort({stateName: 1, name: 1})
      .select('_id name stateId stateName pincode')
      .lean();
    const blocks = await Block.find({isActive: {$ne: false}})
      .sort({stateName: 1, districtName: 1, name: 1})
      .select('_id name districtId districtName stateId stateName')
      .lean();
    metaCache = {states, districts, blocks};
    res.json({
      success: true,
      data: metaCache,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resolve GPS coordinates to Akanso state/district (public — server-side geocode).
 */
exports.resolveLocationFromCoordinates = async (req, res, next) => {
  try {
    const {lat, lon} = req.query;
    const resolved = await resolveGeographyFromCoords(lat, lon);
    res.json({success: true, data: resolved});
  } catch (error) {
    const code = error?.code || 'unavailable';
    if (code === 'invalid') {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates',
        code: 'invalid',
      });
    }
    if (code === 'nomatch') {
      return res.status(404).json({
        success: false,
        error: 'Could not match your location to a supported area',
        code: 'nomatch',
      });
    }
    if (code === 'geocode') {
      return res.status(502).json({
        success: false,
        error: 'Location lookup failed',
        code: 'geocode',
      });
    }
    next(error);
  }
};

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
