/**
 * Whether customers may send this Partner an in-app service request.
 * Admin-created Partners start off; self-signup starts on.
 * Missing field on old rows: allowed (do not silence live Partners).
 */

function defaultShowRequestService(onboardingSource) {
  const src = String(onboardingSource || '')
    .trim()
    .toLowerCase();
  return src !== 'admin' && src !== 'admin_bulk';
}

function isShowRequestServiceEnabled(provider) {
  if (!provider) return true;
  if (provider.showRequestService === false) return false;
  if (provider.showRequestService === true) return true;
  return defaultShowRequestService(provider.onboardingSource);
}

function applyShowRequestService(provider) {
  if (!provider || typeof provider !== 'object') return provider;
  provider.showRequestService = isShowRequestServiceEnabled(provider);
  return provider;
}

function parseShowRequestService(raw) {
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
  return null;
}

module.exports = {
  defaultShowRequestService,
  isShowRequestServiceEnabled,
  applyShowRequestService,
  parseShowRequestService,
};
