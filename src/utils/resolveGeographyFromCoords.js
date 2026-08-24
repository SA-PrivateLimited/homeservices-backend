/**
 * Reverse geocode GPS → Akanso state/district (server-side Nominatim).
 * Browsers cannot call Nominatim directly (CORS).
 */

const axios = require('axios');
const State = require('../models/State');
const District = require('../models/District');
const {ensureGeographySeeded} = require('./geographySeed');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  'AkansoHomeServices/1.0 (contact: support@akanso.in)';

function makeError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function parseCoord(value) {
  if (value == null || value === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeGeoName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bdistrict\b/g, '')
    .replace(/\bdivision\b/g, '')
    .replace(/\btehsil\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(a, b) {
  const na = normalizeGeoName(a);
  const nb = normalizeGeoName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const aTokens = na.split(' ').filter(Boolean);
  const bTokens = nb.split(' ').filter(Boolean);
  if (aTokens.length && bTokens.length && aTokens[0] === bTokens[0]) return true;
  return false;
}

function pickDistrictCandidates(address) {
  if (!address || typeof address !== 'object') return [];
  const keys = [
    'state_district',
    'county',
    'city_district',
    'district',
    'city',
    'town',
    'village',
    'suburb',
  ];
  const out = [];
  for (const key of keys) {
    const val = address[key];
    if (val && typeof val === 'string') out.push(val);
  }
  return out;
}

function pickStateCandidate(address) {
  if (!address || typeof address !== 'object') return '';
  return (
    address.state ||
    address.region ||
    address.state_code ||
    ''
  );
}

async function reverseGeocode(lat, lon) {
  try {
    const {data} = await axios.get(NOMINATIM_URL, {
      params: {
        lat,
        lon,
        format: 'json',
        addressdetails: 1,
        zoom: 10,
      },
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      timeout: 15000,
    });
    return data || null;
  } catch (_) {
    throw makeError('geocode', 'Reverse geocode failed');
  }
}

function findStateMatch(states, candidate) {
  if (!candidate) return null;
  let match =
    states.find((s) => namesMatch(s.name, candidate)) || null;
  if (match) return match;
  const norm = normalizeGeoName(candidate);
  match = states.find((s) => normalizeGeoName(s.name).startsWith(norm)) || null;
  return match;
}

function findDistrictMatch(districts, candidates) {
  for (const candidate of candidates) {
    const match = districts.find((d) => namesMatch(d.name, candidate));
    if (match) return match;
  }
  return null;
}

/**
 * @param {string|number} lat
 * @param {string|number} lon
 * @returns {Promise<{stateId: string, districtId: string, stateName: string, districtName: string, label: string}>}
 */
async function resolveGeographyFromCoords(lat, lon) {
  const latitude = parseCoord(lat);
  const longitude = parseCoord(lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw makeError('invalid', 'Invalid coordinates');
  }

  await ensureGeographySeeded();

  const geo = await reverseGeocode(latitude, longitude);
  const address = geo?.address || {};
  const stateCandidate = pickStateCandidate(address);
  const districtCandidates = pickDistrictCandidates(address);

  if (!stateCandidate && !districtCandidates.length) {
    throw makeError('nomatch', 'Could not determine place from coordinates');
  }

  const [states, districts] = await Promise.all([
    State.find({isActive: {$ne: false}}).select('_id name').lean(),
    District.find({isActive: {$ne: false}})
      .select('_id name stateId stateName')
      .lean(),
  ]);

  const state = findStateMatch(states, stateCandidate);
  if (!state) {
    throw makeError('nomatch', 'Location is outside supported service areas');
  }

  const stateDistricts = districts.filter((d) => d.stateId === state._id);
  const district = findDistrictMatch(stateDistricts, districtCandidates);

  const stateName = state.name;
  const districtName = district?.name || '';
  const label = districtName
    ? `${districtName}, ${stateName}`
    : stateName;

  return {
    stateId: state._id,
    districtId: district?._id || '',
    stateName,
    districtName,
    label,
  };
}

module.exports = {
  resolveGeographyFromCoords,
  normalizeGeoName,
  namesMatch,
};
