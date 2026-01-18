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
  nameHindi: String,
  description: String,
  descriptionHindi: String,
  icon: String,
  color: String,
  enabled: {
    type: Boolean,
    default: true,
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
serviceCategorySchema.index({enabled: 1, name: 1});

const ServiceCategory = mongoose.model('ServiceCategory', serviceCategorySchema, 'serviceCategories');

module.exports = ServiceCategory;
