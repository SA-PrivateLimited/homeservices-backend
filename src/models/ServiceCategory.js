/**
 * Service Category Model
 * Mongoose schema for serviceCategories collection
 */

const mongoose = require('mongoose');

const serviceCategorySchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  /** Hindi name for bilingual display (e.g. "प्लंबर") */
  nameHi: {
    type: String,
    trim: true,
  },
  description: String,
  descriptionHi: String,
  icon: String,
  color: String,
  order: Number,
  isActive: {
    type: Boolean,
    default: true,
  },
  requiresVehicle: {
    type: Boolean,
    default: false,
  },
  /**
   * Show this category in the "Popular services" section on CustomerWeb.
   * Admin controls which services appear in the main grid.
   */
  isPopular: {
    type: Boolean,
    default: false,
    index: true,
  },
  questionnaire: {
    type: Array,
    default: [],
  },
  /** Partner onboarding docs for this professional service (optional). */
  partnerDocuments: {
    type: [
      {
        _id: false,
        key: {type: String, trim: true},
        label: {type: String, trim: true},
        labelHi: {type: String, trim: true},
        required: {type: Boolean, default: false},
      },
    ],
    default: [],
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
  _id: true,
  timestamps: false,
});

// Index
serviceCategorySchema.index({isActive: 1, name: 1});

const ServiceCategory = mongoose.model('ServiceCategory', serviceCategorySchema, 'serviceCategories');

module.exports = ServiceCategory;
