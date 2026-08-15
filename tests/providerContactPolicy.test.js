/**
 * Provider contact visibility policy helpers.
 * Run: npm test
 */

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');

const {
  PROVIDER_CONTACT_POLICIES,
  DEFAULT_PROVIDER_CONTACT_POLICY,
  normalizeProviderContactPolicy,
  resolveProviderContactPolicy,
  customerMaySeeProviderPhone,
  providerContactHint,
} = require('../src/utils/providerContactPolicy');

describe('normalizeProviderContactPolicy', () => {
  it('defaults to DIRECT', () => {
    assert.equal(DEFAULT_PROVIDER_CONTACT_POLICY, 'DIRECT');
    assert.equal(normalizeProviderContactPolicy(''), 'DIRECT');
    assert.equal(normalizeProviderContactPolicy('nope'), 'DIRECT');
  });

  it('accepts known enum values', () => {
    assert.equal(normalizeProviderContactPolicy('masked'), 'MASKED');
    assert.equal(normalizeProviderContactPolicy('accepted-only'), 'ACCEPTED_ONLY');
    assert.equal(
      normalizeProviderContactPolicy('ACTIVE REQUEST ONLY'),
      'ACTIVE_REQUEST_ONLY',
    );
  });
});

describe('resolveProviderContactPolicy', () => {
  it('uses service override over global', () => {
    const settings = {
      providerContactPolicy: 'DIRECT',
      serviceOverrides: {plumber: 'MASKED'},
    };
    assert.equal(resolveProviderContactPolicy(settings, 'Plumber'), 'MASKED');
    assert.equal(resolveProviderContactPolicy(settings, 'Electrician'), 'DIRECT');
  });
});

describe('customerMaySeeProviderPhone', () => {
  it('DIRECT reveals on browse and on any assigned job', () => {
    assert.equal(
      customerMaySeeProviderPhone('DIRECT', {hasJob: false}),
      true,
    );
    assert.equal(
      customerMaySeeProviderPhone('DIRECT', {
        hasJob: true,
        hasProvider: true,
        status: 'pending',
      }),
      true,
    );
    assert.equal(
      customerMaySeeProviderPhone('DIRECT', {
        hasJob: true,
        hasProvider: true,
        status: 'completed',
      }),
      true,
    );
  });

  it('MASKED never reveals', () => {
    assert.equal(
      customerMaySeeProviderPhone('MASKED', {hasJob: false}),
      false,
    );
    assert.equal(
      customerMaySeeProviderPhone('MASKED', {
        hasJob: true,
        hasProvider: true,
        status: 'accepted',
      }),
      false,
    );
  });

  it('ACCEPTED_ONLY reveals after accept, including completed', () => {
    assert.equal(
      customerMaySeeProviderPhone('ACCEPTED_ONLY', {hasJob: false}),
      false,
    );
    assert.equal(
      customerMaySeeProviderPhone('ACCEPTED_ONLY', {
        hasJob: true,
        hasProvider: true,
        status: 'pending',
      }),
      false,
    );
    assert.equal(
      customerMaySeeProviderPhone('ACCEPTED_ONLY', {
        hasJob: true,
        hasProvider: true,
        status: 'accepted',
      }),
      true,
    );
    assert.equal(
      customerMaySeeProviderPhone('ACCEPTED_ONLY', {
        hasJob: true,
        hasProvider: true,
        status: 'completed',
      }),
      true,
    );
  });

  it('ACTIVE_REQUEST_ONLY reveals only while the request is active', () => {
    assert.equal(
      customerMaySeeProviderPhone('ACTIVE_REQUEST_ONLY', {
        hasJob: true,
        hasProvider: true,
        status: 'pending',
      }),
      true,
    );
    assert.equal(
      customerMaySeeProviderPhone('ACTIVE_REQUEST_ONLY', {
        hasJob: true,
        hasProvider: true,
        status: 'accepted',
      }),
      true,
    );
    assert.equal(
      customerMaySeeProviderPhone('ACTIVE_REQUEST_ONLY', {
        hasJob: true,
        hasProvider: true,
        status: 'completed',
      }),
      false,
    );
    assert.equal(
      customerMaySeeProviderPhone('ACTIVE_REQUEST_ONLY', {
        hasJob: true,
        hasProvider: true,
        status: 'cancelled',
      }),
      false,
    );
  });
});

describe('providerContactHint', () => {
  it('returns waiting_acceptance before accept', () => {
    assert.equal(
      providerContactHint('ACCEPTED_ONLY', {
        hasJob: true,
        hasProvider: false,
        status: 'pending',
      }),
      'waiting_acceptance',
    );
  });

  it('returns masked for MASKED policy', () => {
    assert.equal(
      providerContactHint(PROVIDER_CONTACT_POLICIES.MASKED, {
        hasJob: true,
        hasProvider: true,
        status: 'accepted',
      }),
      'masked',
    );
  });
});
