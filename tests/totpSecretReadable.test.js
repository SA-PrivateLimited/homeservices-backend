const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

if (!process.env.TOKEN_ENCRYPTION_KEY) {
  process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
}

const {
  encryptTotpSecret,
  totpSecretIsReadable,
} = require('../src/utils/totp');

test('totpSecretIsReadable is true for a secret encrypted with the current key', () => {
  const stored = encryptTotpSecret('JBSWY3DPEHPK3PXP');
  assert.equal(totpSecretIsReadable(stored), true);
});

test('totpSecretIsReadable is false for garbage or empty values', () => {
  assert.equal(totpSecretIsReadable(''), false);
  assert.equal(totpSecretIsReadable(null), false);
  assert.equal(totpSecretIsReadable('not-valid-base64-blob!!!'), false);
});
