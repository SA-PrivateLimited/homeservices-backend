const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const {
  optimizeImageBuffer,
  kindForPurpose,
  kindForObjectKey,
  PROFILES,
} = require('../src/services/imageOptimize');

describe('imageOptimize', () => {
  it('maps purposes to kinds', () => {
    assert.equal(kindForPurpose('provider-profile'), 'profile');
    assert.equal(kindForPurpose('service-request-photo'), 'photo');
    assert.equal(kindForObjectKey('providers/x/documents/id/a.jpg'), null);
    assert.equal(kindForObjectKey('providers/x/profile/a.jpg'), 'profile');
    assert.ok(PROFILES.profile.maxBytes <= 100 * 1024);
  });

  it('shrinks a large profile jpeg to ≤100KB', async () => {
    const noise = Buffer.alloc(2400 * 1800 * 3);
    for (let i = 0; i < noise.length; i += 1) {
      noise[i] = (i * 17 + (i % 255)) % 256;
    }
    const input = await sharp(noise, {
      raw: {width: 2400, height: 1800, channels: 3},
    })
      .jpeg({quality: 92})
      .toBuffer();

    assert.ok(
      input.length > 200 * 1024,
      `fixture too small: ${input.length}`,
    );

    const result = await optimizeImageBuffer(input, {
      purpose: 'provider-profile',
      key: 'providers/abc/profile/test.jpg',
      contentType: 'image/jpeg',
    });

    assert.equal(result.skipped, false);
    assert.ok(result.optimizedBytes < result.originalBytes);
    assert.ok(
      result.optimizedBytes <= 100 * 1024,
      `expected ≤100KB, got ${result.optimizedBytes}`,
    );
    assert.ok(result.width <= 640);
    assert.equal(result.contentType, 'image/jpeg');
  });

  it('skips already-small images under the budget', async () => {
    const input = await sharp({
      create: {
        width: 120,
        height: 120,
        channels: 3,
        background: {r: 10, g: 10, b: 10},
      },
    })
      .jpeg({quality: 70})
      .toBuffer();

    const result = await optimizeImageBuffer(input, {
      purpose: 'provider-profile',
      key: 'providers/abc/profile/small.jpg',
      contentType: 'image/jpeg',
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'already-small');
  });
});
