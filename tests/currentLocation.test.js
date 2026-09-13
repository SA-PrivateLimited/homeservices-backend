const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCurrentLocationInput,
  buildProviderStatusUpdate,
} = require('../src/utils/currentLocation');

describe('parseCurrentLocationInput', () => {
  it('skips when currentLocation is omitted', () => {
    assert.deepEqual(parseCurrentLocationInput(undefined), {ok: true, value: null});
    assert.deepEqual(parseCurrentLocationInput(null), {ok: true, value: null});
  });

  it('rejects non-objects and missing coordinates', () => {
    assert.equal(parseCurrentLocationInput('24,83').ok, false);
    assert.equal(parseCurrentLocationInput({}).ok, false);
    assert.equal(parseCurrentLocationInput({latitude: 24.123}).ok, false);
    assert.equal(parseCurrentLocationInput({longitude: 83.456}).ok, false);
  });

  it('rejects out-of-range latitude and longitude', () => {
    const badLat = parseCurrentLocationInput({latitude: 91, longitude: 83});
    const badLon = parseCurrentLocationInput({latitude: 24, longitude: 181});
    assert.equal(badLat.ok, false);
    assert.match(badLat.message, /latitude/);
    assert.equal(badLon.ok, false);
    assert.match(badLon.message, /longitude/);
  });

  it('stamps server updatedAt and ignores a client timestamp', () => {
    const now = new Date('2026-09-13T01:00:00.000Z');
    const parsed = parseCurrentLocationInput(
      {
        latitude: 24.123,
        longitude: 83.456,
        updatedAt: '2000-01-01T00:00:00.000Z',
      },
      now,
    );
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.latitude, 24.123);
    assert.equal(parsed.value.longitude, 83.456);
    assert.equal(parsed.value.updatedAt.toISOString(), now.toISOString());
  });
});

describe('buildProviderStatusUpdate', () => {
  const now = new Date('2026-09-13T01:30:00.000Z');

  it('keeps {isOnline: true} without requiring location', () => {
    const result = buildProviderStatusUpdate({isOnline: true}, now);
    assert.equal(result.ok, true);
    assert.deepEqual(result.updateData, {
      updatedAt: now,
      isOnline: true,
    });
    assert.equal('currentLocation' in result.updateData, false);
  });

  it('keeps offline without location', () => {
    const result = buildProviderStatusUpdate({isOnline: false}, now);
    assert.equal(result.ok, true);
    assert.equal(result.updateData.isOnline, false);
    assert.equal('currentLocation' in result.updateData, false);
  });

  it('persists live coordinates with a server timestamp', () => {
    const result = buildProviderStatusUpdate(
      {
        isOnline: true,
        currentLocation: {latitude: 24.123, longitude: 83.456},
      },
      now,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.updateData.currentLocation, {
      latitude: 24.123,
      longitude: 83.456,
      updatedAt: now,
    });
    assert.equal(result.updateData.isOnline, true);
    assert.equal(result.updateData.lastUpdated, now);
  });

  it('rejects invalid latitude without writing currentLocation', () => {
    const result = buildProviderStatusUpdate(
      {
        isOnline: true,
        currentLocation: {latitude: 120, longitude: 83.456},
      },
      now,
    );
    assert.equal(result.ok, false);
  });

  it('location-only updates do not change isOnline', () => {
    const result = buildProviderStatusUpdate(
      {currentLocation: {latitude: 24.123, longitude: 83.456}},
      now,
    );
    assert.equal(result.ok, true);
    assert.equal('isOnline' in result.updateData, false);
    assert.equal('isAvailable' in result.updateData, false);
    assert.equal(result.updateData.currentLocation.latitude, 24.123);
  });

  it('does not copy profile location/address into currentLocation', () => {
    const result = buildProviderStatusUpdate(
      {
        isOnline: true,
        location: {latitude: 1, longitude: 2},
        address: {latitude: 3, longitude: 4},
      },
      now,
    );
    assert.equal(result.ok, true);
    assert.equal('currentLocation' in result.updateData, false);
    assert.equal('location' in result.updateData, false);
    assert.equal('address' in result.updateData, false);
  });
});
