const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  autoVerifyPartnerIfEligible,
} = require('../src/utils/partnerAutoVerification');
const {
  isServiceInactive,
} = require('../src/utils/providerServiceAvailability');

function completeProvider(extra = {}) {
  return {
    approvalStatus: 'approved',
    verified: true,
    name: 'Sandeep',
    phoneVerified: true,
    experience: 5,
    location: {
      address: 'Main road',
      stateId: 'jh',
      districtId: 'garhwa',
      pincode: '822114',
    },
    serviceType: 'Tiles Mistry',
    serviceCategories: ['Tiles Mistry', 'Plumber', 'Electrician'],
    serviceQualifications: [
      {name: 'Tiles Mistry', verificationStatus: 'approved'},
      {name: 'Plumber', verificationStatus: 'approved'},
      {name: 'Electrician', verificationStatus: 'required'},
    ],
    inactiveServiceCategories: ['Tiles Mistry', 'Plumber', 'Electrician'],
    ...extra,
  };
}

test('auto-verify does not turn back on services the Partner switched off', () => {
  const provider = completeProvider();
  const result = autoVerifyPartnerIfEligible(provider, {phoneVerified: true});
  assert.equal(result.changed, true);
  assert.equal(isServiceInactive(provider, 'Tiles Mistry'), true);
  assert.equal(isServiceInactive(provider, 'Plumber'), true);
  assert.equal(isServiceInactive(provider, 'Electrician'), false);
});
