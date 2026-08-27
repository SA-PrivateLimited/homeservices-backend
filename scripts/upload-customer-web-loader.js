/**
 * Upload Customer Web boot loader SVG to S3 (CloudFront: assets.akanso.in).
 *
 * Object key:
 *   services/loader/LoaderAkanso.svg
 *
 * Usage (from homeservices-backend, with EC2 role or AWS_PROFILE):
 *   node scripts/upload-customer-web-loader.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {PutObjectCommand} = require('@aws-sdk/client-s3');

process.env.AWS_S3_LOCAL_FALLBACK = 'false';

const s3 = require('../src/services/s3.service');

const KEY = 'services/loader/LoaderAkanso.svg';

const SOURCE = path.resolve(
  __dirname,
  '../../homeServices-customer-web/public/assets/LoaderAkanso.svg',
);

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Missing source file: ${SOURCE}`);
  }

  const bucket = s3.getBucket();
  const domain = s3.getCloudFrontDomain();
  const body = fs.readFileSync(SOURCE);
  const sizeMb = (body.length / (1024 * 1024)).toFixed(2);

  await s3.getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: KEY,
      Body: body,
      ContentType: 'image/svg+xml',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  console.log(`uploaded s3://${bucket}/${KEY} (${sizeMb} MB)`);
  console.log(`  https://${domain}/${KEY}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
