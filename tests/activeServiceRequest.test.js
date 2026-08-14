/**
 * Unit tests for active service request duplicate prevention.
 * Run: node --test tests/activeServiceRequest.test.js
 */

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeServiceTypeKey,
  isActiveServiceStatus,
  ACTIVE_SERVICE_STATUSES,
  lockId,
} = require('../src/utils/activeServiceRequest');
const {activeRequestConflictPayload} = require('../src/services/activeServiceRequestService');
const {t} = require('../src/utils/translations');

describe('normalizeServiceTypeKey', () => {
  it('normalizes case and whitespace (language-independent identity)', () => {
    assert.equal(normalizeServiceTypeKey('Plumber'), 'plumber');
    assert.equal(normalizeServiceTypeKey('  PLUMBER  '), 'plumber');
    assert.equal(normalizeServiceTypeKey('Electrician'), 'electrician');
    assert.equal(normalizeServiceTypeKey('AC Repair'), 'ac repair');
  });
});

describe('isActiveServiceStatus', () => {
  it('treats pending/accepted/in-progress as active', () => {
    for (const s of ACTIVE_SERVICE_STATUSES) {
      assert.equal(isActiveServiceStatus(s), true);
    }
    assert.equal(isActiveServiceStatus('in_progress'), true);
    assert.equal(isActiveServiceStatus('IN-PROGRESS'), true);
  });

  it('treats terminal statuses as inactive', () => {
    for (const s of ['completed', 'cancelled', 'canceled', 'rejected', 'expired']) {
      assert.equal(isActiveServiceStatus(s), false);
    }
  });
});

describe('lockId', () => {
  it('is stable per customer + service key', () => {
    assert.equal(
      lockId('cust1', normalizeServiceTypeKey('Plumber')),
      'cust1::plumber',
    );
  });
});

describe('activeRequestConflictPayload', () => {
  it('returns friendly English message (not raw 409 jargon)', () => {
    const payload = activeRequestConflictPayload(
      {
        _id: 'abc',
        serviceType: 'Plumber',
        status: 'pending',
      },
      'en',
      t,
    );
    assert.equal(payload.code, 'ACTIVE_SERVICE_REQUEST_EXISTS');
    assert.match(payload.message, /active request/i);
    assert.equal(payload.data.serviceRequestId, 'abc');
    assert.equal(payload.data.serviceType, 'Plumber');
  });

  it('returns Hindi message when lang=hi', () => {
    const payload = activeRequestConflictPayload(null, 'hi', t);
    assert.match(payload.message, /सक्रिय/);
  });
});

describe('business matrix (documentation assertions)', () => {
  it('same service blocked while active; different service allowed conceptually', () => {
    const plumber = normalizeServiceTypeKey('Plumber');
    const electrician = normalizeServiceTypeKey('Electrician');
    assert.notEqual(plumber, electrician);
    assert.equal(isActiveServiceStatus('pending'), true);
    assert.equal(isActiveServiceStatus('completed'), false);
  });
});
