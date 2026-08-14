/**
 * Atomic lock: one active request per (customerId, serviceTypeKey).
 * Insert-first prevents double-create races across web/mobile/retries.
 */

const mongoose = require('mongoose');

const activeServiceRequestLockSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    serviceTypeKey: {
      type: String,
      required: true,
      index: true,
    },
    serviceType: {
      type: String,
      required: true,
    },
    serviceRequestId: {
      type: String,
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
  {_id: false, timestamps: false},
);

activeServiceRequestLockSchema.index(
  {customerId: 1, serviceTypeKey: 1},
  {unique: true, name: 'uniq_customer_serviceTypeKey'},
);

const ActiveServiceRequestLock = mongoose.model(
  'ActiveServiceRequestLock',
  activeServiceRequestLockSchema,
  'activeServiceRequestLocks',
);

module.exports = ActiveServiceRequestLock;
