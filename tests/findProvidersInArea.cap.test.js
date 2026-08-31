const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {
  MATCH_CAP,
  providerIdsFromList,
} = require('../src/utils/findProvidersInArea');

describe('findProvidersInArea caps', () => {
  it('keeps a small notify cap for cost', () => {
    assert.equal(MATCH_CAP, 40);
  });

  it('dedupes provider ids from mixed shapes', () => {
    assert.deepEqual(
      providerIdsFromList([
        {_id: 'a'},
        {id: 'a'},
        'b',
        {id: 'b'},
        '',
        null,
      ]),
      ['a', 'b'],
    );
  });
});
