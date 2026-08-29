/**
 * Parse CORS_ORIGIN env (comma-separated list or *).
 * Express cors() needs an array or validator — not a raw comma-separated string.
 */
function parseCorsOrigins() {
  const raw = String(process.env.CORS_ORIGIN || '*').trim();
  if (!raw || raw === '*') return '*';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Options for the `cors` Express middleware (credentials + refresh cookies). */
function getExpressCorsOptions() {
  const allowed = parseCorsOrigins();
  if (allowed === '*') {
    return {origin: true, credentials: true};
  }
  return {origin: allowed, credentials: true};
}

module.exports = {parseCorsOrigins, getExpressCorsOptions};
