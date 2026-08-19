/**
 * Short-lived one-time codes for cross-app auth handoff (Partner → Customer).
 * Persisted in MongoDB; idempotent replay cache for duplicate exchange attempts.
 */

const crypto = require('crypto');
const AuthContextHandoff = require('../models/AuthContextHandoff');
const {connectDB} = require('../config/database');

const DEFAULT_TTL_MS = 2 * 60 * 1000;
const REPLAY_TTL_MS = 60 * 1000;

/** @type {Map<string, { entry: object, session: object, expiresAt: number }>} */
const replayCache = new Map();

function purgeReplayCache() {
  const now = Date.now();
  for (const [key, value] of replayCache.entries()) {
    if (value.expiresAt <= now) replayCache.delete(key);
  }
}

async function createHandoffCode(userId, purpose = 'customer', ttlMs = DEFAULT_TTL_MS) {
  await connectDB();
  const code = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs);
  const isPartner = purpose === 'partner';
  await AuthContextHandoff.create({
    _id: code,
    userId: String(userId),
    purpose,
    source: isPartner ? 'customer' : 'partner',
    audience: isPartner ? 'partner' : 'customer',
    expiresAt,
  });
  return code;
}

/**
 * Atomically consume a handoff code.
 * Returns { status, entry?, session? }
 */
async function consumeHandoffCode(code) {
  await connectDB();
  purgeReplayCache();
  const key = String(code || '').trim();
  if (!key) {
    return {status: 'CODE_NOT_FOUND'};
  }

  const replay = replayCache.get(key);
  if (replay && replay.expiresAt > Date.now()) {
    return {
      status: 'REPLAY',
      entry: replay.entry,
      session: replay.session,
    };
  }

  const existing = await AuthContextHandoff.findById(key).lean();
  if (!existing) {
    return {status: 'CODE_NOT_FOUND'};
  }
  if (existing.consumedAt) {
    return {status: 'CODE_ALREADY_USED'};
  }
  if (existing.expiresAt && new Date(existing.expiresAt).getTime() <= Date.now()) {
    await AuthContextHandoff.deleteOne({_id: key}).catch(() => {});
    return {status: 'CODE_EXPIRED'};
  }

  const consumed = await AuthContextHandoff.findOneAndUpdate(
    {_id: key, consumedAt: null, expiresAt: {$gt: new Date()}},
    {$set: {consumedAt: new Date()}},
    {returnDocument: 'after'},
  ).lean();

  if (!consumed) {
    const again = await AuthContextHandoff.findById(key).lean();
    if (again?.consumedAt) return {status: 'CODE_ALREADY_USED'};
    if (again && new Date(again.expiresAt).getTime() <= Date.now()) {
      return {status: 'CODE_EXPIRED'};
    }
    return {status: 'CODE_NOT_FOUND'};
  }

  return {
    status: 'OK',
    entry: {
      userId: consumed.userId,
      purpose: consumed.purpose,
      source: consumed.source,
      audience: consumed.audience,
    },
  };
}

function cacheHandoffReplay(code, entry, session) {
  purgeReplayCache();
  replayCache.set(String(code).trim(), {
    entry,
    session,
    expiresAt: Date.now() + REPLAY_TTL_MS,
  });
}

module.exports = {
  createHandoffCode,
  consumeHandoffCode,
  cacheHandoffReplay,
  DEFAULT_TTL_MS,
};
