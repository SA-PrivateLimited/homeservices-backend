/**
 * User Model
 * Mongoose schema for users collection
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  phoneVerified: {
    type: Boolean,
    default: false,
  },
  displayName: {
    type: String,
    trim: true,
  },
  name: {
    type: String,
    trim: true,
  },
  role: {
    type: String,
    enum: ['customer', 'provider', 'admin'],
    default: 'customer',
  },
  passwordHash: {
    type: String,
    select: false,
  },
  /** bcrypt hash of 6-digit customer PIN (reused; verified with bcrypt) */
  pinHash: {
    type: String,
    select: false,
  },
  /** Deterministic HMAC of PIN for global uniqueness (not for auth) */
  pinKey: {
    type: String,
    select: false,
    sparse: true,
    unique: true,
  },
  /** AES-encrypted login PIN for admin recovery/view only */
  encryptedPin: {
    type: String,
    select: false,
    default: null,
  },
  /** AES-256-GCM encrypted JWT (or session token); decrypt with TOKEN_ENCRYPTION_KEY from .env */
  encryptedAuthToken: {
    type: String,
    select: false,
    default: null,
  },
  fcmToken: {
    type: String,
    default: null,
  },
  /** Firebase Auth uid from Phone Auth (when OTP verified via Firebase ID token) */
  firebaseUid: {
    type: String,
    default: null,
    index: true,
  },
  location: {
    latitude: Number,
    longitude: Number,
    address: String,
    landmark: String,
    city: String,
    state: String,
    district: String,
    stateId: String,
    districtId: String,
    pincode: String,
    country: String,
  },
  homeAddress: {
    address: String,
    landmark: String,
    city: String,
    district: String,
    state: String,
    stateId: String,
    districtId: String,
    pincode: String,
    country: String,
    latitude: Number,
    longitude: Number,
    label: String,
    customLabel: String,
    isDefault: Boolean,
  },
  officeAddress: {
    address: String,
    landmark: String,
    city: String,
    district: String,
    state: String,
    stateId: String,
    districtId: String,
    pincode: String,
    country: String,
    latitude: Number,
    longitude: Number,
    label: String,
    customLabel: String,
    isDefault: Boolean,
  },
  /** Extra service addresses (e.g. labeled "other" with custom names) */
  serviceAddresses: [
    {
      id: String,
      label: {type: String, enum: ['home', 'office', 'other'], default: 'other'},
      customLabel: String,
      address: String,
      landmark: String,
      city: String,
      district: String,
      state: String,
      stateId: String,
      districtId: String,
      pincode: String,
      country: String,
      latitude: Number,
      longitude: Number,
      isDefault: Boolean,
      createdAt: Date,
      updatedAt: Date,
    },
  ],
  gender: {
    type: String,
    trim: true,
  },
  bloodGroup: {
    type: String,
    trim: true,
  },
  profileImage: String,
  photoURL: String,
  verified: {
    type: Boolean,
    default: false,
  },
  points: {
    type: Number,
    default: 0,
  },
  /** AES-encrypted TOTP secret for authenticator apps (admin MFA) */
  totpSecretEncrypted: {
    type: String,
    select: false,
    default: null,
  },
  /** When true, admin must enter authenticator code after password */
  totpEnabled: {
    type: Boolean,
    default: false,
  },
  /**
   * Admin account approval by Super Admin.
   * pending → cannot use AdminWeb until approved.
   * Legacy admins with no value are treated as approved.
   */
  adminApprovalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: undefined,
  },
  /** Soft deactivate — blocks app/admin login when false */
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  deactivatedAt: Date,
  deactivationReason: {
    type: String,
    trim: true,
  },
  deactivatedBy: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  _migratedAt: Date,
  _migratedFrom: String,
}, {
  _id: true, // Use custom _id
  timestamps: false, // We handle timestamps manually
});

// Indexes
userSchema.index({email: 1});
userSchema.index({phoneNumber: 1});
userSchema.index({role: 1});

const User = mongoose.model('User', userSchema, 'users');

module.exports = User;
