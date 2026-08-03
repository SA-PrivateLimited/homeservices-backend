/**
 * Service Request Model
 * Mongoose schema for serviceRequests collection
 */

const mongoose = require('mongoose');

const serviceRequestSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
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
  customerPhone: {
    type: String,
    required: true,
  },
  secondaryPhone: {
    type: String,
    trim: true,
  },
  customerAddress: {
    address: {
      type: String,
      required: true,
    },
    landmark: String,
    city: String,
    district: String,
    state: String,
    stateId: String,
    districtId: String,
    pincode: {
      type: String,
      required: true,
    },
    latitude: Number,
    longitude: Number,
  },
  serviceType: {
    type: String,
    required: true,
    index: true,
  },
  problem: String,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in-progress', 'completed', 'cancelled', 'rejected'],
    default: 'pending',
    index: true,
  },
  urgency: {
    type: String,
    enum: ['immediate', 'scheduled'],
    default: 'immediate',
  },
  scheduledTime: Date,
  providerId: String,
  providerName: String,
  providerPhone: String,
  providerEmail: String,
  providerSpecialization: String,
  providerRating: Number,
  providerImage: String,
  providerAddress: mongoose.Schema.Types.Mixed,
  consultationId: String,
  questionnaireAnswers: mongoose.Schema.Types.Mixed,
  photos: [String],
  cancellationReason: String,
  cancelledAt: Date,
  rejectionReason: String,
  rejectedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  _id: true,
  timestamps: false,
});

// Compound indexes
serviceRequestSchema.index({customerId: 1, createdAt: -1});
serviceRequestSchema.index({customerId: 1, status: 1});
serviceRequestSchema.index({status: 1, createdAt: -1});
serviceRequestSchema.index({serviceType: 1, status: 1});

const ServiceRequest = mongoose.model('ServiceRequest', serviceRequestSchema, 'serviceRequests');

module.exports = ServiceRequest;
