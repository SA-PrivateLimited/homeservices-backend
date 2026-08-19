const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  hasCustomerProfile,
  hasPartnerProfile,
  canEnterAppContext,
  isCustomerAccessActive,
  isPartnerAccessActive,
} = require('../src/utils/userProfiles');
const {
  isValidPin,
  resolvePinPurpose,
  snapshotLegacyPins,
  applyRolePin,
  pinHashForRole,
} = require('../src/utils/rolePins');

test('customer-only can enter CustomerWeb, not PartnerWeb', () => {
  const user = {role: 'customer', customerProfileEnabled: false};
  assert.equal(hasCustomerProfile(user), true);
  assert.equal(hasPartnerProfile(user), false);
  assert.equal(canEnterAppContext(user, 'customer'), true);
  assert.equal(canEnterAppContext(user, 'provider'), false);
});

test('partner-only cannot enter CustomerWeb until customer profile exists', () => {
  const user = {role: 'provider', customerProfileEnabled: false};
  assert.equal(hasCustomerProfile(user), false);
  assert.equal(hasPartnerProfile(user), true);
  assert.equal(canEnterAppContext(user, 'customer'), false);
  assert.equal(canEnterAppContext(user, 'provider'), true);
});

test('dual-role user can enter both apps', () => {
  const user = {role: 'provider', customerProfileEnabled: true};
  assert.equal(hasCustomerProfile(user), true);
  assert.equal(hasPartnerProfile(user), true);
  assert.equal(canEnterAppContext(user, 'customer'), true);
  assert.equal(canEnterAppContext(user, 'provider'), true);
});

test('customer and partner access can be deactivated independently', () => {
  const dual = {
    role: 'provider',
    customerProfileEnabled: true,
    customerAccessActive: false,
    isActive: true,
  };
  assert.equal(isCustomerAccessActive(dual), false);
  assert.equal(isPartnerAccessActive(dual, {isActive: true}), true);

  const partnerOff = {
    role: 'provider',
    customerProfileEnabled: true,
    customerAccessActive: true,
    isActive: true,
  };
  assert.equal(isCustomerAccessActive(partnerOff), true);
  assert.equal(isPartnerAccessActive(partnerOff, {isActive: false}), false);
});

test('isValidPin requires exactly six digits', () => {
  assert.equal(isValidPin('123456'), true);
  assert.equal(isValidPin('12345'), false);
  assert.equal(isValidPin('1234567'), false);
  assert.equal(isValidPin('abcdef'), false);
});

test('resetting customer PIN leaves partner PIN unchanged', () => {
  const user = {
    role: 'provider',
    customerProfileEnabled: true,
    pinHash: 'legacy',
    pinKey: 'legacy-key',
    encryptedPin: 'legacy-enc',
  };
  snapshotLegacyPins(user);
  applyRolePin(
    user,
    {hash: 'cust-hash', key: 'cust-key', encrypted: 'cust-enc'},
    'customer',
  );
  assert.equal(user.customerPinHash, 'cust-hash');
  assert.equal(user.partnerPinHash, 'legacy');
  assert.equal(user.pinHash, 'legacy');
  assert.equal(pinHashForRole(user, 'customer'), 'cust-hash');
  assert.equal(pinHashForRole(user, 'provider'), 'legacy');
});

test('resetting partner PIN leaves customer PIN unchanged', () => {
  const user = {
    role: 'provider',
    customerProfileEnabled: true,
    pinHash: 'legacy',
    pinKey: 'legacy-key',
    encryptedPin: 'legacy-enc',
  };
  snapshotLegacyPins(user);
  applyRolePin(
    user,
    {hash: 'part-hash', key: 'part-key', encrypted: 'part-enc'},
    'partner',
  );
  assert.equal(user.partnerPinHash, 'part-hash');
  assert.equal(user.pinHash, 'part-hash');
  assert.equal(user.customerPinHash, 'legacy');
  assert.equal(pinHashForRole(user, 'provider'), 'part-hash');
  assert.equal(pinHashForRole(user, 'customer'), 'legacy');
});

test('omitted purpose defaults to customer for dual-role users', () => {
  const dual = {role: 'provider', customerProfileEnabled: true};
  assert.equal(resolvePinPurpose(undefined, dual), 'customer');
  const partnerOnly = {role: 'provider', customerProfileEnabled: false};
  assert.equal(resolvePinPurpose(undefined, partnerOnly), 'partner');
});
