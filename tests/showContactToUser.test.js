const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {
  isShowContactToUserEnabled,
  applyShowContactToUser,
  parseShowContactToUser,
} = require('../src/utils/showContactToUser');

describe('showContactToUser', () => {
  it('defaults on when missing', () => {
    assert.equal(isShowContactToUserEnabled({}), true);
    assert.equal(isShowContactToUserEnabled({showContactToUser: true}), true);
    assert.equal(isShowContactToUserEnabled(null), true);
  });

  it('treats an explicit false as off', () => {
    assert.equal(
      isShowContactToUserEnabled({showContactToUser: false}),
      false,
    );
  });

  it('writes the resolved boolean onto the document', () => {
    const row = {};
    applyShowContactToUser(row);
    assert.equal(row.showContactToUser, true);
    applyShowContactToUser({showContactToUser: false});
    const off = {showContactToUser: false};
    applyShowContactToUser(off);
    assert.equal(off.showContactToUser, false);
  });

  it('parses body values', () => {
    assert.equal(parseShowContactToUser(true), true);
    assert.equal(parseShowContactToUser('false'), false);
    assert.equal(parseShowContactToUser('maybe'), null);
  });
});
