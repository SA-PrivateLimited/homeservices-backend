/**
 * Whether this Partner may manage / show work-showcase photos.
 * Admin-gated. Default off. Missing field on old rows: hidden.
 */

function isShowWorkShowcaseEnabled(provider) {
  if (!provider) return false;
  return provider.showWorkShowcase === true;
}

function applyShowWorkShowcase(provider) {
  if (!provider || typeof provider !== 'object') return provider;
  provider.showWorkShowcase = isShowWorkShowcaseEnabled(provider);
  return provider;
}

function parseShowWorkShowcase(raw) {
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
  return null;
}

module.exports = {
  isShowWorkShowcaseEnabled,
  applyShowWorkShowcase,
  parseShowWorkShowcase,
};
