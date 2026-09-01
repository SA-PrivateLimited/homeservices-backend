const {describe, test} = require('node:test');
const assert = require('node:assert/strict');
const {
  BACKUP_FORMAT,
  RESTORE_CONFIRM_PHRASE,
  shouldSkipCollection,
  serializeIndexes,
  parseBackupPayload,
} = require('../src/utils/mongoBackup');
const {EJSON} = require('mongoose').mongo.BSON;

describe('mongoBackup helpers', () => {
  test('skips Mongo system collections only', () => {
    assert.equal(shouldSkipCollection('system.profile'), true);
    assert.equal(shouldSkipCollection('system.views'), true);
    assert.equal(shouldSkipCollection(''), true);
    assert.equal(shouldSkipCollection('admin_backup_events'), true);
    assert.equal(shouldSkipCollection('users'), false);
    assert.equal(shouldSkipCollection('providers'), false);
  });

  test('drops the default _id index from backup metadata', () => {
    const indexes = serializeIndexes([
      {v: 2, key: {_id: 1}, name: '_id_'},
      {v: 2, key: {phone: 1}, name: 'phone_1', unique: true},
    ]);
    assert.equal(indexes.length, 1);
    assert.equal(indexes[0].name, 'phone_1');
    assert.equal(indexes[0].unique, true);
  });

  test('rejects files that are not Akanso backups', () => {
    assert.throws(() => parseBackupPayload('{"hello":true}'), /not an Akanso/);
    assert.throws(() => parseBackupPayload('not-json'), /not valid JSON/);
  });

  test('accepts canonical backup JSON', () => {
    const raw = EJSON.stringify(
      {
        format: BACKUP_FORMAT,
        exportedAt: new Date().toISOString(),
        collections: {users: {indexes: [], documents: []}},
      },
      {relaxed: false},
    );
    const parsed = parseBackupPayload(raw);
    assert.equal(parsed.format, BACKUP_FORMAT);
    assert.ok(parsed.collections.users);
  });

  test('parses and rejects unsafe collection names', () => {
    const {parseCollectionNames} = require('../src/utils/mongoBackup');
    assert.deepEqual(parseCollectionNames('users,providers'), [
      'users',
      'providers',
    ]);
    assert.throws(() => parseCollectionNames('system.users'), /Invalid/);
    assert.throws(() => parseCollectionNames('../secret'), /Invalid/);
  });

  test('restore confirm phrase is RESTORE', () => {
    assert.equal(RESTORE_CONFIRM_PHRASE, 'RESTORE');
  });
});
