/**
 * Server-side radial discovery helpers for GET /providers.
 * Uses Provider.currentLocation.point (GeoJSON [longitude, latitude]).
 * Does not invent coordinates from District / Block / PIN / Nominatim.
 */

const {parseCoord} = require('./currentLocation');

const DEFAULT_RADIAL_RADIUS_METERS = 10_000;
const RADIAL_FRESHNESS_MS = 5 * 60 * 1000;
/** Mean Earth radius used by MongoDB $centerSphere (meters). */
const EARTH_RADIUS_METERS = 6_378_100;

function queryValuePresent(value) {
  if (value == null) return false;
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw).trim() !== '';
}

function firstQueryValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw;
}

/**
 * Parse additive discovery origin from GET /providers query.
 * Absent both latitude and longitude → administrative mode.
 * One present, non-numeric, or out of range → validation error.
 *
 * @param {Record<string, unknown>} query
 * @returns {{ok: true, origin: null | {latitude: number, longitude: number}} | {ok: false, message: string}}
 */
function parseDiscoveryOrigin(query = {}) {
  const src = query && typeof query === 'object' ? query : {};
  const hasLat = queryValuePresent(src.latitude);
  const hasLng = queryValuePresent(src.longitude);
  if (!hasLat && !hasLng) {
    return {ok: true, origin: null};
  }
  if (!hasLat || !hasLng) {
    return {
      ok: false,
      message: 'latitude and longitude are both required for nearby search.',
    };
  }

  const latitude = parseCoord(firstQueryValue(src.latitude));
  const longitude = parseCoord(firstQueryValue(src.longitude));
  if (latitude == null || longitude == null) {
    return {
      ok: false,
      message: 'latitude and longitude must be valid numbers.',
    };
  }
  if (latitude < -90 || latitude > 90) {
    return {ok: false, message: 'latitude must be between -90 and 90.'};
  }
  if (longitude < -180 || longitude > 180) {
    return {ok: false, message: 'longitude must be between -180 and 180.'};
  }

  return {ok: true, origin: {latitude, longitude}};
}

function radialEligibilityFields(now = new Date()) {
  const cutoff = new Date(now.getTime() - RADIAL_FRESHNESS_MS);
  return {
    isOnline: true,
    'currentLocation.updatedAt': {$gte: cutoff},
    'currentLocation.latitude': {$gte: -90, $lte: 90},
    'currentLocation.longitude': {$gte: -180, $lte: 180},
  };
}

function radialNearFilter(origin) {
  return {
    'currentLocation.point': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [origin.longitude, origin.latitude],
        },
        $maxDistance: DEFAULT_RADIAL_RADIUS_METERS,
      },
    },
  };
}

function radialWithinFilter(origin) {
  return {
    'currentLocation.point': {
      $geoWithin: {
        $centerSphere: [
          [origin.longitude, origin.latitude],
          DEFAULT_RADIAL_RADIUS_METERS / EARTH_RADIUS_METERS,
        ],
      },
    },
  };
}

function cloneDiscoveryQuery(query) {
  const cloned = {...query};
  if (Array.isArray(query.$and)) {
    cloned.$and = query.$and.map((clause) => ({...clause}));
  }
  return cloned;
}

/**
 * Live-GPS eligibility only — no geospatial operator.
 * Used with $geoNear so Mongo can return distanceMeters.
 */
function applyRadialEligibility(query, now = new Date()) {
  Object.assign(query, radialEligibilityFields(now));
  return query;
}

/**
 * @deprecated Prefer applyRadialEligibility + buildRadialGeoNearStage.
 * Kept as eligibility + $near for older unit fixtures.
 */
function applyRadialDiscovery(query, origin, now = new Date()) {
  return Object.assign(
    applyRadialEligibility(query, now),
    radialNearFilter(origin),
  );
}

function buildRadialGeoNearStage(origin, matchQuery) {
  return {
    $geoNear: {
      near: {
        type: 'Point',
        coordinates: [origin.longitude, origin.latitude],
      },
      distanceField: 'distanceMeters',
      maxDistance: DEFAULT_RADIAL_RADIUS_METERS,
      spherical: true,
      key: 'currentLocation.point',
      query: matchQuery,
    },
  };
}

function excludeSelectToProject(selectStr) {
  const project = {};
  for (const token of String(selectStr || '').split(/\s+/).filter(Boolean)) {
    if (token.startsWith('-')) project[token.slice(1)] = 0;
  }
  return project;
}

function publicDistanceMeters(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.round(value);
}

/** Strip live GPS and keep a rounded public distanceMeters. */
function sanitizeRadialDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const out = {...doc};
  delete out.currentLocation;
  delete out.loc;
  const meters = publicDistanceMeters(out.distanceMeters);
  if (meters == null) delete out.distanceMeters;
  else out.distanceMeters = meters;
  return out;
}

function discoveryModeForOrigin(origin) {
  return origin ? 'radial' : 'administrative';
}

/**
 * Count-safe clone: $near cannot be used with countDocuments.
 * Same 10 km circle via $geoWithin + $centerSphere (2dsphere).
 */
function radialCountQuery(listQuery, origin) {
  const cloned = cloneDiscoveryQuery(listQuery);
  Object.assign(cloned, radialWithinFilter(origin));
  return cloned;
}

function usesDistanceSort(origin) {
  return Boolean(origin);
}

module.exports = {
  DEFAULT_RADIAL_RADIUS_METERS,
  RADIAL_FRESHNESS_MS,
  EARTH_RADIUS_METERS,
  parseDiscoveryOrigin,
  radialEligibilityFields,
  radialNearFilter,
  radialWithinFilter,
  applyRadialEligibility,
  applyRadialDiscovery,
  buildRadialGeoNearStage,
  excludeSelectToProject,
  publicDistanceMeters,
  sanitizeRadialDocument,
  discoveryModeForOrigin,
  radialCountQuery,
  usesDistanceSort,
};
