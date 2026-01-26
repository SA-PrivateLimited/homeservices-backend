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
  specialization: String,
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
    city: String,
    state: String,
    pincode: String,
  },
  currentLocation: {
    latitude: Number,
    longitude: Number,
  },
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

const Provider = mongoose.model('Provider', providerSchema, 'providers');

module.exports = Provider;
