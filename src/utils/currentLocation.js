/**
 * Live provider GPS on Provider.currentLocation.
 * Distinct from Provider.location / Provider.address (service/home address).
 */

function parseCoord(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function optionalText(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * @param {unknown} raw
 * @param {Date} [now]
 * @returns {{ok: true, value: null | object} | {ok: false, message: string}}
 */
function parseCurrentLocationInput(raw, now = new Date()) {
  if (raw == null) {
    return {ok: true, value: null};
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return {ok: false, message: 'currentLocation must be an object with latitude and longitude.'};
  }

  const latitude = parseCoord(raw.latitude);
  const longitude = parseCoord(raw.longitude);
  if (latitude == null || longitude == null) {
    return {
      ok: false,
      message: 'currentLocation requires numeric latitude and longitude.',
    };
  }
  if (latitude < -90 || latitude > 90) {
    return {ok: false, message: 'latitude must be between -90 and 90.'};
  }
  if (longitude < -180 || longitude > 180) {
    return {ok: false, message: 'longitude must be between -180 and 180.'};
  }

  const currentLocation = {
    latitude,
    longitude,
    updatedAt: now,
    point: {
      type: 'Point',
      coordinates: [longitude, latitude],
    },
  };
  const address = optionalText(raw.address);
  const city = optionalText(raw.city);
  const state = optionalText(raw.state);
  const pincode = optionalText(raw.pincode);
  if (address) currentLocation.address = address;
  if (city) currentLocation.city = city;
  if (state) currentLocation.state = state;
  if (pincode) currentLocation.pincode = pincode;
  return {ok: true, value: currentLocation};
}

/**
 * Build $set payload for PUT /providers/me/status.
 * Does not copy Provider.location / address into currentLocation.
 */
function buildProviderStatusUpdate(body, now = new Date()) {
  const src = body && typeof body === 'object' ? body : {};
  const parsed = parseCurrentLocationInput(src.currentLocation, now);
  if (!parsed.ok) return parsed;

  const updateData = {updatedAt: now};
  if (typeof src.isOnline === 'boolean') {
    updateData.isOnline = src.isOnline;
  }
  if (typeof src.isAvailable === 'boolean') {
    updateData.isAvailable = src.isAvailable;
  }
  if (parsed.value) {
    updateData.currentLocation = parsed.value;
    updateData.lastUpdated = now;
  }
  return {ok: true, updateData};
}

module.exports = {
  parseCoord,
  parseCurrentLocationInput,
  buildProviderStatusUpdate,
};
