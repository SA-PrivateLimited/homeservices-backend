/**
 * Provider open-request policy (offline matching toggle).
 * Run: npm test
 */

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');

const {
  ENV_DEFAULT,
  normalizeAllowOfflineProviderOpenRequests,
} = require('../src/services/providerOpenRequestPolicyService');

describe('normalizeAllowOfflineProviderOpenRequests', () => {
  it('defaults to env default when unset', () => {
    assert.equal(normalizeAllowOfflineProviderOpenRequests(undefined), ENV_DEFAULT);
    assert.equal(normalizeAllowOfflineProviderOpenRequests(''), ENV_DEFAULT);
  });

  it('parses boolean values', () => {
    assert.equal(normalizeAllowOfflineProviderOpenRequests(true), true);
    assert.equal(normalizeAllowOfflineProviderOpenRequests(false), false);
    assert.equal(normalizeAllowOfflineProviderOpenRequests('true'), true);
    assert.equal(normalizeAllowOfflineProviderOpenRequests('false'), false);
    assert.equal(normalizeAllowOfflineProviderOpenRequests(1), true);
    assert.equal(normalizeAllowOfflineProviderOpenRequests(0), false);
  });
});
