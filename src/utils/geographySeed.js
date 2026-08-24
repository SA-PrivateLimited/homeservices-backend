/**
 * Seed all Indian states + districts into MongoDB.
 * Source of truth: india-states-districts-2026.json (LGD / IGOD, Aug 2026).
 * Idempotent — skips existing ids / names; backfills pincode when missing.
 */

const path = require('path');
const State = require('../models/State');
const District = require('../models/District');

/** ISO-style codes for stable state _id slugs (st_jh, st_br, …). */
const STATE_CODES = {
  'Andaman and Nicobar Islands': 'AN',
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AR',
  Assam: 'AS',
  Bihar: 'BR',
  Chandigarh: 'CH',
  Chhattisgarh: 'CG',
  'Dadra and Nagar Haveli and Daman and Diu': 'DH',
  Delhi: 'DL',
  Goa: 'GA',
  Gujarat: 'GJ',
  Haryana: 'HR',
  'Himachal Pradesh': 'HP',
  'Jammu and Kashmir': 'JK',
  Jharkhand: 'JH',
  Karnataka: 'KA',
  Kerala: 'KL',
  Ladakh: 'LA',
  Lakshadweep: 'LD',
  'Madhya Pradesh': 'MP',
  Maharashtra: 'MH',
  Manipur: 'MN',
  Meghalaya: 'ML',
  Mizoram: 'MZ',
  Nagaland: 'NL',
  Odisha: 'OD',
  Puducherry: 'PY',
  Punjab: 'PB',
  Rajasthan: 'RJ',
  Sikkim: 'SK',
  'Tamil Nadu': 'TN',
  Telangana: 'TS',
  Tripura: 'TR',
  'Uttar Pradesh': 'UP',
  Uttarakhand: 'UK',
  'West Bengal': 'WB',
};

/**
 * Delhi LGD uses short names ("Central"); Nominatim / UI often use "Central Delhi".
 * Prefer the longer form so GPS matching and existing rows stay aligned.
 */
function normalizeDistrictName(stateName, districtName) {
  const name = String(districtName || '').trim();
  if (stateName !== 'Delhi') return name;
  if (name === 'New Delhi' || name === 'Shahdara') return name;
  if (name.endsWith(' Delhi')) return name;
  return `${name} Delhi`;
}

function loadSeedFrom2026File() {
  const raw = require(path.join(__dirname, 'india-states-districts-2026.json'));
  const list = raw.statesAndUnionTerritories || [];
  return list.map((entry) => {
    const name = entry.name;
    const code =
      STATE_CODES[name] ||
      String(name)
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 3);
    const districts = (entry.districts || []).map((d) => ({
      name: normalizeDistrictName(name, d),
    }));
    return {code, name, type: entry.type, districts};
  });
}

/** @type {Array<{code: string, name: string, districts: Array<{name: string, pincode?: string}>}>} */
const SEED = loadSeedFrom2026File();

function slugId(prefix, name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${prefix}_${slug}`;
}

/** Process-level: seed runs once; concurrent callers share the same promise. */
let seedPromise = null;
let seedDone = false;

function invalidateMetaCacheSafe() {
  try {
    const ctrl = require('../controllers/admin/geographyController');
    if (typeof ctrl.invalidateGeographyMetaCache === 'function') {
      ctrl.invalidateGeographyMetaCache();
    }
  } catch (_) {
    // Controller may not be loaded yet during early boot — fine.
  }
}

/**
 * Ensure states/districts exist. Safe to call on every geography request.
 * Runs the heavy loop at most once per process.
 * @returns {{statesCreated: number, districtsCreated: number, districtsUpdated: number}}
 */
async function ensureGeographySeeded() {
  if (seedDone) {
    return {statesCreated: 0, districtsCreated: 0, districtsUpdated: 0};
  }
  if (seedPromise) {
    return seedPromise;
  }

  seedPromise = (async () => {
    let statesCreated = 0;
    let districtsCreated = 0;
    let districtsUpdated = 0;

    const existingStates = await State.find({})
      .select('_id name')
      .lean();
    const stateById = new Map(existingStates.map((s) => [s._id, s]));
    const stateByName = new Map(
      existingStates.map((s) => [String(s.name).toLowerCase(), s]),
    );

    const existingDistricts = await District.find({})
      .select('_id name stateId pincode')
      .lean();
    const districtById = new Map(existingDistricts.map((d) => [d._id, d]));
    const districtByStateName = new Map();
    for (const d of existingDistricts) {
      districtByStateName.set(
        `${d.stateId}::${String(d.name).toLowerCase()}`,
        d,
      );
    }

    const statesToInsert = [];
    const districtsToInsert = [];
    const districtPincodeUpdates = [];

    for (const entry of SEED) {
      const stateId = slugId('st', entry.code || entry.name);
      let state =
        stateById.get(stateId) || stateByName.get(entry.name.toLowerCase());
      if (!state) {
        state = {
          _id: stateId,
          name: entry.name,
          code: entry.code,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        statesToInsert.push(state);
        stateById.set(stateId, state);
        stateByName.set(entry.name.toLowerCase(), state);
        statesCreated += 1;
      }

      const sid = state._id;
      const sname = state.name || entry.name;

      for (const district of entry.districts || []) {
        const districtName =
          typeof district === 'string' ? district : district.name;
        if (!districtName) continue;
        const pincode =
          typeof district === 'string'
            ? ''
            : String(district.pincode || '').trim();
        const districtId = slugId('dt', `${entry.code}-${districtName}`);
        const exists =
          districtById.get(districtId) ||
          districtByStateName.get(`${sid}::${districtName.toLowerCase()}`);

        if (!exists) {
          const doc = {
            _id: districtId,
            name: districtName,
            stateId: sid,
            stateName: sname,
            pincode: pincode || undefined,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          districtsToInsert.push(doc);
          districtById.set(districtId, doc);
          districtByStateName.set(
            `${sid}::${districtName.toLowerCase()}`,
            doc,
          );
          districtsCreated += 1;
          continue;
        }

        if (pincode && !exists.pincode) {
          districtPincodeUpdates.push({_id: exists._id, pincode});
          exists.pincode = pincode;
          districtsUpdated += 1;
        }
      }
    }

    if (statesToInsert.length) {
      await State.insertMany(statesToInsert, {ordered: false}).catch(() => {});
    }
    if (districtsToInsert.length) {
      await District.insertMany(districtsToInsert, {ordered: false}).catch(
        () => {},
      );
    }
    if (districtPincodeUpdates.length) {
      await Promise.all(
        districtPincodeUpdates.map((u) =>
          District.updateOne(
            {_id: u._id},
            {$set: {pincode: u.pincode, updatedAt: new Date()}},
          ),
        ),
      );
    }

    if (statesCreated || districtsCreated || districtsUpdated) {
      invalidateMetaCacheSafe();
    }

    seedDone = true;
    return {statesCreated, districtsCreated, districtsUpdated};
  })();

  try {
    return await seedPromise;
  } catch (err) {
    seedPromise = null;
    throw err;
  }
}

/** Allow tests / admin tooling to force a re-seed on next call. */
function resetGeographySeedFlag() {
  seedDone = false;
  seedPromise = null;
}

module.exports = {
  SEED,
  ensureGeographySeeded,
  resetGeographySeedFlag,
  slugId,
};
