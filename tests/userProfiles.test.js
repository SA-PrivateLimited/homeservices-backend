const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  hasCustomerProfile,
  hasPartnerProfile,
  canEnterAppContext,
} = require('../src/utils/userProfiles');

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
