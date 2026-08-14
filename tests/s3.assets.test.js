/**
 * Unit tests for S3 asset upload stack (mocked S3 client — no AWS credentials).
 * Run: npm test
 */

const {describe, it, beforeEach, afterEach, mock} = require('node:test');
const assert = require('node:assert/strict');

process.env.AWS_REGION = 'eu-north-1';
process.env.AWS_S3_BUCKET = 'akanso-assets';
process.env.AWS_CLOUDFRONT_DOMAIN = 'assets.akanso.in';
process.env.MAX_IMAGE_SIZE_MB = '5';

const {
  detectMimeFromBuffer,
  validateImageBuffer,
  getMaxImageBytes,
} = require('../src/utils/assetValidation');
const {
  generateCloudFrontUrl,
  uploadFile,
  deleteObject,
  setS3ClientForTests,
  resetS3ClientForTests,
  getCredentialResolutionInfo,
  getS3Client,
} = require('../src/services/s3.service');
const {
  buildProviderProfileKey,
  normalizeObjectKey,
  assertKeyAuthorizedForUser,
  keyFromUrlOrKey,
  ALLOWED_ROOT_PREFIXES,
} = require('../src/utils/s3Keys');

function jpegBuffer(size = 64) {
  const buf = Buffer.alloc(size, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

function pngBuffer(size = 64) {
  const buf = Buffer.alloc(size, 0);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  return buf;
}

function fakeExeBuffer() {
  const buf = Buffer.alloc(64, 0);
  buf[0] = 0x4d; // MZ
  buf[1] = 0x5a;
  return buf;
}

describe('assetValidation', () => {
  it('detects JPEG/PNG magic bytes', () => {
    assert.equal(detectMimeFromBuffer(jpegBuffer()), 'image/jpeg');
    assert.equal(detectMimeFromBuffer(pngBuffer()), 'image/png');
    assert.equal(detectMimeFromBuffer(fakeExeBuffer()), null);
  });

  it('rejects invalid MIME type (exe disguised)', () => {
    assert.throws(
      () => validateImageBuffer(fakeExeBuffer(), 'image/jpeg'),
      (err) => err.statusCode === 400,
    );
  });

  it('rejects oversized image', () => {
    const max = getMaxImageBytes();
    const huge = Buffer.alloc(max + 1, 0);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    assert.throws(
      () => validateImageBuffer(huge, 'image/jpeg'),
      (err) => err.statusCode === 400 && /maximum size/i.test(err.message),
    );
  });

  it('accepts valid JPEG', () => {
    const result = validateImageBuffer(jpegBuffer(1200), 'image/jpeg');
    assert.equal(result.contentType, 'image/jpeg');
    assert.equal(result.extension, '.jpg');
  });
});

describe('s3Keys + CloudFront URL', () => {
  it('generates CloudFront URL (never S3 bucket URL)', () => {
    const url = generateCloudFrontUrl(
      'providers/123/profile/550e8400-e29b-41d4-a716-446655440000.webp',
    );
    assert.equal(
      url,
      'https://assets.akanso.in/providers/123/profile/550e8400-e29b-41d4-a716-446655440000.webp',
    );
    assert.equal(url.includes('s3.'), false);
    assert.equal(url.includes('akanso-assets'), false);
  });

  it('builds UUID-based provider profile keys under providers/', () => {
    const key = buildProviderProfileKey('prov_abc', '.webp');
    assert.match(key, /^providers\/prov_abc\/profile\/[0-9a-f-]{36}\.webp$/);
  });

  it('rejects path traversal and unauthorized prefixes', () => {
    assert.throws(() => normalizeObjectKey('../../etc/passwd'), (e) => e.statusCode === 400);
    assert.throws(() => normalizeObjectKey('evil/foo.png'), (e) => e.statusCode === 403);
    assert.ok(ALLOWED_ROOT_PREFIXES.includes('providers'));
  });

  it('rejects unauthorized prefix for provider user', () => {
    assert.throws(
      () =>
        assertKeyAuthorizedForUser('providers/other-user/profile/x.webp', {
          uid: 'me',
          role: 'provider',
        }),
      (e) => e.statusCode === 403,
    );
  });

  it('allows provider to manage own namespace', () => {
    const key = assertKeyAuthorizedForUser(
      'providers/me/profile/550e8400-e29b-41d4-a716-446655440000.webp',
      {uid: 'me', role: 'provider'},
    );
    assert.equal(key.startsWith('providers/me/'), true);
  });

  it('parses key from CloudFront URL only', () => {
    const key = keyFromUrlOrKey(
      'https://assets.akanso.in/customers/u1/profile/a.webp',
    );
    assert.equal(key, 'customers/u1/profile/a.webp');
    assert.throws(
      () =>
        keyFromUrlOrKey(
          'https://akanso-assets.s3.eu-north-1.amazonaws.com/customers/u1/x.webp',
        ),
      (e) => e.statusCode === 400,
    );
  });
});

describe('s3.service with mocked client', () => {
  let sentCommands;

  beforeEach(() => {
    sentCommands = [];
    setS3ClientForTests({
      send: async (command) => {
        sentCommands.push(command);
        return {};
      },
      config: {credentials: undefined},
    });
  });

  afterEach(() => {
    resetS3ClientForTests();
  });

  it('successful upload returns key, CloudFront url, contentType, size', async () => {
    const body = jpegBuffer(200);
    const result = await uploadFile({
      body,
      key: 'providers/123/profile/550e8400-e29b-41d4-a716-446655440000.jpg',
      contentType: 'image/jpeg',
      userId: '123',
    });
    assert.equal(
      result.key,
      'providers/123/profile/550e8400-e29b-41d4-a716-446655440000.jpg',
    );
    assert.equal(
      result.url,
      'https://assets.akanso.in/providers/123/profile/550e8400-e29b-41d4-a716-446655440000.jpg',
    );
    assert.equal(result.contentType, 'image/jpeg');
    assert.equal(result.size, 200);
    assert.equal(sentCommands.length, 1);
  });

  it('successful deletion', async () => {
    const result = await deleteObject(
      'providers/123/profile/550e8400-e29b-41d4-a716-446655440000.jpg',
      {userId: '123'},
    );
    assert.equal(result.deleted, true);
    assert.equal(sentCommands.length, 1);
  });

  it('AWS credential resolution uses default chain (no explicit keys)', () => {
    resetS3ClientForTests();
    const client = getS3Client();
    assert.ok(client);
    // Constructor must not have been given static keys
    const info = getCredentialResolutionInfo();
    assert.equal(info.usesDefaultCredentialProviderChain, true);
    assert.equal(info.region, 'eu-north-1');
    assert.equal(info.bucket, 'akanso-assets');
    assert.equal(info.hasExplicitConstructorCredentials, false);
    // Ensure env does not rely on access keys for this suite
    assert.equal(process.env.AWS_ACCESS_KEY_ID, undefined);
    assert.equal(process.env.AWS_SECRET_ACCESS_KEY, undefined);
  });
});

describe('authorization helpers for API semantics', () => {
  it('unauthenticated delete is rejected', () => {
    assert.throws(
      () => assertKeyAuthorizedForUser('providers/x/profile/y.webp', null),
      (e) => e.statusCode === 401,
    );
  });

  it('unauthorized deletion across namespaces', () => {
    assert.throws(
      () =>
        assertKeyAuthorizedForUser('customers/victim/profile/y.webp', {
          uid: 'attacker',
          role: 'customer',
        }),
      (e) => e.statusCode === 403,
    );
  });
});
