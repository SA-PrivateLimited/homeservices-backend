/**
 * Pure helpers for employee portal JWT subjects (no DB imports).
 */

function parseEmployeeIdFromSub(sub) {
  const raw = String(sub || '').trim();
  if (!raw) return null;
  if (raw.startsWith('employee:')) {
    return raw.slice('employee:'.length).trim() || null;
  }
  if (/^[a-fA-F0-9]{24}$/.test(raw)) return raw;
  return null;
}

module.exports = {
  parseEmployeeIdFromSub,
};
