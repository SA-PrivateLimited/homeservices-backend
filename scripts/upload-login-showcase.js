/**
 * Upload Customer Web login showcase PNGs to S3 (CloudFront: assets.akanso.in).
 * Usage: node scripts/upload-login-showcase.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {PutObjectCommand} = require('@aws-sdk/client-s3');

process.env.AWS_S3_LOCAL_FALLBACK = 'false';

const s3 = require('../src/services/s3.service');

const FILES = [
  'login-electrician.png',
  'login-plumber.png',
  'login-carpenter.png',
  'login-driver.png',
  'login-generic.png',
];

const SOURCE_DIR = path.resolve(
  __dirname,
  '../../HomeServicesCustomerWeb/public/login',
);

async function main() {
  const bucket = s3.getBucket();
  const domain = s3.getCloudFrontDomain();
  for (const file of FILES) {
    const abs = path.join(SOURCE_DIR, file);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing ${abs}`);
    }
    const key = `services/branding/homeservices/login/${file}`;
    const body = fs.readFileSync(abs);
    await s3.getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'image/png',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    console.log(`uploaded s3://${bucket}/${key}`);
    console.log(`  https://${domain}/${key}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
