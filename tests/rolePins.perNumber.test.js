const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  pinHmacKey,
  assertPinGloballyUnique,
  generateUniquePin,
} = require('../src/utils/rolePins');

test('PIN storage key is derived from the PIN value, not a global lock', async () => {
  const pin = '4826';
  const key = await assertPinGloballyUnique(null, pin, 'user-a');
  assert.equal(key, pinHmacKey(pin));
  const sameForOtherUser = await assertPinGloballyUnique(null, pin, 'user-b');
  assert.equal(sameForOtherUser, key);
});

test('auto-generated PIN is four digits and does not require uniqueness', async () => {
  const pin = await generateUniquePin(null);
  assert.match(pin, /^\d{4}$/);
});
