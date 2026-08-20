/**
 * User / visitor feedback submitted from Partner or Customer apps.
 */

const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    source: {
      type: String,
      enum: ['partner_login', 'partner_app', 'customer_login', 'customer_app', 'other'],
      default: 'other',
    },
    app: {
      type: String,
      enum: ['partner', 'customer', 'unknown'],
      default: 'unknown',
    },
    submittedBy: {
      type: String,
      default: null,
    },
    submittedByRole: {
      type: String,
      enum: ['customer', 'provider', 'anonymous', 'admin'],
      default: 'anonymous',
    },
    status: {
      type: String,
      enum: ['new', 'read', 'resolved', 'archived'],
      default: 'new',
    },
    adminNotes: {
      type: String,
      trim: true,
      default: '',
    },
    userAgent: {
      type: String,
      trim: true,
      default: '',
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
  {timestamps: false, collection: 'userFeedbacks'},
);

feedbackSchema.index({status: 1, createdAt: -1});
feedbackSchema.index({createdAt: -1});
feedbackSchema.index({app: 1});

module.exports = mongoose.model('UserFeedback', feedbackSchema);
