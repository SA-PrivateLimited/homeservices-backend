/**
 * Whether Customer Web may show Call for this Partner on browse/details.
 * Default on. Missing field on old rows: show Call (do not hide live Partners).
 */

function isShowContactToUserEnabled(provider) {
  if (!provider) return true;
  if (provider.showContactToUser === false) return false;
  return true;
}

function applyShowContactToUser(provider) {
  if (!provider || typeof provider !== 'object') return provider;
  provider.showContactToUser = isShowContactToUserEnabled(provider);
  return provider;
}

function parseShowContactToUser(raw) {
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
  return null;
}

module.exports = {
  isShowContactToUserEnabled,
  applyShowContactToUser,
  parseShowContactToUser,
};
