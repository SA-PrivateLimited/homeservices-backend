/**
 * How a Partner profile was created.
 * Existing docs without this field are treated as unknown (not assumed self).
 */
const ONBOARDING_SOURCES = ['self', 'admin', 'admin_bulk'];

function parseAdminOnboardingSource(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'admin_bulk' || v === 'bulk') return 'admin_bulk';
  return 'admin';
}

module.exports = {
  ONBOARDING_SOURCES,
  parseAdminOnboardingSource,
};
