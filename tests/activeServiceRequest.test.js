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
  decideDuplicateLockAction,
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

describe('decideDuplicateLockAction', () => {
  it('reclaims a lock whose request is gone or terminal', () => {
    assert.equal(
      decideDuplicateLockAction({
        activeRequest: null,
        lock: {serviceRequestId: 'sr1', createdAt: new Date(0)},
        linkedRequestActive: false,
      }),
      'reclaim',
    );
  });

  it('keeps an in-flight lock without a request id', () => {
    assert.equal(
      decideDuplicateLockAction({
        activeRequest: null,
        lock: {serviceRequestId: '', createdAt: new Date()},
        linkedRequestActive: false,
        now: Date.now(),
      }),
      'conflict-inflight',
    );
  });

  it('reclaims a lock with no request id after the in-flight window', () => {
    assert.equal(
      decideDuplicateLockAction({
        activeRequest: null,
        lock: {serviceRequestId: '', createdAt: new Date(Date.now() - 60_000)},
        linkedRequestActive: false,
      }),
      'reclaim',
    );
  });

  it('conflicts when a live request still exists', () => {
    assert.equal(
      decideDuplicateLockAction({
        activeRequest: {_id: 'sr1', status: 'pending'},
        lock: {serviceRequestId: 'sr1'},
        linkedRequestActive: true,
      }),
      'conflict-active',
    );
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
