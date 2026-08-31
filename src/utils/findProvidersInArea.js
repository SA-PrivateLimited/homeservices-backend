/**
 * Find online/available providers for an open service request in the customer's area.
 * Order: district (id/name/city) → same pincode. Softened service-type matching.
 * Capped so a dense district cannot load or notify the whole catalog.
 */

const Provider = require('../models/Provider');
const {
  activeServicesForProvider,
  isServiceCustomerVisible,
} = require('./providerServiceAvailability');
const {filterOutSelfProvider} = require('./excludeSelfProvider');

/** Notify / match cap — FCM + sockets stay cheap at 100k Partners. */
const MATCH_CAP = 40;
/** Oversample before visibility filter so a page can still fill. */
const MATCH_FETCH = 80;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function serviceTypeClause(serviceType) {
  const raw = String(serviceType || '').trim();
  if (!raw) {
    return {_id: null};
  }
  const re = new RegExp(`^${escapeRegex(raw)}$`, 'i');
  return {
    $or: [
      {serviceCategories: re},
      {specialization: re},
      {serviceType: re},
      {specialty: re},
    ],
  };
}

async function findMatchingProviders(
  serviceType,
  geoClause,
  excludeUserId,
  {requireOnline = true} = {},
) {
  const selfExclude =
    excludeUserId && String(excludeUserId).trim()
      ? {_id: {$ne: String(excludeUserId).trim()}}
      : {};
  const query = {
    approvalStatus: 'approved',
    isAvailable: {$ne: false},
    isActive: {$ne: false},
    ...selfExclude,
    $and: [serviceTypeClause(serviceType), geoClause],
  };
  if (requireOnline) {
    query.isOnline = true;
  }
  const rows = await Provider.find(query)
    .select(
      '_id name fcmToken isOnline rating updatedAt location address specialization serviceType serviceCategories inactiveServiceCategories serviceQualifications',
    )
    .sort({isOnline: -1, rating: -1, updatedAt: -1})
    .limit(MATCH_FETCH)
    .lean();
  return filterOutSelfProvider(
    rows
      .filter((p) => isServiceCustomerVisible(p, serviceType))
      .slice(0, MATCH_CAP),
    excludeUserId,
  );
}

async function findByDistrict(
  serviceType,
  {districtId, district},
  excludeUserId,
  matchOptions = {},
) {
  const districtParts = [];
  if (districtId) {
    const id = String(districtId).trim();
    districtParts.push({'location.districtId': id});
    districtParts.push({'address.districtId': id});
  }
  if (district) {
    const d = String(district).trim();
    const re = new RegExp(`^${escapeRegex(d)}$`, 'i');
    districtParts.push({'location.district': re});
    districtParts.push({'location.city': re});
    districtParts.push({'address.district': re});
    districtParts.push({'address.city': re});
  }
  if (!districtParts.length) return [];
  return findMatchingProviders(
    serviceType,
    {$or: districtParts},
    excludeUserId,
    matchOptions,
  );
}

async function findByPincode(
  serviceType,
  pincode,
  excludeUserId,
  matchOptions = {},
) {
  if (!pincode) return [];
  const pin = String(pincode).trim();
  return findMatchingProviders(
    serviceType,
    {
      $or: [{'location.pincode': pin}, {'address.pincode': pin}],
    },
    excludeUserId,
    matchOptions,
  );
}

/**
 * @returns {{providers: Array, matchBy: 'district'|'pincode'|'none'}}
 */
async function findProvidersInArea(
  serviceType,
  customerAddress = {},
  options = {},
) {
  const excludeUserId = options.excludeUserId || options.customerUserId || null;
  const {
    isOfflineOpenRequestsEnabled,
  } = require('../services/providerOpenRequestPolicyService');
  const includeOffline =
    options.includeOffline === true ||
    (options.includeOffline !== false &&
      (await isOfflineOpenRequestsEnabled()));
  const matchOptions = {requireOnline: !includeOffline};
  const districtId = customerAddress.districtId || customerAddress.district_id;
  const district =
    customerAddress.district ||
    customerAddress.districtName ||
    customerAddress.city ||
    null;
  const pincode = customerAddress.pincode;

  if (districtId || district) {
    const byDistrict = await findByDistrict(
      serviceType,
      {districtId, district},
      excludeUserId,
      matchOptions,
    );
    if (byDistrict.length > 0) {
      return {providers: byDistrict, matchBy: 'district'};
    }
  }

  if (pincode) {
    const byPin = await findByPincode(
      serviceType,
      pincode,
      excludeUserId,
      matchOptions,
    );
    if (byPin.length > 0) {
      return {providers: byPin, matchBy: 'pincode'};
    }
  }

  return {providers: [], matchBy: 'none'};
}

/**
 * Nearby open (unassigned) pending requests for an online provider to poll.
 */
async function findNearbyOpenPendingForProvider(provider) {
  const ServiceRequest = require('../models/ServiceRequest');
  const activeTypes = activeServicesForProvider(provider);
  if (!activeTypes.length) return [];

  const districtId =
    provider.location?.districtId || provider.address?.districtId;
  const district =
    provider.location?.district ||
    provider.location?.city ||
    provider.address?.district ||
    provider.address?.city;
  const pincode = provider.location?.pincode || provider.address?.pincode;

  const geoOr = [];
  if (districtId) {
    geoOr.push({'customerAddress.districtId': String(districtId)});
  }
  if (district) {
    const re = new RegExp(`^${escapeRegex(String(district).trim())}$`, 'i');
    geoOr.push({'customerAddress.district': re});
    geoOr.push({'customerAddress.city': re});
  }
  if (pincode) {
    geoOr.push({'customerAddress.pincode': String(pincode).trim()});
  }
  if (!geoOr.length) return [];

  const typeOr = activeTypes.map((s) => ({
    serviceType: new RegExp(`^${escapeRegex(String(s).trim())}$`, 'i'),
  }));

  return ServiceRequest.find({
    status: 'pending',
    $and: [
      {
        $or: [
          {providerId: {$exists: false}},
          {providerId: null},
          {providerId: ''},
        ],
      },
      {$or: typeOr},
      {$or: geoOr},
      {
        $nor: [{'declinedProviders.providerId': String(provider._id)}],
      },
    ],
  })
    .sort({createdAt: -1})
    .limit(10)
    .lean();
}

function providerIdsFromList(providers) {
  const seen = new Set();
  const ids = [];
  for (const p of providers || []) {
    const id = String(p?._id || p?.id || p || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

module.exports = {
  MATCH_CAP,
  findProvidersInArea,
  findNearbyOpenPendingForProvider,
  providerIdsFromList,
};
