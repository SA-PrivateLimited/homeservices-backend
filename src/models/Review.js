/**
 * Review Model
 * Mongoose schema for reviews collection
 */

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  jobCardId: {
    type: String,
    required: true,
    index: true,
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
  providerId: {
    type: String,
    required: true,
    index: true,
  },
  providerName: {
    type: String,
    required: true,
  },
  serviceType: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    index: true,
  },
  comment: {
    type: String,
    default: '',
  },
  photos: [String],
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

// Compound indexes
reviewSchema.index({providerId: 1, createdAt: -1});
reviewSchema.index({customerId: 1, createdAt: -1});
reviewSchema.index({jobCardId: 1, customerId: 1}, {unique: true}); // One review per job card per customer

const Review = mongoose.model('Review', reviewSchema, 'reviews');

module.exports = Review;
