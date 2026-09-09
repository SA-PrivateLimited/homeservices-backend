const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolvePartnerProfileImage,
  applyLinkedProfileImageFallback,
  rewriteStoredAssetFields,
} = require('../src/utils/resolvePartnerProfileImage');

test('prefers partner profile image when set', () => {
  const url = resolvePartnerProfileImage(
    {profileImage: 'https://cdn/partner.jpg'},
    {profileImage: 'https://cdn/customer.jpg'},
  );
  assert.equal(url, 'https://cdn/partner.jpg');
});

test('falls back to linked user photo when partner image missing', () => {
  const url = resolvePartnerProfileImage(
    {photos: ['https://cdn/showcase.jpg']},
    {photoURL: 'https://cdn/customer.jpg'},
  );
  assert.equal(url, 'https://cdn/customer.jpg');
});

test('applyLinkedProfileImageFallback mutates payload', () => {
  const payload = {name: 'Test'};
  applyLinkedProfileImageFallback(payload, {
    profileImage: 'https://cdn/customer.jpg',
  });
  assert.equal(payload.profileImage, 'https://cdn/customer.jpg');
});

test('rewrites stored assets.akanso.in photo URLs on read', () => {
  const payload = rewriteStoredAssetFields({
    profileImage:
      'https://assets.akanso.in/providers/abc/profile/photo.jpg',
    photos: ['https://assets.akanso.in/providers/abc/work/1.jpg'],
  });
  assert.equal(
    payload.profileImage,
    'https://assets.akansho.com/providers/abc/profile/photo.jpg',
  );
  assert.equal(
    payload.photos[0],
    'https://assets.akansho.com/providers/abc/work/1.jpg',
  );
});

test('applyLinkedProfileImageFallback keeps partner image', () => {
  const payload = {profileImage: 'https://cdn/partner.jpg'};
  applyLinkedProfileImageFallback(payload, {
    profileImage: 'https://cdn/customer.jpg',
  });
  assert.equal(payload.profileImage, 'https://cdn/partner.jpg');
});
