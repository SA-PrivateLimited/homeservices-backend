const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAdminOnboardingSource,
  ONBOARDING_SOURCES,
} = require('../src/utils/onboardingSource');

describe('onboardingSource', () => {
  it('treats missing or unknown admin input as one-by-one Admin add', () => {
    assert.equal(parseAdminOnboardingSource(undefined), 'admin');
    assert.equal(parseAdminOnboardingSource(''), 'admin');
    assert.equal(parseAdminOnboardingSource('self'), 'admin');
  });

  it('accepts bulk aliases', () => {
    assert.equal(parseAdminOnboardingSource('admin_bulk'), 'admin_bulk');
    assert.equal(parseAdminOnboardingSource('bulk'), 'admin_bulk');
  });

  it('lists the stored values', () => {
    assert.deepEqual(ONBOARDING_SOURCES, ['self', 'admin', 'admin_bulk']);
  });
});
