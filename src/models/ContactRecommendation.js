/**
 * Contact Recommendation Model
 * Mongoose schema for contact recommendations collection
 */

const mongoose = require('mongoose');

const contactRecommendationSchema = new mongoose.Schema({
  recommendedProviderName: {
    type: String,
    required: true,
    trim: true,
  },
  recommendedProviderPhone: {
    type: String,
    required: true,
    trim: true,
  },
  serviceType: {
    type: String,
    required: true,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  recommendedBy: {
    type: String, // User ID (customer or provider)
    required: true,
  },
  recommendedByName: {
    type: String,
    trim: true,
  },
  recommendedByPhone: {
    type: String,
    trim: true,
  },
  recommendedByRole: {
    type: String,
    enum: ['customer', 'provider'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'contacted', 'registered', 'rejected'],
    default: 'pending',
  },
  pointsAwarded: {
    type: Number,
    default: 0,
  },
  adminNotes: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: false, // We handle timestamps manually
});

// Indexes
contactRecommendationSchema.index({recommendedBy: 1});
contactRecommendationSchema.index({status: 1});
contactRecommendationSchema.index({serviceType: 1});
contactRecommendationSchema.index({createdAt: -1});

const ContactRecommendation = mongoose.model('ContactRecommendation', contactRecommendationSchema, 'contactRecommendations');

module.exports = ContactRecommendation;
