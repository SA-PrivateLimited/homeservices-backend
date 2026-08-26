/**
 * AWS S3 asset service (SDK v3).
 *
 * Production: EC2 instance IAM role via the default credential provider chain
 *   (IMDS). Do NOT configure AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY —
 *   env credentials take precedence over the instance role in the SDK chain.
 * Local/dev: AWS_S3_LOCAL_FALLBACK=true writes to ./uploads (no AWS needed),
 *   or AWS_PROFILE / SSO. Static keys are not injected into S3Client.
 *
 * Public asset URLs always use AWS_CLOUDFRONT_DOMAIN (assets.akanso.in),
 * never raw S3 bucket URLs or the *.cloudfront.net distribution hostname.
 */

const path = require('path');
const fs = require('fs');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const {getSignedUrl} = require('@aws-sdk/s3-request-presigner');
const {normalizeObjectKey} = require('../utils/s3Keys');
const {createHttpError} = require('../utils/assetValidation');
const {UPLOAD_ROOT} = require('../middleware/upload');

let s3Client = null;

function getRegion() {
  return process.env.AWS_REGION || 'eu-north-1';
}

function getBucket() {
  const bucket = process.env.AWS_S3_BUCKET || 'akanso-assets';
  if (!bucket) {
    throw createHttpError(500, 'S3 bucket is not configured', 'Config Error');
  }
  return bucket;
}

function getCloudFrontDomain() {
  return (process.env.AWS_CLOUDFRONT_DOMAIN || 'assets.akanso.in')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

function isDev() {
  return (process.env.NODE_ENV || 'development') !== 'production';
}

function localFallbackForced() {
  return String(process.env.AWS_S3_LOCAL_FALLBACK || '').toLowerCase() === 'true';
}

/** Local disk uploads are allowed only in non-production with explicit fallback. */
function localDiskAllowed() {
  if (!isDev()) return false;
  return localFallbackForced();
}

function hasStaticAwsAccessKeys() {
  return (
    Boolean(process.env.AWS_ACCESS_KEY_ID) ||
    Boolean(process.env.AWS_SECRET_ACCESS_KEY)
  );
}

/**
 * Env credentials override IMDS in the AWS SDK default chain.
 * Production must fail closed so the EC2 instance role is the only path.
 */
function assertProductionUsesInstanceRoleOnly() {
  if (!hasStaticAwsAccessKeys()) return;
  if (!isDev()) {
    throw createHttpError(
      500,
      'Static AWS access keys must not be configured in production. Unset AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY so the EC2 instance IAM role is used.',
      'Config Error',
    );
  }
  console.warn(
    '[s3] AWS_ACCESS_KEY_ID/SECRET are set. The AWS SDK will prefer them over AWS_PROFILE/IMDS. Unset them and use AWS_PROFILE/SSO for local development.',
  );
}

function isLoopbackUrl(value) {
  try {
    const parsed = new URL(value);
    return (
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '::1' ||
      parsed.hostname === '0.0.0.0'
    );
  } catch {
    return false;
  }
}

function publicApiBase() {
  const fromEnv = (process.env.PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
  if (fromEnv && !isLoopbackUrl(fromEnv)) return fromEnv;
  return '';
}

/**
 * Lazily create S3Client using the default credential provider chain only
 * (instance IAM role in production). Credentials are never passed to the
 * constructor. Production refuses to start S3 ops if static access keys are set.
 *
 * requestChecksumCalculation MUST be WHEN_REQUIRED for browser presigned PUTs.
 * SDK v3.1100+ defaults to WHEN_SUPPORTED, which embeds x-amz-checksum-crc32
 * for an empty body into the signed URL. Browsers then PUT the real file
 * without that checksum → S3 rejects (often surfaced as opaque CORS/network).
 */
function getS3Client() {
  if (!s3Client) {
    assertProductionUsesInstanceRoleOnly();
    s3Client = new S3Client({
      region: getRegion(),
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return s3Client;
}

/** Test helper — inject a mock client */
function setS3ClientForTests(client) {
  s3Client = client;
}

function resetS3ClientForTests() {
  s3Client = null;
}

/**
 * Canonical public CDN URL for an object key.
 * Always https://{AWS_CLOUDFRONT_DOMAIN}/<key> (e.g. assets.akanso.in).
 * Never emits raw S3 URLs or *.cloudfront.net distribution hostnames.
 */
function generateCloudFrontUrl(key) {
  const normalized = normalizeObjectKey(key);
  const domain = getCloudFrontDomain();
  if (
    /amazonaws\.com$/i.test(domain) ||
    /\.cloudfront\.net$/i.test(domain) ||
    /^s3[.-]/i.test(domain)
  ) {
    throw createHttpError(
      500,
      'AWS_CLOUDFRONT_DOMAIN must be the canonical CDN host (assets.akanso.in), not an S3 or *.cloudfront.net hostname',
      'Config Error',
    );
  }
  return `https://${domain}/${normalized}`;
}

function generateLocalUrl(key) {
  const normalized = normalizeObjectKey(key);
  const base = publicApiBase();
  // Prefer a public API host. Never persist loopback URLs — those break
  // production admin/customer apps that share the same Mongo document.
  if (base) return `${base}/uploads/${normalized}`;
  return `/uploads/${normalized}`;
}

function logS3(operation, meta = {}) {
  const safe = {
    operation,
    key: meta.key,
    userId: meta.userId,
    success: meta.success,
    contentType: meta.contentType,
    size: meta.size,
    storage: meta.storage,
  };
  if (meta.success) {
    console.log('[s3]', JSON.stringify(safe));
  } else {
    console.warn('[s3]', JSON.stringify({...safe, error: meta.error}));
  }
}

function isCredentialError(err) {
  const name = err?.name || '';
  const message = String(err?.message || '');
  return (
    name === 'CredentialsProviderError' ||
    name === 'InvalidAccessKeyId' ||
    name === 'UnrecognizedClientException' ||
    /could not load credentials|credential/i.test(message)
  );
}

function mapAwsError(err) {
  const name = err?.name || '';
  const status = err?.$metadata?.httpStatusCode;
  if (name === 'NoSuchKey' || status === 404) {
    return createHttpError(404, 'Object not found', 'Not Found');
  }
  if (name === 'AccessDenied' || status === 403) {
    return createHttpError(403, 'Access denied to storage', 'Forbidden');
  }
  if (isCredentialError(err) && isDev()) {
    return createHttpError(
      503,
      'Photo upload is unavailable locally. Enable AWS_S3_LOCAL_FALLBACK=true or configure AWS credentials.',
      'Storage Unavailable',
    );
  }
  const wrapped = createHttpError(
    500,
    'Could not upload photo. Please try again.',
    'Storage Error',
  );
  wrapped.cause = err;
  return wrapped;
}

async function uploadToLocalDisk({body, key, contentType, userId}) {
  const normalizedKey = normalizeObjectKey(key);
  const absPath = path.join(UPLOAD_ROOT, normalizedKey);
  fs.mkdirSync(path.dirname(absPath), {recursive: true});
  fs.writeFileSync(absPath, body);
  const size = Buffer.byteLength(body);
  const result = {
    key: normalizedKey,
    url: generateLocalUrl(normalizedKey),
    contentType,
    size,
  };
  logS3('uploadFile', {
    key: normalizedKey,
    userId,
    success: true,
    contentType,
    size,
    storage: 'local',
  });
  return result;
}

/**
 * Upload a Buffer (or Uint8Array) to S3 (or local disk in dev fallback).
 */
async function uploadFile({body, key, contentType, userId} = {}) {
  const normalizedKey = normalizeObjectKey(key);
  if (!body || !(Buffer.isBuffer(body) || body instanceof Uint8Array)) {
    throw createHttpError(400, 'Upload body must be a Buffer', 'Bad Request');
  }
  if (!contentType) {
    throw createHttpError(400, 'contentType is required', 'Bad Request');
  }

  const size = Buffer.byteLength(body);

  if (localDiskAllowed()) {
    return uploadToLocalDisk({
      body,
      key: normalizedKey,
      contentType,
      userId,
    });
  }

  const bucket = getBucket();

  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: normalizedKey,
        Body: body,
        ContentType: contentType,
      }),
    );

    const result = {
      key: normalizedKey,
      url: generateCloudFrontUrl(normalizedKey),
      contentType,
      size,
    };
    logS3('uploadFile', {
      key: normalizedKey,
      userId,
      success: true,
      contentType,
      size,
      storage: 's3',
    });
    return result;
  } catch (err) {
    if (err.statusCode) throw err;
    logS3('uploadFile', {
      key: normalizedKey,
      userId,
      success: false,
      error: err.name || 'Error',
      storage: 's3',
    });

    if (isDev() && isCredentialError(err)) {
      console.warn(
        '[s3] Falling back to local disk uploads (no AWS credentials). Set AWS_S3_LOCAL_FALLBACK=true to skip S3 attempts.',
      );
      return uploadToLocalDisk({
        body,
        key: normalizedKey,
        contentType,
        userId,
      });
    }

    throw mapAwsError(err);
  }
}

async function getObject(key, {userId} = {}) {
  const normalizedKey = normalizeObjectKey(key);
  try {
    const response = await getS3Client().send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: normalizedKey,
      }),
    );
    logS3('getObject', {key: normalizedKey, userId, success: true});
    return {
      key: normalizedKey,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      body: response.Body,
      lastModified: response.LastModified,
    };
  } catch (err) {
    if (err.statusCode) throw err;
    const absPath = path.join(UPLOAD_ROOT, normalizedKey);
    if (isDev() && fs.existsSync(absPath)) {
      const buf = fs.readFileSync(absPath);
      return {
        key: normalizedKey,
        contentType: 'application/octet-stream',
        contentLength: buf.length,
        body: buf,
        lastModified: fs.statSync(absPath).mtime,
      };
    }
    logS3('getObject', {
      key: normalizedKey,
      userId,
      success: false,
      error: err.name || 'Error',
    });
    throw mapAwsError(err);
  }
}

async function deleteObject(key, {userId} = {}) {
  const normalizedKey = normalizeObjectKey(key);
  const absPath = path.join(UPLOAD_ROOT, normalizedKey);
  if (isDev() && fs.existsSync(absPath)) {
    try {
      fs.unlinkSync(absPath);
      logS3('deleteObject', {
        key: normalizedKey,
        userId,
        success: true,
        storage: 'local',
      });
      return {key: normalizedKey, deleted: true};
    } catch {
      /* fall through to S3 */
    }
  }
  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: normalizedKey,
      }),
    );
    logS3('deleteObject', {
      key: normalizedKey,
      userId,
      success: true,
      storage: 's3',
    });
    return {key: normalizedKey, deleted: true};
  } catch (err) {
    if (err.statusCode) throw err;
    logS3('deleteObject', {
      key: normalizedKey,
      userId,
      success: false,
      error: err.name || 'Error',
    });
    throw mapAwsError(err);
  }
}

function getCredentialResolutionInfo() {
  const staticKeysPresent = hasStaticAwsAccessKeys();
  return {
    region: getRegion(),
    bucket: getBucket(),
    cloudFrontDomain: getCloudFrontDomain(),
    localFallbackRequested: localFallbackForced(),
    localDiskAllowed: localDiskAllowed(),
    credentialMode: 'iam-role-default-chain-only',
    usesDefaultCredentialProviderChain: true,
    hasExplicitConstructorCredentials: false,
    /** True when env keys are set — they override IMDS in the SDK chain. */
    staticKeysPresent,
    /** Production refuses to create an S3 client while this is true. */
    productionRefusesStaticKeys: !isDev(),
  };
}

/**
 * Whether we should issue S3 presigned URLs (vs local direct-upload tokens).
 */
function shouldUseS3Presign() {
  if (localDiskAllowed()) return false;
  return true;
}

/**
 * Create a time-limited PUT URL for direct client → S3 upload.
 * Browser uploads must send only Content-Type (see returned headers).
 * Do not add checksum query params — clients cannot satisfy empty-body CRC32.
 */
async function createPresignedPutUrl({
  key,
  contentType,
  expiresIn = 900,
  userId,
} = {}) {
  const normalizedKey = normalizeObjectKey(key);
  if (!contentType) {
    throw createHttpError(400, 'contentType is required', 'Bad Request');
  }
  const ttl = Math.min(Math.max(Number(expiresIn) || 900, 60), 3600);

  try {
    const command = new PutObjectCommand({
      Bucket: getBucket(),
      Key: normalizedKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(getS3Client(), command, {
      expiresIn: ttl,
    });
    if (
      /x-amz-checksum/i.test(uploadUrl) ||
      /x-amz-sdk-checksum-algorithm/i.test(uploadUrl)
    ) {
      throw createHttpError(
        500,
        'Presigned upload URL was generated with checksum parameters. Check S3 client checksum settings.',
        'Storage Configuration',
      );
    }
    const result = {
      uploadUrl,
      key: normalizedKey,
      url: generateCloudFrontUrl(normalizedKey),
      method: 'PUT',
      headers: {'Content-Type': contentType},
      expiresIn: ttl,
      storage: 's3',
    };
    logS3('createPresignedPutUrl', {
      key: normalizedKey,
      userId,
      success: true,
      contentType,
      storage: 's3',
    });
    return result;
  } catch (err) {
    if (err.statusCode) throw err;
    logS3('createPresignedPutUrl', {
      key: normalizedKey,
      userId,
      success: false,
      error: err.name || 'Error',
      storage: 's3',
    });
    if (isDev() && isCredentialError(err)) {
      const wrapped = createHttpError(
        503,
        'S3 presign unavailable locally',
        'Storage Unavailable',
      );
      wrapped.cause = err;
      wrapped.code = 'S3_PRESIGN_UNAVAILABLE';
      throw wrapped;
    }
    throw mapAwsError(err);
  }
}

async function headObject(key, {userId} = {}) {
  const normalizedKey = normalizeObjectKey(key);
  if (localDiskAllowed()) {
    const absPath = path.join(UPLOAD_ROOT, normalizedKey);
    if (!fs.existsSync(absPath)) {
      throw createHttpError(404, 'Object not found', 'Not Found');
    }
    const stat = fs.statSync(absPath);
    return {
      key: normalizedKey,
      contentLength: stat.size,
      contentType: 'application/octet-stream',
    };
  }
  try {
    const response = await getS3Client().send(
      new HeadObjectCommand({
        Bucket: getBucket(),
        Key: normalizedKey,
      }),
    );
    logS3('headObject', {key: normalizedKey, userId, success: true});
    return {
      key: normalizedKey,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
    };
  } catch (err) {
    if (err.statusCode) throw err;
    const absPath = path.join(UPLOAD_ROOT, normalizedKey);
    if (isDev() && fs.existsSync(absPath)) {
      const stat = fs.statSync(absPath);
      return {
        key: normalizedKey,
        contentLength: stat.size,
        contentType: 'application/octet-stream',
      };
    }
    logS3('headObject', {
      key: normalizedKey,
      userId,
      success: false,
      error: err.name || 'Error',
    });
    throw mapAwsError(err);
  }
}

module.exports = {
  getS3Client,
  setS3ClientForTests,
  resetS3ClientForTests,
  generateCloudFrontUrl,
  uploadFile,
  getObject,
  deleteObject,
  headObject,
  createPresignedPutUrl,
  shouldUseS3Presign,
  localDiskAllowed,
  getCredentialResolutionInfo,
  getRegion,
  getBucket,
  getCloudFrontDomain,
};
