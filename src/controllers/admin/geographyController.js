/**
 * Geography Controller (Admin)
 * States → Districts → Providers with job/review stats
 */

const State = require('../../models/State');
const District = require('../../models/District');
const Provider = require('../../models/Provider');
const JobCard = require('../../models/JobCard');
const User = require('../../models/User');
const {ensureGeographySeeded} = require('../../utils/geographySeed');
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

    const providers = await Provider.find({
      isActive: {$ne: false},
      $or: [
        {'location.stateId': {$exists: true, $ne: ''}},
        {'location.state': {$exists: true, $ne: ''}},
      ],
    })
      .select('_id location.stateId location.state rating totalReviews')
      .lean();

    const byStateId = new Map();
    const byStateName = new Map();
    for (const p of providers) {
      const sid = (p.location?.stateId || '').trim();
      const sname = (p.location?.state || '').trim().toLowerCase();
      if (sid) {
        if (!byStateId.has(sid)) byStateId.set(sid, []);
        byStateId.get(sid).push(p);
      }
      if (sname) {
        if (!byStateName.has(sname)) byStateName.set(sname, []);
        byStateName.get(sname).push(p);
      }
    }

    const data = [];
    for (const state of states) {
      const fromId = byStateId.get(state._id) || [];
      const fromName = byStateName.get(String(state.name).toLowerCase()) || [];
      const seen = new Set();
      const group = [];
      for (const p of [...fromId, ...fromName]) {
        if (seen.has(p._id)) continue;
        seen.add(p._id);
        group.push(p);
      }
      const ids = group.map((p) => p._id);
      const jobStats = await jobStatsForProviderIds(ids);
      data.push({
        _id: state._id,
        name: state.name,
        code: state.code || '',
        providerCount: group.length,
        avgRating: avgRating(group),
        totalReviews: totalReviewsSum(group),
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        jobStats,
      });
    }

    // Unassigned bucket (providers without state)
    const assignedIds = new Set();
    for (const list of byStateId.values()) {
      list.forEach((p) => assignedIds.add(p._id));
    }
    for (const list of byStateName.values()) {
      list.forEach((p) => assignedIds.add(p._id));
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

    const providers = await Provider.find({
      isActive: {$ne: false},
      $or: [
        {'location.stateId': stateId},
        {'location.state': new RegExp(`^${escapeRegex(state.name)}$`, 'i')},
      ],
    })
      .select(
        '_id location.districtId location.district location.city rating totalReviews serviceType specialization serviceCategories',
      )
      .lean();

    const byDistrictId = new Map();
    const byDistrictName = new Map();
    for (const p of providers) {
      const did = (p.location?.districtId || '').trim();
      const dname = (
        p.location?.district ||
        p.location?.city ||
        ''
      )
        .trim()
        .toLowerCase();
      if (did) {
        if (!byDistrictId.has(did)) byDistrictId.set(did, []);
        byDistrictId.get(did).push(p);
      }
      if (dname) {
        if (!byDistrictName.has(dname)) byDistrictName.set(dname, []);
        byDistrictName.get(dname).push(p);
      }
    }

    const data = [];
    for (const district of districts) {
      const fromId = byDistrictId.get(district._id) || [];
      const fromName =
        byDistrictName.get(String(district.name).toLowerCase()) || [];
      const seen = new Set();
      const group = [];
      for (const p of [...fromId, ...fromName]) {
        if (seen.has(p._id)) continue;
        seen.add(p._id);
        group.push(p);
      }
      const ids = group.map((p) => p._id);
      const jobStats = await jobStatsForProviderIds(ids);
      data.push({
        _id: district._id,
        name: district.name,
        stateId: district.stateId,
        stateName: district.stateName || state.name,
        providerCount: group.length,
        serviceBreakdown: serviceMembershipBreakdown(group),
        avgRating: avgRating(group),
        totalReviews: totalReviewsSum(group),
        createdAt: district.createdAt,
        updatedAt: district.updatedAt,
        jobStats,
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

    const providers = await Provider.find({
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
    })
      .sort(ADMIN_LIST_SORT)
      .lean();

    const data = [];
    for (const p of providers) {
      const jobStats = await jobStatsForProviderIds([p._id]);
      data.push({
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
      });
    }

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
    if (metaCache) {
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
    metaCache = {states, districts};
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
