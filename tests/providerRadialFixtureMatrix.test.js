const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_RADIAL_RADIUS_METERS,
  RADIAL_FRESHNESS_MS,
  applyRadialEligibility,
  buildRadialGeoNearStage,
  sanitizeRadialDocument,
} = require('../src/utils/providerRadialDiscovery');
const {parseCurrentLocationInput} = require('../src/utils/currentLocation');
const {toPublicProvider} = require('../src/utils/contactAccess');

const ORIGIN = {latitude: 24.1551, longitude: 83.8072};
const NOW = new Date('2026-09-13T04:00:00.000Z');

/** Test-only expected distances. Production distance comes from Mongo $geoNear. */
function metersNorth(km) {
  return {
    latitude: ORIGIN.latitude + km / 111.32,
    longitude: ORIGIN.longitude,
  };
}

function liveLocation(coords, updatedAt, {withPoint = true} = {}) {
  const parsed = parseCurrentLocationInput(
    {latitude: coords.latitude, longitude: coords.longitude},
    updatedAt,
  );
  assert.equal(parsed.ok, true);
  if (!withPoint) {
    const {point: _ignored, ...rest} = parsed.value;
    return rest;
  }
  return parsed.value;
}

function baseProvider(id, extra) {
  return {
    _id: id,
    name: id,
    serviceType: 'Electrician',
    approvalStatus: 'approved',
    isActive: true,
    isOnline: true,
    isAvailable: true,
    ...extra,
  };
}

const fixtures = {
  A: baseProvider('geoA', {
    currentLocation: liveLocation(metersNorth(1), NOW),
  }),
  B: baseProvider('geoB', {
    currentLocation: liveLocation(metersNorth(5), NOW),
  }),
  C: baseProvider('geoC', {
    currentLocation: liveLocation(metersNorth(15), NOW),
  }),
  D: baseProvider('geoD', {
    isOnline: false,
    currentLocation: liveLocation(metersNorth(1), NOW),
  }),
  E: baseProvider('geoE', {
    currentLocation: liveLocation(
      metersNorth(1),
      new Date(NOW.getTime() - RADIAL_FRESHNESS_MS - 60_000),
    ),
  }),
  F: baseProvider('geoF', {
    currentLocation: liveLocation(metersNorth(1), NOW, {withPoint: false}),
  }),
};

function matchesEligibilityQuery(doc, query) {
  if (query.isOnline === true && doc.isOnline !== true) return false;
  const cutoff = query['currentLocation.updatedAt']?.$gte;
  if (cutoff && !(doc.currentLocation?.updatedAt >= cutoff)) return false;
  const lat = doc.currentLocation?.latitude;
  const lng = doc.currentLocation?.longitude;
  const latRange = query['currentLocation.latitude'];
  const lngRange = query['currentLocation.longitude'];
  if (latRange && (lat == null || lat < latRange.$gte || lat > latRange.$lte)) {
    return false;
  }
  if (lngRange && (lng == null || lng < lngRange.$gte || lng > lngRange.$lte)) {
    return false;
  }
  return true;
}

function hasPoint(doc) {
  const coords = doc.currentLocation?.point?.coordinates;
  return (
    doc.currentLocation?.point?.type === 'Point' &&
    Array.isArray(coords) &&
    coords.length === 2
  );
}

function approxDistanceMeters(doc) {
  const lat = doc.currentLocation.latitude;
  const dLatKm = Math.abs(lat - ORIGIN.latitude) * 111.32;
  return Math.round(dLatKm * 1000);
}

function radialHits(docs, now = NOW) {
  const query = applyRadialEligibility(
    {approvalStatus: 'approved', isActive: {$ne: false}},
    now,
  );
  const stage = buildRadialGeoNearStage(ORIGIN, query);
  const max = stage.$geoNear.maxDistance;
  return docs
    .filter((doc) => matchesEligibilityQuery(doc, query))
    .filter(hasPoint)
    .map((doc) => ({
      ...sanitizeRadialDocument({
        ...doc,
        distanceMeters: approxDistanceMeters(doc),
      }),
    }))
    .filter((doc) => doc.distanceMeters <= max)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

describe('controlled radial fixture matrix', () => {
  it('keeps Point coordinates as [longitude, latitude]', () => {
    const loc = fixtures.A.currentLocation;
    assert.equal(loc.point.coordinates[0], loc.longitude);
    assert.equal(loc.point.coordinates[1], loc.latitude);
    assert.notEqual(loc.point.coordinates[0], loc.latitude);
  });

  it('includes ~1 km and ~5 km online fresh Points, nearest first', () => {
    const hits = radialHits(Object.values(fixtures));
    assert.deepEqual(
      hits.map((d) => d._id),
      ['geoA', 'geoB'],
    );
    assert.equal(hits[0].distanceMeters < hits[1].distanceMeters, true);
    assert.equal(hits[0].distanceMeters > 500, true);
    assert.equal(hits[0].distanceMeters < 2000, true);
    assert.equal(hits[1].distanceMeters > 4000, true);
    assert.equal(hits[1].distanceMeters < 6000, true);
    assert.equal(hits[1].distanceMeters <= DEFAULT_RADIAL_RADIUS_METERS, true);
  });

  it('excludes >10 km, offline, stale, and missing Point', () => {
    const ids = radialHits(Object.values(fixtures)).map((d) => d._id);
    assert.equal(ids.includes('geoC'), false);
    assert.equal(ids.includes('geoD'), false);
    assert.equal(ids.includes('geoE'), false);
    assert.equal(ids.includes('geoF'), false);
  });

  it('public rows keep distanceMeters and hide exact coordinates', () => {
    const hits = radialHits([fixtures.A, fixtures.B]);
    const pubs = hits.map((doc) => toPublicProvider(doc));
    assert.equal(pubs[0].distanceMeters < pubs[1].distanceMeters, true);
    for (const pub of pubs) {
      assert.equal(typeof pub.distanceMeters, 'number');
      assert.equal(pub.distanceMeters >= 0, true);
      assert.equal('currentLocation' in pub, false);
      assert.equal('point' in pub, false);
      assert.equal('latitude' in (pub.location || {}), false);
      assert.equal('longitude' in (pub.location || {}), false);
    }
  });
});
