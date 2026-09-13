const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {toPublicProvider} = require('../src/utils/contactAccess');

const FIXTURE = {
  _id: 'prov_public_loc',
  name: 'Test Electrician',
  displayName: 'Test Electrician',
  serviceType: 'Electrician',
  isOnline: true,
  isAvailable: true,
  location: {
    address: 'Tānrwa',
    city: 'Garhwa',
    district: 'Garhwa',
    state: 'Jharkhand',
    stateId: 'st_jh',
    districtId: 'dt_jh-garhwa',
    pincode: '822114',
    latitude: 24.123,
    longitude: 83.456,
  },
  currentLocation: {
    latitude: 24.124,
    longitude: 83.457,
    updatedAt: '2026-09-13T02:06:05.178Z',
  },
  address: {
    type: 'home',
    address: 'Tānrwa',
    city: 'Garhwa',
    district: 'Garhwa',
    state: 'Jharkhand',
    pincode: '822114',
    latitude: 24.123,
    longitude: 83.456,
  },
};

function containsExact(value, needle) {
  if (value === needle) return true;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => containsExact(item, needle));
  return Object.values(value).some((item) => containsExact(item, needle));
}

describe('toPublicProvider location privacy', () => {
  it('omits exact location and currentLocation coordinates from public payloads', () => {
    const pub = toPublicProvider(FIXTURE);

    assert.equal(pub.name, 'Test Electrician');
    assert.equal(pub.serviceType, 'Electrician');
    assert.equal(pub.isOnline, true);
    assert.equal(pub.location.district, 'Garhwa');
    assert.equal(pub.location.state, 'Jharkhand');
    assert.equal(pub.location.pincode, '822114');
    assert.equal(pub.address.city, 'Garhwa');
    assert.equal('latitude' in pub.location, false);
    assert.equal('longitude' in pub.location, false);
    assert.equal('currentLocation' in pub, false);
    assert.equal('latitude' in (pub.address || {}), false);
    assert.equal('longitude' in (pub.address || {}), false);

    assert.equal(containsExact(pub, 24.123), false);
    assert.equal(containsExact(pub, 83.456), false);
    assert.equal(containsExact(pub, 24.124), false);
    assert.equal(containsExact(pub, 83.457), false);
    assert.equal(containsExact(pub, '2026-09-13T02:06:05.178Z'), false);
  });

  it('does not mutate the source provider document', () => {
    const src = {
      ...FIXTURE,
      location: {...FIXTURE.location},
      currentLocation: {...FIXTURE.currentLocation},
    };
    toPublicProvider(src);
    assert.equal(src.location.latitude, 24.123);
    assert.equal(src.currentLocation.latitude, 24.124);
    assert.equal(src.currentLocation.updatedAt, '2026-09-13T02:06:05.178Z');
  });
});
