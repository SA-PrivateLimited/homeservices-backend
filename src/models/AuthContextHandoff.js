/**
 * One-time auth handoff codes (PartnerWeb → CustomerWeb).
 */

const mongoose = require('mongoose');

const authContextHandoffSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['customer', 'partner'],
      required: true,
    },
    source: {
      type: String,
      enum: ['partner', 'customer'],
      default: 'partner',
    },
    audience: {
      type: String,
      enum: ['customer', 'partner'],
      default: 'customer',
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {timestamps: false},
);

authContextHandoffSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});

const AuthContextHandoff = mongoose.model(
  'AuthContextHandoff',
  authContextHandoffSchema,
  'authContextHandoffs',
);

module.exports = AuthContextHandoff;
