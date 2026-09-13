/**
 * GET /api/geography/meta response shaping.
 * Default is the full payload (states + districts + blocks).
 * includeBlocks=0|false skips the Block query and omits `blocks`.
 */

function parseIncludeBlocks(raw) {
  if (Array.isArray(raw)) {
    raw = raw.length ? raw[raw.length - 1] : undefined;
  }
  if (raw === undefined || raw === null || raw === '') return true;
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
  return true;
}

function createGeographyMetaStore() {
  let statesDistrictsCache = null;

  return {
    invalidate() {
      statesDistrictsCache = null;
    },
    async load({includeBlocks, fetchStatesDistricts, fetchBlocks}) {
      if (!statesDistrictsCache) {
        const loaded = await fetchStatesDistricts();
        statesDistrictsCache = {
          states: loaded.states,
          districts: loaded.districts,
        };
      }
      if (!includeBlocks) {
        return {
          states: statesDistrictsCache.states,
          districts: statesDistrictsCache.districts,
        };
      }
      const blocks = await fetchBlocks();
      return {
        states: statesDistrictsCache.states,
        districts: statesDistrictsCache.districts,
        blocks,
      };
    },
  };
}

module.exports = {
  parseIncludeBlocks,
  createGeographyMetaStore,
};
