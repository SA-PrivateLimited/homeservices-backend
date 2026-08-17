const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  excludeSelfProviderClause,
  filterOutSelfProvider,
  normalizeUserId,
} = require('../src/utils/excludeSelfProvider');

test('normalizeUserId trims and rejects empty', () => {
  assert.equal(normalizeUserId('  uid1  '), 'uid1');
  assert.equal(normalizeUserId(''), null);
  assert.equal(normalizeUserId(null), null);
});

test('excludeSelfProviderClause returns $ne filter', () => {
  assert.deepEqual(excludeSelfProviderClause('user-1'), {_id: {$ne: 'user-1'}});
  assert.deepEqual(excludeSelfProviderClause(''), {});
});

test('filterOutSelfProvider removes matching provider id', () => {
  const rows = [{_id: 'self'}, {_id: 'other'}];
  assert.deepEqual(filterOutSelfProvider(rows, 'self'), [{_id: 'other'}]);
  assert.deepEqual(filterOutSelfProvider(rows, null), rows);
});
