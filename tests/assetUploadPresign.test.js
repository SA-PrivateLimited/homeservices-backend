/**
 * Unit tests for photo reference normalization + upload token.
 */

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');

process.env.AWS_REGION = 'eu-north-1';
process.env.AWS_S3_BUCKET = 'akanso-assets';
process.env.AWS_CLOUDFRONT_DOMAIN = 'assets.akanso.in';
process.env.AWS_S3_LOCAL_FALLBACK = 'false';
process.env.NODE_ENV = 'test';

const {
  normalizePhotoReferences,
  isForbiddenInlinePayload,
} = require('../src/utils/normalizeAssetPhotos');
const {
  buildCustomerServiceRequestPhotoKey,
  buildProviderRequestPhotoKey,
  buildAdminCreativeKey,
  assertKeyAuthorizedForUser,
  isSensitiveObjectKey,
  keyFromUrlOrKey,
} = require('../src/utils/s3Keys');
const {signUploadToken, verifyUploadToken} = require('../src/utils/uploadToken');

describe('normalizePhotoReferences', () => {
  const customer = {uid: 'cust_abc', role: 'customer'};

  it('rejects base64 data URLs', () => {
    assert.equal(isForbiddenInlinePayload('data:image/png;base64,AAAA'), true);
    assert.throws(
      () =>
        normalizePhotoReferences(
          ['data:image/png;base64,iVBORw0KGgo='],
          customer,
        ),
      (err) => err.statusCode === 400 && /base64|asset reference/i.test(err.message),
    );
  });

  it('rejects file:// URIs', () => {
    assert.throws(
      () => normalizePhotoReferences(['file:///tmp/photo.jpg'], customer),
      (err) => err.statusCode === 400,
    );
  });

  it('accepts owned CloudFront keys/urls', () => {
    const key = 'customers/cust_abc/service-requests/pending/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
    const urls = normalizePhotoReferences(
      [{key, url: `https://assets.akanso.in/${key}`}],
      customer,
    );
    assert.equal(urls.length, 1);
    assert.equal(urls[0], `https://assets.akanso.in/${key}`);
  });

  it('rejects another customer key', () => {
    const key =
      'customers/other_user/service-requests/pending/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
    assert.throws(
      () => normalizePhotoReferences([{key}], customer),
      (err) => err.statusCode === 403,
    );
  });
});

describe('s3Keys service-request paths', () => {
  it('builds admin creative keys under admin/creatives', () => {
    const key = buildAdminCreativeKey('.png');
    assert.match(key, /^admin\/creatives\/[0-9a-f-]{36}\.png$/);
  });

  it('builds customer pending photo keys', () => {
    const key = buildCustomerServiceRequestPhotoKey('cust_1', '.jpg');
    assert.match(
      key,
      /^customers\/cust_1\/service-requests\/pending\/[0-9a-f-]{36}\.jpg$/,
    );
  });

  it('builds provider request photo keys', () => {
    const key = buildProviderRequestPhotoKey('prov_1', 'req_9', '.webp');
    assert.match(
      key,
      /^providers\/prov_1\/requests\/req_9\/photos\/[0-9a-f-]{36}\.webp$/,
    );
  });

  it('authorizes customer under customers/{uid}', () => {
    const key = buildCustomerServiceRequestPhotoKey('u1', '.png');
    assert.equal(
      assertKeyAuthorizedForUser(key, {uid: 'u1', role: 'customer'}),
      key,
    );
  });

  it('authorizes dual-role customer JWT for customers/ photos even if dbRole is provider', () => {
    const key = buildCustomerServiceRequestPhotoKey('u1', '.jpg');
    assert.equal(
      assertKeyAuthorizedForUser(key, {
        uid: 'u1',
        role: 'customer',
        activeRole: 'customer',
        dbRole: 'provider',
      }),
      key,
    );
  });

  it('still requires providers/ keys when acting as provider', () => {
    const key = buildCustomerServiceRequestPhotoKey('u1', '.jpg');
    assert.throws(
      () =>
        assertKeyAuthorizedForUser(key, {
          uid: 'u1',
          role: 'provider',
          dbRole: 'provider',
        }),
      (e) => e.statusCode === 403,
    );
  });
});

describe('uploadToken', () => {
  it('signs and verifies', () => {
    const token = signUploadToken(
      {
        key: 'customers/u1/service-requests/pending/x.jpg',
        userId: 'u1',
        contentType: 'image/jpeg',
        maxBytes: 5_000_000,
      },
      60,
    );
    const payload = verifyUploadToken(token);
    assert.equal(payload.userId, 'u1');
    assert.equal(payload.contentType, 'image/jpeg');
  });

  it('rejects tampered token', () => {
    const token = signUploadToken(
      {
        key: 'customers/u1/service-requests/pending/x.jpg',
        userId: 'u1',
        contentType: 'image/jpeg',
        maxBytes: 1000,
      },
      60,
    );
    assert.throws(
      () => verifyUploadToken(token.slice(0, -2) + 'aa'),
      (err) => err.statusCode === 403,
    );
  });
});

describe('sensitive asset keys + URL parsing', () => {
  it('marks KYC / booking document paths as sensitive', () => {
    assert.equal(
      isSensitiveObjectKey(
        'providers/p1/documents/idProof/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf',
      ),
      true,
    );
    assert.equal(
      isSensitiveObjectKey(
        'providers/p1/showcase/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webp',
      ),
      false,
    );
    assert.equal(
      isSensitiveObjectKey(
        'bookings/b1/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf',
      ),
      true,
    );
  });

  it('rewrites legacy distribution hostname to object key when configured', () => {
    const prev = process.env.AWS_CLOUDFRONT_DISTRIBUTION_HOSTNAME;
    try {
      process.env.AWS_CLOUDFRONT_DISTRIBUTION_HOSTNAME =
        'dpyk9otyl50r.cloudfront.net';
      const key =
        'providers/p1/showcase/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webp';
      assert.equal(
        keyFromUrlOrKey(`https://dpyk9otyl50r.cloudfront.net/${key}`),
        key,
      );
    } finally {
      if (prev === undefined) delete process.env.AWS_CLOUDFRONT_DISTRIBUTION_HOSTNAME;
      else process.env.AWS_CLOUDFRONT_DISTRIBUTION_HOSTNAME = prev;
    }
  });

  it('rejects raw S3 bucket URLs', () => {
    assert.throws(
      () =>
        keyFromUrlOrKey(
          'https://akanso-assets.s3.eu-north-1.amazonaws.com/customers/u1/x.webp',
        ),
      (err) => err.statusCode === 400,
    );
  });
});
