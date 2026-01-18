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
  fcmToken: {
    type: String,
    default: null,
  },
  location: {
    latitude: Number,
    longitude: Number,
    address: String,
    city: String,
    state: String,
    pincode: String,
    country: String,
  },
  photoURL: String,
  verified: {
    type: Boolean,
    default: false,
  },
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
