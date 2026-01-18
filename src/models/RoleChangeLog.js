/**
 * Role Change Log Model
 * Mongoose schema for roleChangeLogs collection
 * Tracks all role changes made by admins
 */

const mongoose = require('mongoose');

const roleChangeLogSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
    ref: 'User',
  },
  oldRole: {
    type: String,
    enum: ['customer', 'provider', 'admin'],
  },
  newRole: {
    type: String,
    enum: ['customer', 'provider', 'admin'],
    required: true,
  },
  changedBy: {
    type: String,
    required: true,
    index: true,
    ref: 'User',
  },
  changedByName: {
    type: String,
    trim: true,
  },
  changedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  _migratedAt: Date,
  _migratedFrom: String,
}, {
  _id: true, // Use custom _id
  timestamps: false, // We handle timestamps manually
});

// Indexes for efficient queries
roleChangeLogSchema.index({userId: 1, changedAt: -1});
roleChangeLogSchema.index({changedBy: 1, changedAt: -1});
roleChangeLogSchema.index({changedAt: -1});

const RoleChangeLog = mongoose.model('RoleChangeLog', roleChangeLogSchema, 'roleChangeLogs');

module.exports = RoleChangeLog;
