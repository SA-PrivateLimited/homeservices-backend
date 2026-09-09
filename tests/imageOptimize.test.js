const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const {
  optimizeImageBuffer,
  kindForPurpose,
  kindForObjectKey,
} = require('../src/services/imageOptimize');

describe('imageOptimize', () => {
  it('maps purposes to kinds', () => {
    assert.equal(kindForPurpose('provider-profile'), 'profile');
    assert.equal(kindForPurpose('service-request-photo'), 'photo');
    assert.equal(kindForObjectKey('providers/x/documents/id/a.jpg'), null);
    assert.equal(kindForObjectKey('providers/x/profile/a.jpg'), 'profile');
  });

  it('shrinks a large jpeg', async () => {
    const input = await sharp({
      create: {
        width: 2400,
        height: 1800,
        channels: 3,
        background: {r: 40, g: 120, b: 180},
      },
    })
      .jpeg({quality: 95})
      .toBuffer();

    const result = await optimizeImageBuffer(input, {
      purpose: 'provider-profile',
      key: 'providers/abc/profile/test.jpg',
      contentType: 'image/jpeg',
    });

    assert.equal(result.skipped, false);
    assert.ok(result.optimizedBytes < result.originalBytes);
    assert.ok(result.width <= 800);
    assert.ok(result.height <= 800);
    assert.equal(result.contentType, 'image/jpeg');
  });

  it('skips already-small images', async () => {
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
      minBytesToProcess: 40 * 1024,
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'already-small');
  });
});
