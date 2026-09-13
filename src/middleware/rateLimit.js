/**
 * In-memory sliding-window limiter (same pattern as Super Admin elevate).
 * No extra dependency — scoped per-route by the caller.
 */

function clientKey(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

/**
 * @param {{windowMs: number, max: number, message?: string, keyFn?: Function}} options
 */
function createRateLimit(options) {
  const windowMs = Number(options.windowMs);
  const max = Number(options.max);
  const message =
    options.message || 'Too many requests. Try again later.';
  const keyFn = options.keyFn || clientKey;
  const hits = new Map();

  function rateLimit(req, res, next) {
    const key = String(keyFn(req) || 'unknown');
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      entry = {windowStart: now, count: 0};
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        message,
      });
    }
    return next();
  }

  rateLimit.reset = () => hits.clear();
  rateLimit._store = hits;
  return rateLimit;
}

/** Public GPS → State/District resolve (Nominatim-backed). */
const GEOGRAPHY_RESOLVE_WINDOW_MS = 15 * 60 * 1000;
const GEOGRAPHY_RESOLVE_MAX = 30;

const geographyResolveRateLimit = createRateLimit({
  windowMs: GEOGRAPHY_RESOLVE_WINDOW_MS,
  max: GEOGRAPHY_RESOLVE_MAX,
  message: 'Too many location lookups. Try again in a few minutes.',
});

module.exports = {
  createRateLimit,
  clientKey,
  GEOGRAPHY_RESOLVE_WINDOW_MS,
  GEOGRAPHY_RESOLVE_MAX,
  geographyResolveRateLimit,
};
