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
    /** One-time branding theme migration marker for default clients. */
    brandingPaletteVersion: {
      type: String,
      default: '',
    },
    /**
     * CustomerWeb controlled launch gate.
     * LAUNCH → tribute / countdown experience; NORMAL → regular site.
     */
    websiteLaunchState: {
      type: String,
      enum: ['NORMAL', 'LAUNCH'],
      default: 'NORMAL',
    },
    /** Tribute name shown on CustomerWeb launch page (backend-driven). */
    websiteLaunchName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
    /** Tribute message shown on CustomerWeb launch page (backend-driven). */
    websiteLaunchMessage: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },
    /** When CustomerWeb completed LAUNCH → NORMAL. */
    websiteLaunchCompletedAt: {
      type: Date,
      default: null,
    },
    /**
     * Partner go-live verification:
     * AUTO — approve when profile fields are complete + phone verified
     * ADMIN — manual admin review (legacy flow)
     */
    partnerVerificationMode: {
      type: String,
      enum: ['AUTO', 'ADMIN'],
      default: 'AUTO',
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
