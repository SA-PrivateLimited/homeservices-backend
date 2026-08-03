/**
 * State Model — India states for geography hierarchy
 */

const mongoose = require('mongoose');

const stateSchema = new mongoose.Schema(
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
    code: {
      type: String,
      trim: true,
      uppercase: true,
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

stateSchema.index({name: 1}, {unique: true});

module.exports = mongoose.model('State', stateSchema, 'states');
