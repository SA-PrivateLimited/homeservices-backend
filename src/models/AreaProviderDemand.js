/**
 * Customer demand for a service type in their area when no providers are available.
 */

const mongoose = require('mongoose');

const areaProviderDemandSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
      default: '',
    },
    customerPhone: {
      type: String,
      trim: true,
      default: '',
    },
    serviceType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    city: {
      type: String,
      trim: true,
      default: '',
    },
    district: {
      type: String,
      trim: true,
      default: '',
    },
    state: {
      type: String,
      trim: true,
      default: '',
    },
    pincode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    latitude: {type: Number},
    longitude: {type: Number},
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'dismissed'],
      default: 'open',
      index: true,
    },
    adminNotes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {timestamps: true},
);

areaProviderDemandSchema.index({serviceType: 1, pincode: 1, status: 1});
areaProviderDemandSchema.index({createdAt: -1});

const AreaProviderDemand = mongoose.model(
  'AreaProviderDemand',
  areaProviderDemandSchema,
  'areaProviderDemands',
);

module.exports = AreaProviderDemand;
