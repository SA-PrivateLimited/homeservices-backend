/**
 * Service Category Section — Browse "All Services" grouping.
 * Admin-managed; CustomerWeb loads via GET /api/serviceCategories/sections.
 */

const mongoose = require('mongoose');

const serviceCategorySectionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      trim: true,
    },
    labelEn: {
      type: String,
      required: true,
      trim: true,
    },
    labelHi: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      default: 100,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
    timestamps: false,
  },
);

const ServiceCategorySection = mongoose.model(
  'ServiceCategorySection',
  serviceCategorySectionSchema,
  'serviceCategorySections',
);

module.exports = ServiceCategorySection;
