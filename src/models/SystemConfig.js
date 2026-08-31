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
    /** Product / event name on the launch page. Default Akanso — not client branding. */
    websiteLaunchEventName: {
      type: String,
      default: 'Akanso',
      trim: true,
      maxlength: 80,
    },
    /** Festival / occasion line (Happy Holi, Happy Diwali, or custom). */
    websiteLaunchGreeting: {
      type: String,
      default: 'Happy Holi',
      trim: true,
      maxlength: 80,
    },
    /** Continue button on CustomerWeb. Empty follows the greeting. */
    websiteLaunchCta: {
      type: String,
      default: '',
      trim: true,
      maxlength: 80,
    },
    /** Countdown seconds (legacy). CustomerWeb now uses timerEndsAt. */
    websiteLaunchCountdownSeconds: {
      type: Number,
      default: 10,
      min: 0,
      max: 30,
    },
    /** Special-occasion end time. After this, the greeting hides for everyone. */
    websiteLaunchTimerEndsAt: {
      type: Date,
      default: null,
    },
    /**
     * AUTO: Diwali → diyas, otherwise sparkle.
     * CRACKERS / DIYAS / SPARKLE / NONE force a look.
     * Older JETS / HOLI / SNOW values still store; they render as sparkle.
     */
    websiteLaunchAnimation: {
      type: String,
      enum: [
        'AUTO',
        'CRACKERS',
        'DIYAS',
        'JETS',
        'HOLI',
        'SNOW',
        'SPARKLE',
        'NONE',
      ],
      default: 'AUTO',
    },
    /** Material icon for the personal wish (allowlisted). */
    websiteLaunchIcon: {
      type: String,
      default: 'celebration',
      trim: true,
      maxlength: 64,
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
     * GLOBAL — first Continue closes the greeting for everyone.
     * PER_PERSON — everyone who opens the app that day can see it; Continue hides it only for that person.
     */
    websiteLaunchCloseMode: {
      type: String,
      enum: ['GLOBAL', 'PER_PERSON'],
      default: 'PER_PERSON',
    },
    /** Changes when a new greeting campaign starts so “seen once” resets. */
    websiteLaunchWaveId: {
      type: String,
      default: '',
      trim: true,
      maxlength: 80,
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
    /**
     * When true, open (broadcast) customer requests also reach approved
     * partners who are offline; they may poll nearby-pending and accept
     * without toggling online. Toggle via admin settings.
     */
    allowOfflineProviderOpenRequests: {
      type: Boolean,
      default: false,
    },
    /**
     * When true, customers and partners can chat on accepted (and later)
     * job cards. Toggle via Admin → Permissions → Job chat.
     */
    allowJobCardComments: {
      type: Boolean,
      default: true,
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
