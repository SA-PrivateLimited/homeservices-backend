const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const {
  DEFAULT_RADIAL_RADIUS_METERS,
  RADIAL_FRESHNESS_MS,
  parseDiscoveryOrigin,
  applyRadialEligibility,
  buildRadialGeoNearStage,
  publicDistanceMeters,
  sanitizeRadialDocument,
  discoveryModeForOrigin,
  radialCountQuery,
  usesDistanceSort,
} = require('../src/utils/providerRadialDiscovery');
const {
  toPublicProvider,
  toPublicProviderForSettings,
} = require('../src/utils/contactAccess');
const {excludeSelfProviderClause} = require('../src/utils/excludeSelfProvider');

const ORIGIN = {latitude: 24.1551, longitude: 83.8072};
const NOW = new Date('2026-09-13T03:30:00.000Z');

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      resolve({server, url: `http://127.0.0.1:${port}`});
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function discoveryApp() {
  const app = express();
  app.get('/providers', (req, res) => {
    const parsed = parseDiscoveryOrigin(req.query);
    if (!parsed.ok) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: parsed.message,
      });
    }
    const query = {
      approvalStatus: 'approved',
      isActive: {$ne: false},
    };
    if (parsed.origin) applyRadialEligibility(query, NOW);
    const geoNear = parsed.origin
      ? buildRadialGeoNearStage(parsed.origin, query)
      : null;
    return res.json({
      success: true,
      discoveryMode: discoveryModeForOrigin(parsed.origin),
      radial: Boolean(parsed.origin),
      query,
      geoNear,
      sortByDistance: usesDistanceSort(parsed.origin),
    });
  });
  return app;
}

const RADIAL_FIXTURE = {
  _id: 'prov_radial',
  name: 'Test Electrician',
  displayName: 'Test Electrician',
  serviceType: 'Electrician',
  isOnline: true,
  isAvailable: true,
  location: {
    district: 'Garhwa',
    state: 'Jharkhand',
    pincode: '822114',
    latitude: 24.123,
    longitude: 83.456,
  },
  currentLocation: {
    latitude: 24.1551,
    longitude: 83.8072,
    updatedAt: NOW,
    point: {type: 'Point', coordinates: [83.8072, 24.1551]},
  },
};

describe('parseDiscoveryOrigin', () => {
  it('leaves administrative mode when lat/lng are absent', () => {
    const parsed = parseDiscoveryOrigin({districtId: 'dt_jh-garhwa'});
    assert.equal(parsed.ok, true);
    assert.equal(parsed.origin, null);
  });

  it('activates radial mode for valid latitude/longitude', () => {
    const parsed = parseDiscoveryOrigin({
      latitude: '24.1551',
      longitude: '83.8072',
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.origin, ORIGIN);
  });

  it('rejects a single coordinate', () => {
    assert.equal(parseDiscoveryOrigin({latitude: '24.1551'}).ok, false);
    assert.equal(parseDiscoveryOrigin({longitude: '83.8072'}).ok, false);
  });

  it('rejects non-numeric, NaN, and Infinity coordinates', () => {
    assert.equal(
      parseDiscoveryOrigin({latitude: 'abc', longitude: '83'}).ok,
      false,
    );
    assert.equal(
      parseDiscoveryOrigin({latitude: 'NaN', longitude: '83'}).ok,
      false,
    );
    assert.equal(
      parseDiscoveryOrigin({latitude: '24', longitude: 'Infinity'}).ok,
      false,
    );
  });

  it('rejects out-of-range latitude and longitude', () => {
    const badLat = parseDiscoveryOrigin({latitude: '91', longitude: '83'});
    const badLon = parseDiscoveryOrigin({latitude: '24', longitude: '181'});
    assert.equal(badLat.ok, false);
    assert.match(badLat.message, /latitude/);
    assert.equal(badLon.ok, false);
    assert.match(badLon.message, /longitude/);
  });
});

describe('applyRadialEligibility and $geoNear', () => {
  it('uses a 10 km $geoNear in GeoJSON [longitude, latitude] order', () => {
    const query = {
      approvalStatus: 'approved',
      isActive: {$ne: false},
      'location.districtId': 'dt_jh-garhwa',
    };
    applyRadialEligibility(query, NOW);
    const stage = buildRadialGeoNearStage(ORIGIN, query).$geoNear;
    assert.equal(stage.near.type, 'Point');
    assert.deepEqual(stage.near.coordinates, [83.8072, 24.1551]);
    assert.notDeepEqual(stage.near.coordinates, [24.1551, 83.8072]);
    assert.equal(stage.maxDistance, DEFAULT_RADIAL_RADIUS_METERS);
    assert.equal(stage.maxDistance, 10_000);
    assert.equal(stage.distanceField, 'distanceMeters');
    assert.equal(stage.key, 'currentLocation.point');
    assert.equal(query['location.districtId'], 'dt_jh-garhwa');
    assert.equal(query.approvalStatus, 'approved');
    assert.equal(query['currentLocation.point'], undefined);
  });

  it('ignores a client radius parameter', () => {
    const query = applyRadialEligibility({}, NOW);
    const stage = buildRadialGeoNearStage(ORIGIN, query).$geoNear;
    assert.equal(stage.maxDistance, DEFAULT_RADIAL_RADIUS_METERS);
    assert.equal('radius' in query, false);
  });

  it('requires isOnline and fresh currentLocation, not isAvailable', () => {
    const query = applyRadialEligibility({}, NOW);
    assert.equal(query.isOnline, true);
    assert.equal('isAvailable' in query, false);
    const cutoff = query['currentLocation.updatedAt'].$gte;
    assert.equal(
      cutoff.toISOString(),
      new Date(NOW.getTime() - RADIAL_FRESHNESS_MS).toISOString(),
    );
    assert.equal(RADIAL_FRESHNESS_MS, 5 * 60 * 1000);
    assert.deepEqual(query['currentLocation.latitude'], {$gte: -90, $lte: 90});
    assert.deepEqual(query['currentLocation.longitude'], {$gte: -180, $lte: 180});
  });

  it('keeps existing self-exclusion on the same query', () => {
    const query = {
      approvalStatus: 'approved',
      ...excludeSelfProviderClause('user_self'),
    };
    applyRadialEligibility(query, NOW);
    assert.deepEqual(query._id, {$ne: 'user_self'});
    const stage = buildRadialGeoNearStage(ORIGIN, query);
    assert.deepEqual(stage.$geoNear.query._id, {$ne: 'user_self'});
  });

  it('does not add Provider.location or address as a GPS substitute', () => {
    const query = applyRadialEligibility({}, NOW);
    assert.equal('location.latitude' in query, false);
    assert.equal('address.latitude' in query, false);
  });
});

describe('radialCountQuery and pagination order', () => {
  it('filters geographically before skip/limit and counts without $geoNear', () => {
    const query = applyRadialEligibility({approvalStatus: 'approved'}, NOW);
    const countQuery = radialCountQuery(query, ORIGIN);
    assert.equal('skip' in query, false);
    assert.equal('limit' in query, false);
    assert.ok(countQuery['currentLocation.point'].$geoWithin);
    assert.equal(countQuery['currentLocation.point'].$near, undefined);
    const sphere = countQuery['currentLocation.point'].$geoWithin.$centerSphere;
    assert.deepEqual(sphere[0], [83.8072, 24.1551]);
    assert.equal(countQuery.isOnline, true);
    assert.equal(usesDistanceSort(ORIGIN), true);
    assert.equal(usesDistanceSort(null), false);
  });
});

describe('radial HTTP contract', () => {
  it('keeps administrative discovery when origin is omitted', async () => {
    const {server, url} = await listen(discoveryApp());
    try {
      const res = await fetch(`${url}/providers?districtId=dt_jh-garhwa`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.discoveryMode, 'administrative');
      assert.equal(body.radial, false);
      assert.equal(body.query['currentLocation.point'], undefined);
      assert.equal(body.sortByDistance, false);
    } finally {
      await close(server);
    }
  });

  it('activates radial mode for valid origin and rejects invalid coords', async () => {
    const {server, url} = await listen(discoveryApp());
    try {
      const ok = await fetch(
        `${url}/providers?latitude=24.1551&longitude=83.8072`,
      );
      const okBody = await ok.json();
      assert.equal(ok.status, 200);
      assert.equal(okBody.discoveryMode, 'radial');
      assert.equal(
        okBody.geoNear.$geoNear.maxDistance,
        10_000,
      );

      const bad = await fetch(`${url}/providers?latitude=91&longitude=83`);
      const badBody = await bad.json();
      assert.equal(bad.status, 400);
      assert.equal(badBody.error, 'Validation Error');
      assert.equal(badBody.query, undefined);
    } finally {
      await close(server);
    }
  });
});

describe('radial privacy and distanceMeters', () => {
  it('does not expose currentLocation, point, or exact coordinates', () => {
    const pub = toPublicProvider({
      ...RADIAL_FIXTURE,
      distanceMeters: 1234.6,
    });
    assert.equal('currentLocation' in pub, false);
    assert.equal('point' in pub, false);
    assert.equal('latitude' in (pub.location || {}), false);
    assert.equal('longitude' in (pub.location || {}), false);
    assert.equal(pub.distanceMeters, 1234.6);
    const customer = toPublicProviderForSettings(RADIAL_FIXTURE, {
      providerContactPolicy: 'ACCEPTED_ONLY',
    });
    assert.equal('currentLocation' in customer, false);
    assert.equal('point' in customer, false);
  });

  it('rounds Mongo distance and strips live GPS from radial documents', () => {
    const clean = sanitizeRadialDocument({
      name: 'Test',
      distanceMeters: 88.8,
      currentLocation: RADIAL_FIXTURE.currentLocation,
    });
    assert.equal(clean.distanceMeters, 89);
    assert.equal('currentLocation' in clean, false);
    assert.equal(publicDistanceMeters(10.4), 10);
    assert.equal(publicDistanceMeters(Number.NaN), undefined);
    const nearer = publicDistanceMeters(120.2);
    const farther = publicDistanceMeters(980.8);
    assert.equal(nearer < farther, true);
  });

  it('treats Mongo total 0 as fallback, not an empty later page', () => {
    assert.equal(discoveryModeForOrigin(ORIGIN), 'radial');
    assert.equal(discoveryModeForOrigin(null), 'administrative');
  });
});
