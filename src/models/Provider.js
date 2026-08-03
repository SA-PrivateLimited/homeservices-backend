/**
 * Provider Model
 * Mongoose schema for providers collection
 */

const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    trim: true,
  },
  displayName: {
    type: String,
    trim: true,
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
  /** Admin-marked: phone accepted for login (OTP not required in current flow) */
  phoneVerified: {
    type: Boolean,
    default: false,
  },
  specialization: String,
  serviceType: String,
  serviceCategories: [String],
  experience: Number,
  serviceFee: Number,
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  rejectionReason: {
    type: String,
    trim: true,
  },
  approvedBy: {
    type: String,
  },
  approvedAt: {
    type: Date,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  /** Soft deactivate — blocks provider app login when false */
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
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  totalReviews: {
    type: Number,
    default: 0,
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  isAvailable: {
    type: Boolean,
    default: true,
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
  },
  /** Structured service address (home/office) — includes landmark */
  address: {
    type: {type: String, enum: ['home', 'office'], default: 'home'},
    address: String,
    landmark: String,
    city: String,
    district: String,
    state: String,
    stateId: String,
    districtId: String,
    pincode: String,
    latitude: Number,
    longitude: Number,
  },
  currentLocation: {
    latitude: Number,
    longitude: Number,
    address: String,
    city: String,
    state: String,
    pincode: String,
    updatedAt: Date,
  },
  lastSeen: Date,
  fcmToken: String,
  profileImage: {
    type: String,
    trim: true,
  },
  documents: {
    idProof: String,
    addressProof: String,
    certificate: String,
    idProofVerified: {
      type: Boolean,
      default: false,
    },
    idProofRejected: {
      type: Boolean,
      default: false,
    },
    idProofRejectionReason: String,
    addressProofVerified: {
      type: Boolean,
      default: false,
    },
    addressProofRejected: {
      type: Boolean,
      default: false,
    },
    addressProofRejectionReason: String,
    certificateVerified: {
      type: Boolean,
      default: false,
    },
    certificateRejected: {
      type: Boolean,
      default: false,
    },
    certificateRejectionReason: String,
  },
  photos: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  lastUpdated: Date,
  _migratedAt: Date,
  _migratedFrom: String,
}, {
  _id: true,
  timestamps: false,
});

// Indexes (matching Firebase indexes)
providerSchema.index({approvalStatus: 1}); // Single field
providerSchema.index({serviceCategories: 1}); // Array index
providerSchema.index({isOnline: 1}); // Single field
providerSchema.index({isOnline: 1, approvalStatus: 1}); // Firebase: isOnline + approvalStatus (compound)
providerSchema.index({rating: -1}); // Rating-based queries
providerSchema.index({'location.city': 1});
providerSchema.index({'location.state': 1});
providerSchema.index({'location.pincode': 1});
providerSchema.index({'location.stateId': 1});
providerSchema.index({'location.districtId': 1});

const Provider = mongoose.model('Provider', providerSchema, 'providers');

module.exports = Provider;
