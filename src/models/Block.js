/**
 * Block Model — administrative blocks under a district (Jharkhand pilot)
 * Timestamps are managed by MongoDB via Mongoose (not set in application seed code).
 */

const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    districtId: {
      type: String,
      required: true,
      index: true,
    },
    districtName: {
      type: String,
      required: true,
      trim: true,
    },
    stateId: {
      type: String,
      required: true,
      index: true,
    },
    stateName: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {_id: true, timestamps: true},
);

blockSchema.index({districtId: 1, name: 1}, {unique: true});

module.exports = mongoose.model('Block', blockSchema, 'blocks');
