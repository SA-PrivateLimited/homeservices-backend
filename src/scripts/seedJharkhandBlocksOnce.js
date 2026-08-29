/**
 * One-time import: all Jharkhand district blocks into MongoDB.
 *
 * Source: src/data/jharkhand-admin-geography.js (Division → District → Block).
 * Akanso stores District → Block only.
 *
 * Idempotent — skips blocks that already exist by _id or district+name.
 *
 * Run:
 *   cd homeservices-backend
 *   npm run seed:jh-blocks
 *
 * Requires MONGODB_URI (or MONGO_URI) in .env
 */

require('dotenv').config();
const mongoose = require('mongoose');
const jharkhand = require('../data/jharkhand-admin-geography');

function buildMongoUri() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) return null;
  const dbName = process.env.MONGODB_DB_NAME || 'home-services';
  return uri.endsWith('/') ? `${uri}${dbName}` : `${uri}/${dbName}`;
}

const STATE_CODE = jharkhand.code || 'JH';
const STATE_ID = 'st_jh';
const STATE_NAME = jharkhand.name || 'Jharkhand';

/** Master-data district name → LGD / DB district name */
const DISTRICT_DB_NAMES = {
  'Saraikela-Kharsawan': 'Seraikela-Kharsawan',
};

function slugId(prefix, name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${prefix}_${slug}`;
}

function blockIdFor(districtName, blockName) {
  return slugId('blk', `${STATE_CODE}-${districtName}-${blockName}`);
}

function districtIdFor(districtName) {
  return slugId('dt', `${STATE_CODE}-${districtName}`);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flattenDistricts() {
  /** @type {Array<{name: string, blocks: string[]}>} */
  const out = [];
  for (const division of jharkhand.divisions || []) {
    for (const district of division.districts || []) {
      out.push({
        name: String(district.name || '').trim(),
        blocks: (district.blocks || []).map((b) => String(b).trim()).filter(Boolean),
      });
    }
  }
  return out;
}

async function resolveDistrict(District, districtName) {
  const dbName = DISTRICT_DB_NAMES[districtName] || districtName;
  const expectedDistrictId = districtIdFor(dbName);
  let district = await District.findById(expectedDistrictId).lean();
  if (district) return district;

  district = await District.findOne({
    stateId: STATE_ID,
    name: new RegExp(`^${escapeRegex(dbName)}$`, 'i'),
  }).lean();
  if (district) return district;

  district = await District.findOne({
    stateId: STATE_ID,
    name: new RegExp(`^${escapeRegex(districtName)}$`, 'i'),
  }).lean();

  return district;
}

async function run() {
  const fullUri = buildMongoUri();
  if (!fullUri) {
    console.error('Missing MONGODB_URI (or MONGO_URI) in .env');
    process.exit(1);
  }

  await mongoose.connect(fullUri);
  console.log(`Connected to MongoDB (${process.env.MONGODB_DB_NAME || 'home-services'})`);

  const {ensureGeographySeeded} = require('../utils/geographySeed');
  await ensureGeographySeeded();

  const District = require('../models/District');
  const Block = require('../models/Block');

  try {
    const ctrl = require('../controllers/admin/geographyController');
    if (typeof ctrl.invalidateGeographyMetaCache === 'function') {
      ctrl.invalidateGeographyMetaCache();
    }
  } catch (_) {
    // fine if controller not loaded
  }

  const districts = flattenDistricts();
  let inserted = 0;
  let skipped = 0;
  let missingDistrict = 0;

  console.log(`Importing blocks for ${districts.length} Jharkhand districts…\n`);

  for (const entry of districts) {
    const districtName = entry.name;
    if (!districtName) continue;

    const district = await resolveDistrict(District, districtName);
    if (!district) {
      console.warn(`District not found: ${districtName} — skipping`);
      missingDistrict += 1;
      continue;
    }

    let districtInserted = 0;
    for (const blockName of entry.blocks) {
      const _id = blockIdFor(district.name, blockName);
      const exists = await Block.findOne({
        $or: [
          {_id},
          {
            districtId: district._id,
            name: new RegExp(`^${escapeRegex(blockName)}$`, 'i'),
          },
        ],
      })
        .select('_id name')
        .lean();

      if (exists) {
        skipped += 1;
        continue;
      }

      await Block.create({
        _id,
        name: blockName,
        districtId: district._id,
        districtName: district.name,
        stateId: STATE_ID,
        stateName: district.stateName || STATE_NAME,
        isActive: true,
      });
      inserted += 1;
      districtInserted += 1;
    }

    console.log(
      `${district.name}: +${districtInserted} new, ${entry.blocks.length - districtInserted} existing`,
    );
  }

  console.log('');
  console.log(
    `Done. Inserted: ${inserted}, skipped (existing): ${skipped}, missing districts: ${missingDistrict}`,
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
