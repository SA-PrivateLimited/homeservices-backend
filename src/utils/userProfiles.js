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

module.exports = {
  hasCustomerProfile,
  hasPartnerProfile,
  canEnterAppContext,
};
