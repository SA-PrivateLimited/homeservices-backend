/**
 * Audit log for provider contact policy changes.
 * Never store customer or provider phone numbers here.
 */

const mongoose = require('mongoose');

const contactPolicyAuditSchema = new mongoose.Schema(
  {
    previousPolicy: {type: String, required: true},
    newPolicy: {type: String, required: true},
    changedBy: {type: String, required: true, index: true},
    changedAt: {type: Date, default: Date.now, index: true},
  },
  {collection: 'contactPolicyAudits'},
);

module.exports = mongoose.model('ContactPolicyAudit', contactPolicyAuditSchema);
