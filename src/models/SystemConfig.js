/**
 * Global system config (singleton doc _id: "global").
 * Stores the Super Admin 4-digit PIN hash (updatable).
 */

const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: 'global',
    },
    /** bcrypt hash of 4-digit Super Admin PIN */
    superAdminKeyHash: {
      type: String,
      required: true,
    },
    /** Active white-label client id (served by GET /api/branding) */
    activeClientId: {
      type: String,
      default: 'homeservices',
    },
    /**
     * How provider phone numbers are revealed to customers.
     * DIRECT | MASKED | ACCEPTED_ONLY | ACTIVE_REQUEST_ONLY
     */
    providerContactPolicy: {
      type: String,
      enum: ['DIRECT', 'MASKED', 'ACCEPTED_ONLY', 'ACTIVE_REQUEST_ONLY'],
      default: 'DIRECT',
    },
    /** Optional per-service overrides keyed by normalized service type. */
    providerContactPolicyServiceOverrides: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    updatedBy: {
      type: String,
      default: null,
    },
  },
  {_id: true, timestamps: false},
);

const SystemConfig = mongoose.model(
  'SystemConfig',
  systemConfigSchema,
  'systemConfig',
);

module.exports = SystemConfig;
