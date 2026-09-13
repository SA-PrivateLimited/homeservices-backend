const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const {
  parseIncludeBlocks,
  createGeographyMetaStore,
} = require('../src/utils/geographyMeta');

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

async function getJson(url) {
  const res = await fetch(url);
  return {status: res.status, body: await res.json()};
}

function createMetaApp(store, fetchers) {
  const app = express();
  app.get('/meta', async (req, res, next) => {
    try {
      const includeBlocks = parseIncludeBlocks(req.query.includeBlocks);
      const data = await store.load({
        includeBlocks,
        ...fetchers,
      });
      res.json({success: true, data});
    } catch (err) {
      next(err);
    }
  });
  return app;
}

describe('parseIncludeBlocks', () => {
  it('defaults to full geography when the parameter is omitted', () => {
    assert.equal(parseIncludeBlocks(undefined), true);
    assert.equal(parseIncludeBlocks(null), true);
    assert.equal(parseIncludeBlocks(''), true);
  });

  it('treats 0 and false as lite, matching existing query boolean convention', () => {
    assert.equal(parseIncludeBlocks('0'), false);
    assert.equal(parseIncludeBlocks(0), false);
    assert.equal(parseIncludeBlocks('false'), false);
    assert.equal(parseIncludeBlocks(false), false);
  });

  it('treats 1 and true as full', () => {
    assert.equal(parseIncludeBlocks('1'), true);
    assert.equal(parseIncludeBlocks(1), true);
    assert.equal(parseIncludeBlocks('true'), true);
    assert.equal(parseIncludeBlocks(true), true);
  });

  it('keeps unknown values on the existing full default', () => {
    assert.equal(parseIncludeBlocks('maybe'), true);
  });
});

describe('GET /geography/meta includeBlocks', () => {
  const states = [{_id: 's1', name: 'Jharkhand'}];
  const districts = [{_id: 'd1', name: 'Ranchi', stateId: 's1'}];
  const blocks = [{_id: 'b1', name: 'Kanke', districtId: 'd1'}];

  it('returns states, districts, and blocks by default', async () => {
    let blockCalls = 0;
    const store = createGeographyMetaStore();
    const {server, url} = await listen(
      createMetaApp(store, {
        fetchStatesDistricts: async () => ({states, districts}),
        fetchBlocks: async () => {
          blockCalls += 1;
          return blocks;
        },
      }),
    );
    try {
      const {status, body} = await getJson(`${url}/meta`);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.states.length, 1);
      assert.equal(body.data.districts.length, 1);
      assert.equal(body.data.blocks.length, 1);
      assert.equal(blockCalls, 1);
    } finally {
      await close(server);
    }
  });

  it('omits blocks for includeBlocks=0 and does not query Block', async () => {
    let blockCalls = 0;
    const store = createGeographyMetaStore();
    const {server, url} = await listen(
      createMetaApp(store, {
        fetchStatesDistricts: async () => ({states, districts}),
        fetchBlocks: async () => {
          blockCalls += 1;
          return blocks;
        },
      }),
    );
    try {
      const {status, body} = await getJson(`${url}/meta?includeBlocks=0`);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.states.length, 1);
      assert.equal(body.data.districts.length, 1);
      assert.equal('blocks' in body.data, false);
      assert.equal(blockCalls, 0);
    } finally {
      await close(server);
    }
  });

  it('returns full geography for includeBlocks=1', async () => {
    const store = createGeographyMetaStore();
    const {server, url} = await listen(
      createMetaApp(store, {
        fetchStatesDistricts: async () => ({states, districts}),
        fetchBlocks: async () => blocks,
      }),
    );
    try {
      const {status, body} = await getJson(`${url}/meta?includeBlocks=1`);
      assert.equal(status, 200);
      assert.equal(body.data.blocks.length, 1);
    } finally {
      await close(server);
    }
  });

  it('keeps full and lite cache entries isolated', async () => {
    let blockCalls = 0;
    const store = createGeographyMetaStore();
    const {server, url} = await listen(
      createMetaApp(store, {
        fetchStatesDistricts: async () => ({states, districts}),
        fetchBlocks: async () => {
          blockCalls += 1;
          return blocks;
        },
      }),
    );
    try {
      const fullFirst = await getJson(`${url}/meta`);
      const lite = await getJson(`${url}/meta?includeBlocks=0`);
      const fullAgain = await getJson(`${url}/meta?includeBlocks=1`);
      const liteFalse = await getJson(`${url}/meta?includeBlocks=false`);

      assert.equal(fullFirst.body.data.blocks.length, 1);
      assert.equal('blocks' in lite.body.data, false);
      assert.equal(fullAgain.body.data.blocks.length, 1);
      assert.equal('blocks' in liteFalse.body.data, false);
      assert.equal(blockCalls, 2);
    } finally {
      await close(server);
    }
  });

  it('does not let a prior lite load skip Block.find on a later full request', async () => {
    let blockCalls = 0;
    const store = createGeographyMetaStore();
    const data = await store.load({
      includeBlocks: false,
      fetchStatesDistricts: async () => ({states, districts}),
      fetchBlocks: async () => {
        blockCalls += 1;
        return blocks;
      },
    });
    assert.equal('blocks' in data, false);
    assert.equal(blockCalls, 0);

    const full = await store.load({
      includeBlocks: true,
      fetchStatesDistricts: async () => ({states, districts}),
      fetchBlocks: async () => {
        blockCalls += 1;
        return blocks;
      },
    });
    assert.equal(full.blocks.length, 1);
    assert.equal(blockCalls, 1);
  });
});
