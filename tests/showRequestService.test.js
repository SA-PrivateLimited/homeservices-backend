const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {
  defaultShowRequestService,
  isShowRequestServiceEnabled,
  applyShowRequestService,
  parseShowRequestService,
} = require('../src/utils/showRequestService');

describe('showRequestService', () => {
  it('defaults off for Admin-created Partners', () => {
    assert.equal(defaultShowRequestService('admin'), false);
    assert.equal(defaultShowRequestService('admin_bulk'), false);
  });

  it('defaults on for self-signup and unknown legacy source', () => {
    assert.equal(defaultShowRequestService('self'), true);
    assert.equal(defaultShowRequestService(undefined), true);
    assert.equal(defaultShowRequestService(''), true);
  });

  it('treats an explicit false as off even if source is self', () => {
    assert.equal(
      isShowRequestServiceEnabled({
        onboardingSource: 'self',
        showRequestService: false,
      }),
      false,
    );
  });

  it('treats missing field as on for live Partners', () => {
    assert.equal(isShowRequestServiceEnabled({onboardingSource: 'self'}), true);
    assert.equal(isShowRequestServiceEnabled({}), true);
  });

  it('treats missing field as off when source is admin', () => {
    assert.equal(
      isShowRequestServiceEnabled({onboardingSource: 'admin'}),
      false,
    );
  });

  it('writes the resolved boolean onto the document', () => {
    const row = {onboardingSource: 'admin_bulk'};
    applyShowRequestService(row);
    assert.equal(row.showRequestService, false);
  });

  it('parses body values', () => {
    assert.equal(parseShowRequestService(true), true);
    assert.equal(parseShowRequestService('false'), false);
    assert.equal(parseShowRequestService('maybe'), null);
  });
});
