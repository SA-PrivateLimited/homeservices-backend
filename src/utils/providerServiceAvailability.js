/**
 * Per-service availability for providers.
 * inactiveServiceCategories = services the partner is not accepting NEW work for.
 */

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function allServicesForProvider(provider) {
  const seen = new Set();
  const out = [];
  const add = (raw) => {
    const key = norm(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(String(raw).trim());
  };
  add(provider?.serviceType);
  add(provider?.specialization);
  add(provider?.specialty);
  if (Array.isArray(provider?.serviceCategories)) {
    for (const s of provider.serviceCategories) add(s);
  }
  return out;
}

function inactiveSet(provider) {
  return new Set(
    (provider?.inactiveServiceCategories || []).map((s) => norm(s)).filter(Boolean),
  );
}

function isServiceInactive(provider, serviceName) {
  const key = norm(serviceName);
  if (!key) return false;
  return inactiveSet(provider).has(key);
}

function activeServicesForProvider(provider) {
  return allServicesForProvider(provider).filter((s) => !isServiceInactive(provider, s));
}

function primaryServiceForProvider(provider) {
  return (
    provider?.serviceType ||
    provider?.specialization ||
    provider?.specialty ||
    allServicesForProvider(provider)[0] ||
    ''
  );
}

module.exports = {
  allServicesForProvider,
  activeServicesForProvider,
  isServiceInactive,
  primaryServiceForProvider,
};
