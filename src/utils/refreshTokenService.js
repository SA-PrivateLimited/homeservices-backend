/**
 * Refresh token lifecycle: create, rotate, revoke, reuse detection.
 */

const crypto = require('crypto');
const RefreshSession = require('../models/RefreshSession');
const {normalizeAppContext, parseRefreshTtlMs} = require('./authCookies');

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw || '')).digest('hex');
}

function generateRawToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function requestMeta(req) {
  return {
    userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 512),
    ip: String(
      req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
        req?.ip ||
        req?.connection?.remoteAddress ||
        '',
    ).slice(0, 64),
  };
}

function authError(message, statusCode = 401) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.name = 'Unauthorized';
  return err;
}

async function revokeFamily(familyId) {
  if (!familyId) return;
  await RefreshSession.updateMany(
    {familyId, revokedAt: null},
    {$set: {revokedAt: new Date()}},
  );
}

async function createRefreshSession(userId, appContext, req) {
  const ctx = normalizeAppContext(appContext);
  const rawToken = generateRawToken();
  const familyId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + parseRefreshTtlMs());
  const meta = requestMeta(req);

  await RefreshSession.create({
    userId: String(userId),
    appContext: ctx,
    tokenHash: hashToken(rawToken),
    familyId,
    expiresAt,
    ...meta,
  });

  return {rawToken, familyId, appContext: ctx, expiresAt};
}

async function findSessionByRawToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  return RefreshSession.findOne({tokenHash: hashToken(token)});
}

const ROTATE_GRACE_MS = 15_000;

function sessionStillInRotateGrace(session) {
  if (!session?.graceSuccessorRaw) return false;
  const until = session.graceUntil
    ? new Date(session.graceUntil).getTime()
    : session.revokedAt
      ? new Date(session.revokedAt).getTime() + ROTATE_GRACE_MS
      : 0;
  return until > Date.now();
}

async function rotateRefreshSession(rawToken, req) {
  const token = String(rawToken || '').trim();
  if (!token) throw authError('Refresh token missing');

  const session = await findSessionByRawToken(token);
  if (!session) throw authError('Invalid refresh token');

  if (session.revokedAt) {
    if (sessionStillInRotateGrace(session)) {
      const successor = await findSessionByRawToken(session.graceSuccessorRaw);
      if (successor && !successor.revokedAt) {
        return {
          rawToken: session.graceSuccessorRaw,
          userId: session.userId,
          appContext: session.appContext,
          familyId: session.familyId,
          expiresAt: successor.expiresAt || session.expiresAt,
        };
      }
    }
    await revokeFamily(session.familyId);
    throw authError('Refresh token reuse detected');
  }

  if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
    session.revokedAt = new Date();
    session.graceSuccessorRaw = null;
    session.graceUntil = null;
    await session.save();
    throw authError('Refresh token expired');
  }

  const newRaw = generateRawToken();
  const meta = requestMeta(req);
  const expiresAt = new Date(Date.now() + parseRefreshTtlMs());

  session.revokedAt = new Date();
  session.lastUsedAt = new Date();
  session.graceSuccessorRaw = newRaw;
  session.graceUntil = new Date(Date.now() + ROTATE_GRACE_MS);
  await session.save();

  await RefreshSession.create({
    userId: session.userId,
    appContext: session.appContext,
    tokenHash: hashToken(newRaw),
    familyId: session.familyId,
    expiresAt,
    ...meta,
  });

  return {
    rawToken: newRaw,
    userId: session.userId,
    appContext: session.appContext,
    familyId: session.familyId,
    expiresAt,
  };
}

async function revokeRefreshSession(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return false;
  const session = await findSessionByRawToken(token);
  if (!session) return false;
  session.graceSuccessorRaw = null;
  session.graceUntil = null;
  if (!session.revokedAt) {
    session.revokedAt = new Date();
  }
  await session.save();
  await revokeFamily(session.familyId);
  return true;
}

async function revokeAllForUser(userId, appContext) {
  const query = {userId: String(userId), revokedAt: null};
  if (appContext) query.appContext = normalizeAppContext(appContext);
  const result = await RefreshSession.updateMany(query, {
    $set: {revokedAt: new Date()},
  });
  return result.modifiedCount || 0;
}

module.exports = {
  hashToken,
  generateRawToken,
  createRefreshSession,
  rotateRefreshSession,
  revokeRefreshSession,
  revokeAllForUser,
  revokeFamily,
  findSessionByRawToken,
};
