/**
 * HttpOnly refresh-token cookies — one name per app context.
 */

const REFRESH_COOKIE_NAMES = {
  customer: 'hs_rt_customer',
  provider: 'hs_rt_provider',
  admin: 'hs_rt_admin',
};

const VALID_CONTEXTS = new Set(Object.keys(REFRESH_COOKIE_NAMES));

function parseRefreshTtlMs() {
  const raw = String(process.env.REFRESH_TOKEN_EXPIRES_IN || '30d').trim();
  const match = /^(\d+)([smhd])$/i.exec(raw);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000};
  return n * (multipliers[unit] || multipliers.d);
}

function normalizeAppContext(raw) {
  const ctx = String(raw || '').trim().toLowerCase();
  if (ctx === 'provider') return 'provider';
  if (ctx === 'admin') return 'admin';
  return 'customer';
}

function cookieOptions() {
  const sameSiteRaw = String(process.env.AUTH_COOKIE_SAMESITE || 'lax')
    .trim()
    .toLowerCase();
  const sameSite =
    sameSiteRaw === 'none' ? 'none' : sameSiteRaw === 'strict' ? 'strict' : 'lax';
  const secureEnv = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase();
  const secure =
    secureEnv === 'true'
      ? true
      : secureEnv === 'false'
        ? false
        : process.env.NODE_ENV === 'production' || sameSite === 'none';

  const opts = {
    httpOnly: true,
    secure,
    sameSite,
    path: '/api/auth',
    maxAge: parseRefreshTtlMs(),
  };
  const domain = String(process.env.AUTH_COOKIE_DOMAIN || '').trim();
  if (domain) opts.domain = domain;
  return opts;
}

function setRefreshCookie(res, appContext, token) {
  if (!res || !token) return;
  const ctx = normalizeAppContext(appContext);
  res.cookie(REFRESH_COOKIE_NAMES[ctx], token, cookieOptions());
}

function clearRefreshCookie(res, appContext) {
  if (!res) return;
  const ctx = normalizeAppContext(appContext);
  const opts = {...cookieOptions(), maxAge: 0};
  res.clearCookie(REFRESH_COOKIE_NAMES[ctx], opts);
}

function readRefreshCookie(req, appContext) {
  if (!req?.cookies) return '';
  const ctx = normalizeAppContext(appContext);
  return String(req.cookies[REFRESH_COOKIE_NAMES[ctx]] || '').trim();
}

function resolveAppContextFromRequest(req) {
  const fromQuery = req?.query?.appContext;
  const fromBody = req?.body?.appContext;
  const raw = fromQuery || fromBody || '';
  const ctx = normalizeAppContext(raw);
  return VALID_CONTEXTS.has(ctx) ? ctx : null;
}

module.exports = {
  REFRESH_COOKIE_NAMES,
  normalizeAppContext,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
  resolveAppContextFromRequest,
  parseRefreshTtlMs,
};
