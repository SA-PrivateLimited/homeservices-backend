/**
 * Partner-to-partner help request for an existing customer job.
 * Never stores customer/partner phone numbers on this document.
 */

const mongoose = require('mongoose');

const locationSnapshotSchema = {
  city: String,
  district: String,
  state: String,
  stateId: String,
  districtId: String,
};

const partnerCollaborationRequestSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    jobCardId: {
      type: String,
      required: true,
      index: true,
    },
    serviceRequestId: {
      type: String,
      index: true,
    },
    requestingProviderId: {
      type: String,
      required: true,
      index: true,
    },
    requestingProviderName: {
      type: String,
      default: '',
    },
    targetProviderId: {
      type: String,
      required: true,
      index: true,
    },
    targetProviderName: {
      type: String,
      default: '',
    },
    neededServiceType: {
      type: String,
      required: true,
    },
    jobServiceType: String,
    customerName: String,
    location: locationSnapshotSchema,
    problem: String,
    extraNotes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    photos: [String],
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'cancelled', 'completed'],
      default: 'pending',
      index: true,
    },
    rejectionReason: String,
    acceptedAt: Date,
    rejectedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    /** primary = removed by job owner; assisting = assisting partner withdrew */
    cancelledBy: {
      type: String,
      enum: ['primary', 'assisting'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {_id: true, timestamps: false},
);

partnerCollaborationRequestSchema.index({
  jobCardId: 1,
  targetProviderId: 1,
  status: 1,
});
partnerCollaborationRequestSchema.index({
  targetProviderId: 1,
  status: 1,
  createdAt: -1,
});
partnerCollaborationRequestSchema.index({
  requestingProviderId: 1,
  jobCardId: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  'PartnerCollaborationRequest',
  partnerCollaborationRequestSchema,
  'partnerCollaborationRequests',
);
