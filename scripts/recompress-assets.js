#!/usr/bin/env node
/**
 * Recompress existing CDN images referenced in MongoDB (same S3 key overwrite).
 *
 * Usage:
 *   node scripts/recompress-assets.js --dry-run
 *   node scripts/recompress-assets.js --dry-run --limit=50
 *   node scripts/recompress-assets.js --apply --limit=100
 *   node scripts/recompress-assets.js --apply --only=provider-profile
 *
 * Safe defaults: dry-run unless --apply. Never touches /documents/ keys.
 * Requires Mongo + AWS credentials (instance role or AWS_PROFILE).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Provider = require('../src/models/Provider');
const User = require('../src/models/User');
const Employee = require('../src/models/Employee');
const ServiceRequest = require('../src/models/ServiceRequest');
const Client = require('../src/models/Client');
const BrandCreative = require('../src/models/BrandCreative');
const {keyFromUrlOrKey} = require('../src/utils/s3Keys');
const {optimizeStoredImage} = require('../src/services/optimizeStoredImage');

function parseArgs(argv) {
  const out = {
    dryRun: true,
    limit: 0,
    only: null,
  };
  for (const arg of argv) {
    if (arg === '--apply') out.dryRun = false;
    if (arg === '--dry-run') out.dryRun = true;
    if (arg.startsWith('--limit=')) out.limit = Number(arg.slice(8)) || 0;
    if (arg.startsWith('--only=')) out.only = arg.slice(7).trim() || null;
  }
  return out;
}

function collectUrl(url, bucket, source) {
  const raw = String(url || '').trim();
  if (!raw) return;
  if (!/^https?:\/\//i.test(raw) && !raw.includes('/')) return;
  try {
    const key = keyFromUrlOrKey(raw);
    if (!key || key.includes('/documents/')) return;
    if (!bucket.has(key)) bucket.set(key, source);
  } catch {
    /* skip non-CDN / invalid */
  }
}

async function gatherKeys(only) {
  /** @type {Map<string, string>} */
  const keys = new Map();

  if (!only || only === 'provider-profile' || only === 'provider-showcase') {
    const providers = await Provider.find({})
      .select('profileImage photos')
      .lean();
    for (const p of providers) {
      if (!only || only === 'provider-profile') {
        collectUrl(p.profileImage, keys, 'provider-profile');
      }
      if (!only || only === 'provider-showcase') {
        for (const photo of p.photos || []) {
          collectUrl(photo, keys, 'provider-showcase');
        }
      }
    }
  }

  if (!only || only === 'customer-profile') {
    const users = await User.find({profileImage: {$nin: [null, '']}})
      .select('profileImage')
      .lean();
    for (const u of users) {
      collectUrl(u.profileImage, keys, 'customer-profile');
    }
  }

  if (!only || only === 'employee-photo') {
    const employees = await Employee.find({photoUrl: {$nin: [null, '']}})
      .select('photoUrl')
      .lean();
    for (const e of employees) {
      collectUrl(e.photoUrl, keys, 'employee-photo');
    }
  }

  if (!only || only === 'service-request-photo') {
    const requests = await ServiceRequest.find({})
      .select('photos completionPhotos')
      .lean();
    for (const r of requests) {
      for (const photo of r.photos || []) {
        collectUrl(photo, keys, 'service-request-photo');
      }
      for (const photo of r.completionPhotos || []) {
        collectUrl(photo, keys, 'service-request-photo');
      }
    }
  }

  if (!only || only === 'client-logo') {
    const clients = await Client.find({logoUrl: {$nin: [null, '']}})
      .select('logoUrl')
      .lean();
    for (const c of clients) {
      collectUrl(c.logoUrl, keys, 'client-logo');
    }
  }

  if (!only || only === 'creative') {
    const creatives = await BrandCreative.find({}).select('key url').lean();
    for (const c of creatives) {
      if (c.key) {
        try {
          keys.set(c.key, 'creative');
        } catch {
          /* ignore */
        }
      } else {
        collectUrl(c.url, keys, 'creative');
      }
    }
  }

  return keys;
}

const SOURCE_KIND = {
  'provider-profile': 'profile',
  'customer-profile': 'profile',
  'employee-photo': 'profile',
  'provider-showcase': 'photo',
  'service-request-photo': 'photo',
  'client-logo': 'logo',
  creative: 'logo',
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL;
  if (!mongoUri) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }

  console.log(
    `[recompress] mode=${args.dryRun ? 'DRY-RUN' : 'APPLY'} only=${args.only || 'all'} limit=${args.limit || 'none'}`,
  );

  await mongoose.connect(mongoUri);
  const keyMap = await gatherKeys(args.only);
  let entries = [...keyMap.entries()];
  if (args.limit > 0) entries = entries.slice(0, args.limit);

  console.log(`[recompress] candidates=${entries.length}`);

  let optimized = 0;
  let skipped = 0;
  let failed = 0;
  let savedTotal = 0;
  let originalTotal = 0;

  for (const [key, source] of entries) {
    try {
      const result = await optimizeStoredImage(key, {
        dryRun: args.dryRun,
        userId: 'recompress-script',
        kind: SOURCE_KIND[source] || undefined,
      });
      originalTotal += result.originalBytes || 0;
      if (result.skipped) {
        skipped += 1;
        console.log(`  skip  ${source} ${key} (${result.reason})`);
      } else {
        optimized += 1;
        savedTotal += result.savedBytes || 0;
        console.log(
          `  ${args.dryRun ? 'would' : 'did'}  ${source} ${key}  ${result.originalBytes} → ${result.optimizedBytes} (−${result.savedBytes})`,
        );
      }
    } catch (err) {
      failed += 1;
      console.error(`  fail  ${source} ${key}: ${err.message || err}`);
    }
  }

  console.log('\n[recompress] summary');
  console.log(`  optimized: ${optimized}`);
  console.log(`  skipped:   ${skipped}`);
  console.log(`  failed:    ${failed}`);
  console.log(`  bytes in:  ${originalTotal}`);
  console.log(`  bytes saved (est): ${savedTotal}`);
  console.log(
    `  reduction: ${
      originalTotal
        ? `${((savedTotal / originalTotal) * 100).toFixed(1)}%`
        : 'n/a'
    }`,
  );

  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
