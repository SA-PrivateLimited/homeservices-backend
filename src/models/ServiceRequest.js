/**
 * Service Request Model
 * Mongoose schema for serviceRequests collection
 */

const mongoose = require('mongoose');

const serviceRequestSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
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
  customerPhone: {
    type: String,
    required: true,
  },
  secondaryPhone: {
    type: String,
    trim: true,
  },
  customerAddress: {
    address: {
      type: String,
      required: true,
    },
    landmark: String,
    city: String,
    district: String,
    state: String,
    stateId: String,
    districtId: String,
    blockId: String,
    block: String,
    pincode: {
      type: String,
      required: true,
    },
    latitude: Number,
    longitude: Number,
    label: String,
    customLabel: String,
  },
  serviceType: {
    type: String,
    required: true,
    index: true,
  },
  /** Normalized service identity for duplicate-active enforcement (language-independent). */
  serviceTypeKey: {
    type: String,
    index: true,
  },
  problem: String,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in-progress', 'completed', 'cancelled', 'rejected'],
    default: 'pending',
    index: true,
  },
  urgency: {
    type: String,
    enum: ['immediate', 'scheduled'],
    default: 'immediate',
  },
  scheduledTime: Date,
  providerId: String,
  providerName: String,
  providerPhone: String,
  providerEmail: String,
  providerSpecialization: String,
  providerRating: Number,
  providerImage: String,
  providerAddress: mongoose.Schema.Types.Mixed,
  consultationId: String,
  questionnaireAnswers: mongoose.Schema.Types.Mixed,
  photos: [String],
  /** Partner photos uploaded at job completion */
  completionPhotos: [String],
  /** Customer asked admin to source a provider (none online in area) */
  needsAdminAssignment: {
    type: Boolean,
    default: false,
    index: true,
  },
  noProvidersInArea: {
    type: Boolean,
    default: false,
  },
  cancellationReason: String,
  cancelledAt: Date,
  rejectionReason: String,
  rejectedAt: Date,
  /** When a provider (or admin assign) accepted this request */
  acceptedAt: {
    type: Date,
    index: true,
  },
  /** Providers who declined an open (broadcast) request while it stays pending */
  /** Capped set that received socket/FCM for this open request — reuse on accept/cancel. */
  notifiedProviderIds: {
    type: [String],
    default: [],
  },
  declinedProviders: [
    {
      providerId: {type: String, required: true},
      providerName: {type: String, default: ''},
      providerPhone: {type: String, default: ''},
      reason: {type: String, default: ''},
      declinedAt: {type: Date, default: Date.now},
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  _id: true,
  timestamps: false,
});

// Compound indexes
serviceRequestSchema.index({customerId: 1, createdAt: -1});
serviceRequestSchema.index({customerId: 1, status: 1});
serviceRequestSchema.index({status: 1, createdAt: -1});
serviceRequestSchema.index({serviceType: 1, status: 1});
// Partner pending queue + targeted requests
serviceRequestSchema.index({providerId: 1, status: 1, createdAt: -1});
// Nearby open-request polling (broadcast pending by area)
serviceRequestSchema.index({status: 1, 'customerAddress.districtId': 1, createdAt: -1});
serviceRequestSchema.index({status: 1, 'customerAddress.pincode': 1, createdAt: -1});
// Admin unassigned / pending lists (sort by updatedAt)
serviceRequestSchema.index({needsAdminAssignment: 1, status: 1, updatedAt: -1});
serviceRequestSchema.index({updatedAt: -1, createdAt: -1});
// Active-request lookup before partial unique filter
serviceRequestSchema.index({customerId: 1, serviceTypeKey: 1, status: 1});
// Decline exclusion on open-request poll
serviceRequestSchema.index({'declinedProviders.providerId': 1});
// At most one active request per customer + service type (when serviceTypeKey is set)
serviceRequestSchema.index(
  {customerId: 1, serviceTypeKey: 1},
  {
    unique: true,
    name: 'uniq_active_customer_serviceTypeKey',
    partialFilterExpression: {
      status: {$in: ['pending', 'accepted', 'in-progress']},
      serviceTypeKey: {$type: 'string'},
    },
  },
);

const ServiceRequest = mongoose.model('ServiceRequest', serviceRequestSchema, 'serviceRequests');

module.exports = ServiceRequest;
