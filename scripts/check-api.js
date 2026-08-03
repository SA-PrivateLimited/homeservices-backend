#!/usr/bin/env node
/**
 * Smoke-test public endpoints and JWT auth behavior on protected routes.
 * Protected routes expect Authorization: Bearer <JWT from /api/auth/login>.
 * Run with server already up: npm run check:api
 * Or: API_BASE=http://127.0.0.1:3001 node scripts/check-api.js
 */

const http = require('http');

const BASE = process.env.API_BASE || 'http://127.0.0.1:3001';

function request(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const req = http.request(
      u,
      { method, headers: opts.headers || {} },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: body.slice(0, 500) }),
        );
      },
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, pass: cond, detail });

  const h = await request('GET', '/health');
  ok('GET /health', h.status === 200, `status ${h.status}`);

  const p = await request('GET', '/api/providers?limit=1&offset=0');
  ok('GET /api/providers (public)', p.status === 200, `status ${p.status}`);

  const r = await request('GET', '/api/reviews?limit=1&offset=0');
  ok('GET /api/reviews (public)', r.status === 200, `status ${r.status}`);

  const c = await request('GET', '/api/serviceCategories');
  ok('GET /api/serviceCategories (public)', c.status === 200, `status ${c.status}`);

  const u = await request('GET', '/api/users/me');
  ok('GET /api/users/me without token → 401', u.status === 401, `status ${u.status}`);

  const pj = await request('GET', '/api/provider/jobCards');
  ok('GET /api/provider/jobCards without token → 401', pj.status === 401, `status ${pj.status}`);

  const nf = await request('GET', '/api/does-not-exist');
  ok('Unknown route → 404', nf.status === 404, `status ${nf.status}`);

  console.log(`\nAPI check — ${BASE}\n`);
  let failed = 0;
  for (const r of results) {
    const icon = r.pass ? '✓' : '✗';
    if (!r.pass) failed++;
    console.log(`${icon} ${r.name}: ${r.detail}`);
  }
  console.log(
    `\n${failed === 0 ? 'All checks passed.' : `${failed} check(s) failed.`}\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Error:', e.message);
  console.error('Is the server running? (npm run dev)');
  process.exit(1);
});
