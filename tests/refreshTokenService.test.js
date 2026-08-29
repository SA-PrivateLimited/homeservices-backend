const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

require('dotenv').config();
process.env.REFRESH_TOKEN_EXPIRES_IN = '30d';

const {connectDB, closeDB} = require('../src/config/database');
const RefreshSession = require('../src/models/RefreshSession');
const {
  createRefreshSession,
  rotateRefreshSession,
  revokeRefreshSession,
  revokeAllForUser,
  hashToken,
} = require('../src/utils/refreshTokenService');

const createdUserIds = [];

test.before(async () => {
  await connectDB();
});

test.after(async () => {
  if (createdUserIds.length) {
    await RefreshSession.deleteMany({userId: {$in: createdUserIds}});
  }
  await closeDB();
});

function mockReq() {
  return {
    headers: {'user-agent': 'test-agent'},
    ip: '127.0.0.1',
  };
}

test('create → rotate invalidates old token', async () => {
  const userId = crypto.randomUUID();
  createdUserIds.push(userId);
  const {rawToken} = await createRefreshSession(userId, 'customer', mockReq());
  const rotated = await rotateRefreshSession(rawToken, mockReq());

  assert.ok(rotated.rawToken);
  assert.notEqual(rotated.rawToken, rawToken);

  await assert.rejects(
    () => rotateRefreshSession(rawToken, mockReq()),
    (err) => /reuse detected/i.test(err.message),
  );
});

test('revokeRefreshSession blocks rotation', async () => {
  const userId = crypto.randomUUID();
  createdUserIds.push(userId);
  const {rawToken} = await createRefreshSession(userId, 'provider', mockReq());
  const revoked = await revokeRefreshSession(rawToken);
  assert.equal(revoked, true);

  await assert.rejects(
    () => rotateRefreshSession(rawToken, mockReq()),
    (err) => /Invalid refresh token|reuse detected/i.test(err.message),
  );
});

test('revokeAllForUser revokes active sessions', async () => {
  const userId = crypto.randomUUID();
  createdUserIds.push(userId);
  const a = await createRefreshSession(userId, 'customer', mockReq());
  const b = await createRefreshSession(userId, 'customer', mockReq());
  assert.notEqual(a.rawToken, b.rawToken);

  const count = await revokeAllForUser(userId, 'customer');
  assert.ok(count >= 2);

  await assert.rejects(
    () => rotateRefreshSession(a.rawToken, mockReq()),
    (err) => err.statusCode === 401,
  );
});

test('expired token is rejected', async () => {
  const userId = crypto.randomUUID();
  createdUserIds.push(userId);
  const rawToken = crypto.randomBytes(32).toString('base64url');
  await RefreshSession.create({
    userId,
    appContext: 'admin',
    tokenHash: hashToken(rawToken),
    familyId: crypto.randomUUID(),
    expiresAt: new Date(Date.now() - 1000),
  });

  await assert.rejects(
    () => rotateRefreshSession(rawToken, mockReq()),
    (err) => /expired/i.test(err.message),
  );
});
