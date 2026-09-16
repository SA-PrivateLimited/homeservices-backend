/**
 * Authenticated account deletion — Partner and Customer apps.
 * DELETE /api/partner/account-deletion
 * DELETE /api/customer/account-deletion
 */

const express = require('express');
const {requireRole} = require('../../middleware/auth');
const {logRequest} = require('../../middleware/logger');
const {
  deletePartnerAccount,
  deleteCustomerAccount,
} = require('../../controllers/accountDeletionController');

function accountDeletionRouter(role, handler) {
  const router = express.Router();
  router.delete('/account-deletion', requireRole(role), logRequest, handler);
  return router;
}

module.exports = {
  partnerAccountDeletionApi: accountDeletionRouter(
    'provider',
    deletePartnerAccount,
  ),
  customerAccountDeletionApi: accountDeletionRouter(
    'customer',
    deleteCustomerAccount,
  ),
};
