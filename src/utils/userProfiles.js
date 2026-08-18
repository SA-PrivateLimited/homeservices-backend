/**
 * Multi-role profile checks for the same Akanso User.
 * Customer access depends on a Customer profile, not on the absence of a Partner profile.
 */

function hasCustomerProfile(user) {
  if (!user) return false;
  return user.role === 'customer' || user.customerProfileEnabled === true;
}

function hasPartnerProfile(user) {
  if (!user) return false;
  return user.role === 'provider';
}

function canEnterAppContext(user, requestedRole) {
  if (requestedRole === 'customer') return hasCustomerProfile(user);
  if (requestedRole === 'provider') return hasPartnerProfile(user);
  return false;
}

/** Mongo match for anyone with a Customer profile (including dual-role Partners). */
const CUSTOMER_PROFILE_MATCH = {
  $or: [{role: 'customer'}, {customerProfileEnabled: true}],
};

function isCustomerAccessActive(user) {
  if (!hasCustomerProfile(user)) return false;
  if (user.customerAccessActive === false) return false;
  if (user.isActive === false && user.customerAccessActive !== true) {
    return false;
  }
  return true;
}

function isPartnerAccessActive(user, provider) {
  if (!hasPartnerProfile(user)) return false;
  if (provider && provider.isActive === false) return false;
  if (!provider && user.isActive === false) return false;
  if (
    user.isActive === false &&
    !hasCustomerProfile(user) &&
    (!provider || provider.isActive !== true)
  ) {
    return false;
  }
  return true;
}

function adminProfileFlags(user, provider) {
  return {
    hasCustomerProfile: hasCustomerProfile(user),
    hasPartnerProfile: hasPartnerProfile(user),
    customerAccessActive: isCustomerAccessActive(user),
    partnerAccessActive: isPartnerAccessActive(user, provider),
  };
}

module.exports = {
  hasCustomerProfile,
  hasPartnerProfile,
  canEnterAppContext,
  CUSTOMER_PROFILE_MATCH,
  isCustomerAccessActive,
  isPartnerAccessActive,
  adminProfileFlags,
};
