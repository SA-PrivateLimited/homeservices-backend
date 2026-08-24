/**
 * Guard: browser presigned PUT URLs must not embed flexible checksum params.
 * AWS SDK v3.1100+ defaults would add empty-body CRC32 and break browser uploads.
 */

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3');
const {getSignedUrl} = require('@aws-sdk/s3-request-presigner');

const fakeCredentials = {
  accessKeyId: 'AKIATEST',
  secretAccessKey: 'secretsecretsecretsecr',
  sessionToken: 'tok',
};

async function signWith(client) {
  const command = new PutObjectCommand({
    Bucket: 'akanso-assets',
    Key: 'customers/test/profile.jpg',
    ContentType: 'image/jpeg',
  });
  return getSignedUrl(client, command, {expiresIn: 900});
}

describe('S3 presigned PUT checksum settings', () => {
  it('default SDK client embeds CRC32 (documents the failure mode)', async () => {
    const client = new S3Client({
      region: 'eu-north-1',
      credentials: fakeCredentials,
    });
    const url = await signWith(client);
    assert.match(url, /x-amz-checksum-crc32/i);
    assert.match(url, /x-amz-sdk-checksum-algorithm=CRC32/i);
  });

  it('WHEN_REQUIRED client does not embed checksum params', async () => {
    const client = new S3Client({
      region: 'eu-north-1',
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: fakeCredentials,
    });
    const url = await signWith(client);
    assert.doesNotMatch(url, /x-amz-checksum/i);
    assert.doesNotMatch(url, /x-amz-sdk-checksum-algorithm/i);
  });
});
