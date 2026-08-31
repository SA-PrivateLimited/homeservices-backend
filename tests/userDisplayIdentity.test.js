const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  formatDefaultProviderName,
  resolveInitialProviderName,
  isPlaceholderDisplayName,
} = require('../src/utils/userDisplayIdentity');

test('formats Partner default names like Customer User-XXXX', () => {
  assert.equal(formatDefaultProviderName(7), 'Provider-0007');
  assert.equal(formatDefaultProviderName(4827), 'Provider-4827');
});

test('new Partner signup without a real name gets Provider-{4 digits}', () => {
  assert.equal(
    resolveInitialProviderName({displayId: 42}),
    'Provider-0042',
  );
  assert.equal(
    resolveInitialProviderName({requestedName: 'Provider', displayId: 42}),
    'Provider-0042',
  );
});

test('keeps a real Partner name', () => {
  assert.equal(
    resolveInitialProviderName({
      requestedName: 'Ram Kumar',
      displayId: 42,
    }),
    'Ram Kumar',
  );
});

test('Provider-XXXX is a placeholder, not a real name', () => {
  assert.equal(isPlaceholderDisplayName('Provider-0042'), true);
  assert.equal(isPlaceholderDisplayName('Ram Kumar'), false);
});
