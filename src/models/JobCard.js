/**
 * Job Card Model
 * Mongoose schema for jobCards collection
 */

const mongoose = require('mongoose');

const jobCardSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  providerId: {
    type: String,
    required: true,
    index: true,
  },
  providerName: {
    type: String,
    required: true,
  },
  providerAddress: {
    type: {
      type: String,
      enum: ['home', 'office'],
    },
    address: String,
    city: String,
    state: String,
    pincode: String,
    latitude: Number,
    longitude: Number,
  },
  customerId: {
    type: String,
    required: true,
    index: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  customerPhone: String,
  customerAddress: {
    address: String,
    city: String,
    state: String,
    pincode: String,
    latitude: Number,
    longitude: Number,
  },
  serviceType: {
    type: String,
    required: true,
  },
  problem: String,
  bookingId: String,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in-progress', 'completed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  taskPIN: String,
  pinGeneratedAt: Date,
  scheduledTime: Date,
  cancellationReason: String,
  cancelledAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  _migratedAt: Date,
  _migratedFrom: String,
}, {
  _id: true,
  timestamps: false,
});

// Compound indexes (matching Firebase indexes)
jobCardSchema.index({customerId: 1, createdAt: -1}); // Firebase: customerld + createdAt
jobCardSchema.index({providerId: 1, createdAt: -1}); // Firebase: providerld + createdAt
jobCardSchema.index({customerId: 1, status: 1}); // Simple compound
jobCardSchema.index({providerId: 1, status: 1}); // Simple compound
jobCardSchema.index({providerId: 1, status: -1, createdAt: -1}); // Firebase: providerld + status + createdAt
jobCardSchema.index({customerId: 1, status: -1, createdAt: -1}); // Firebase: customerld + status + createdAt
jobCardSchema.index({status: 1, createdAt: -1}); // Status-based queries

const JobCard = mongoose.model('JobCard', jobCardSchema, 'jobCards');

module.exports = JobCard;
