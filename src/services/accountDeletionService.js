/**
 * Shared self-delete:
 *   DELETE /api/customer/account-deletion
 *   DELETE /api/partner/account-deletion
 *   DELETE /api/users/me (legacy alias)
 */

const User = require('../models/User');
const Provider = require('../models/Provider');
const {createHttpError} = require('../utils/assetValidation');

async function deleteOwnNonAdminAccount(uid) {
  if (!uid) {
    throw createHttpError(401, 'Not authenticated.', 'Unauthorized');
  }

  const existing = await User.findById(uid).lean();
  if (!existing) {
    throw createHttpError(404, 'User not found.', 'Not found');
  }

  if (existing.role === 'admin') {
    throw createHttpError(
      403,
      'Admin accounts cannot be deleted from the mobile apps.',
      'Forbidden',
    );
  }

  await User.findByIdAndDelete(uid);
  try {
    await Provider.findByIdAndDelete(uid);
  } catch (providerErr) {
    console.warn(
      'Provider profile cleanup after self-delete:',
      providerErr.message,
    );
  }

  return uid;
}

module.exports = {
  deleteOwnNonAdminAccount,
};
