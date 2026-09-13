const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  createRateLimit,
  GEOGRAPHY_RESOLVE_WINDOW_MS,
  GEOGRAPHY_RESOLVE_MAX,
  geographyResolveRateLimit,
} = require('../src/middleware/rateLimit');
const {
  resolveGeographyFromCoords,
} = require('../src/utils/resolveGeographyFromCoords');

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
      });
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe('geography resolve protection', () => {
  it('rejects out-of-range latitude before geocoding', async () => {
    await assert.rejects(
      () => resolveGeographyFromCoords(91, 83.456),
      (err) => err.code === 'invalid',
    );
  });

  it('rejects out-of-range longitude before geocoding', async () => {
    await assert.rejects(
      () => resolveGeographyFromCoords(24.123, 181),
      (err) => err.code === 'invalid',
    );
  });

  it('rejects missing coordinates according to existing invalid contract', async () => {
    await assert.rejects(
      () => resolveGeographyFromCoords(undefined, undefined),
      (err) => err.code === 'invalid',
    );
    await assert.rejects(
      () => resolveGeographyFromCoords('', ''),
      (err) => err.code === 'invalid',
    );
  });

  it('applies in-memory rate limiting and returns 429 after the configured max', async () => {
    const limiter = createRateLimit({
      windowMs: 60_000,
      max: 2,
      message: 'Too many location lookups. Try again in a few minutes.',
    });
    const app = express();
    app.get('/resolve', limiter, (_req, res) => {
      res.json({success: true, data: {ok: true}});
    });
    const {server, url} = await listen(app);
    try {
      const first = await fetch(`${url}/resolve`);
      const second = await fetch(`${url}/resolve`);
      const third = await fetch(`${url}/resolve`);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(third.status, 429);
      const body = await third.json();
      assert.equal(body.success, false);
      assert.equal(body.error, 'Too Many Requests');
    } finally {
      await close(server);
    }
  });

  it('wires the geography resolve limiter onto GET /resolve', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/routes/shared/geography.js'),
      'utf8',
    );
    assert.match(src, /geographyResolveRateLimit/);
    assert.match(src, /router\.get\(\s*['"]\/resolve['"]/);
    assert.equal(GEOGRAPHY_RESOLVE_MAX, 30);
    assert.equal(GEOGRAPHY_RESOLVE_WINDOW_MS, 15 * 60 * 1000);
    assert.equal(typeof geographyResolveRateLimit, 'function');
  });
});
