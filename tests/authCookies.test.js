const test = require('node:test');
const assert = require('node:assert/strict');
const {
  domainMatchesHost,
  resolveCookieDomain,
} = require('../src/utils/authCookies');

test('domainMatchesHost accepts parent and exact host', () => {
  assert.equal(domainMatchesHost('.akansho.com', 'api.akansho.com'), true);
  assert.equal(domainMatchesHost('akansho.com', 'api.akansho.com'), true);
  assert.equal(domainMatchesHost('.akansho.com', 'akansho.com'), true);
  assert.equal(domainMatchesHost('.akanso.in', 'api.akansho.com'), false);
});

test('resolveCookieDomain ignores mismatched AUTH_COOKIE_DOMAIN', () => {
  const prev = process.env.AUTH_COOKIE_DOMAIN;
  process.env.AUTH_COOKIE_DOMAIN = '.akanso.in';
  try {
    const domain = resolveCookieDomain({hostname: 'api.akansho.com'});
    assert.equal(domain, '.akansho.com');
  } finally {
    if (prev === undefined) delete process.env.AUTH_COOKIE_DOMAIN;
    else process.env.AUTH_COOKIE_DOMAIN = prev;
  }
});

test('resolveCookieDomain derives .akansho.com when env unset', () => {
  const prev = process.env.AUTH_COOKIE_DOMAIN;
  delete process.env.AUTH_COOKIE_DOMAIN;
  try {
    const domain = resolveCookieDomain({hostname: 'api.akansho.com'});
    assert.equal(domain, '.akansho.com');
  } finally {
    if (prev === undefined) delete process.env.AUTH_COOKIE_DOMAIN;
    else process.env.AUTH_COOKIE_DOMAIN = prev;
  }
});

test('resolveCookieDomain keeps matching AUTH_COOKIE_DOMAIN', () => {
  const prev = process.env.AUTH_COOKIE_DOMAIN;
  process.env.AUTH_COOKIE_DOMAIN = '.akansho.com';
  try {
    const domain = resolveCookieDomain({hostname: 'api.akansho.com'});
    assert.equal(domain, '.akansho.com');
  } finally {
    if (prev === undefined) delete process.env.AUTH_COOKIE_DOMAIN;
    else process.env.AUTH_COOKIE_DOMAIN = prev;
  }
});
