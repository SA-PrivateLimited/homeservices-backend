/**
 * Server-side refresh token sessions (hashed tokens only).
 */

const mongoose = require('mongoose');

const refreshSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    appContext: {
      type: String,
      enum: ['customer', 'provider', 'admin'],
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    familyId: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    userAgent: String,
    ip: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
    timestamps: false,
  },
);

refreshSessionSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});
refreshSessionSchema.index({userId: 1, appContext: 1, revokedAt: 1});

const RefreshSession = mongoose.model(
  'RefreshSession',
  refreshSessionSchema,
  'refresh_sessions',
);

module.exports = RefreshSession;
