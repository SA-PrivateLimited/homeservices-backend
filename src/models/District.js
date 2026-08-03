/**
 * District Model — districts under a state
 */

const mongoose = require('mongoose');

const districtSchema = new mongoose.Schema(
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
    /** Default / HQ pincode for the district (auto-fill on provider forms) */
    pincode: {
      type: String,
      trim: true,
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
  {_id: true, timestamps: false},
);

districtSchema.index({stateId: 1, name: 1}, {unique: true});

module.exports = mongoose.model('District', districtSchema, 'districts');
