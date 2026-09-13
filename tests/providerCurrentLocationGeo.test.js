const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const Provider = require('../src/models/Provider');

describe('Provider currentLocation GeoJSON foundation', () => {
  it('keeps lat/lng/updatedAt and adds an optional Point', () => {
    assert.ok(Provider.schema.path('currentLocation.latitude'));
    assert.ok(Provider.schema.path('currentLocation.longitude'));
    assert.ok(Provider.schema.path('currentLocation.updatedAt'));
    assert.ok(Provider.schema.path('currentLocation.point.coordinates'));
    assert.deepEqual(
      Provider.schema.path('currentLocation.point.type').enumValues,
      ['Point'],
    );
  });

  it('declares a 2dsphere index on currentLocation.point', () => {
    const geo = Provider.schema
      .indexes()
      .find(([spec]) => spec['currentLocation.point'] === '2dsphere');
    assert.ok(geo, 'expected currentLocation.point 2dsphere index');
  });
});
