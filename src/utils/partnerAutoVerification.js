/**
 * Auto-verify Partners when core profile fields are complete.
 *
 * Current phase: standalone rollout — no manual admin review for name,
 * profession, address, and Firebase-verified phone.
 */

const {
  allServicesForProvider,
  qualificationForService,
  upsertQualification,
  setInactive,
  isServiceInactive,
} = require('./providerServiceAvailability');

function partnerAddress(provider) {
  const loc = provider?.location && typeof provider.location === 'object'
    ? provider.location
    : {};
  const addr =
    provider?.address && typeof provider.address === 'object'
      ? provider.address
      : {};
  return {
    address: String(loc.address || addr.address || '').trim(),
    stateId: String(loc.stateId || addr.stateId || '').trim(),
    districtId: String(loc.districtId || addr.districtId || '').trim(),
    pincode: String(loc.pincode || addr.pincode || '').trim(),
  };
}

function partnerDisplayName(provider, user) {
  return String(
    provider?.name ||
      provider?.displayName ||
      user?.name ||
      user?.displayName ||
      '',
  ).trim();
}

function partnerExperience(provider) {
  const value = provider?.experience;
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function isPhoneVerified(provider, user) {
  return Boolean(provider?.phoneVerified || user?.phoneVerified);
}

/**
 * Core fields Partners must complete before they can appear to customers.
 */
function isPartnerProfileCompleteForAutoVerify(provider, user) {
  if (!provider) return false;
  if (String(provider.approvalStatus || '').toLowerCase() === 'rejected') {
    return false;
  }

  if (!partnerDisplayName(provider, user)) return false;
  if (!allServicesForProvider(provider).length) return false;

  const {address, stateId, districtId, pincode} = partnerAddress(provider);
  if (!address || !stateId || !districtId || !/^\d{6}$/.test(pincode)) {
    return false;
  }

  if (!isPhoneVerified(provider, user)) return false;

  const exp = partnerExperience(provider);
  if (exp == null) return false;

  return true;
}

/**
 * Approve account + services and activate for customer browse when eligible.
 * Does not override admin rejection.
 *
 * @returns {{ changed: boolean, reason?: string }}
 */
function autoVerifyPartnerIfEligible(provider, user) {
  if (!provider) return {changed: false, reason: 'no_provider'};

  const status = String(provider.approvalStatus || '').toLowerCase();
  if (status === 'rejected') return {changed: false, reason: 'rejected'};

  if (!isPartnerProfileCompleteForAutoVerify(provider, user)) {
    return {changed: false, reason: 'incomplete'};
  }

  let changed = false;
  const profileExperience = partnerExperience(provider);

  if (status !== 'approved') {
    provider.approvalStatus = 'approved';
    provider.verified = true;
    provider.approvedAt = provider.approvedAt || new Date();
    provider.rejectionReason = null;
    changed = true;
  }

  if (user?.phoneVerified && !provider.phoneVerified) {
    provider.phoneVerified = true;
    changed = true;
  }

  const now = new Date();
  for (const name of allServicesForProvider(provider)) {
    const existing = qualificationForService(provider, name);
    const currentStatus = String(existing?.verificationStatus || '').toLowerCase();

    if (currentStatus === 'rejected') continue;

    if (currentStatus !== 'approved') {
      upsertQualification(provider, name, 'approved', {
        experience:
          existing?.experience != null ? existing.experience : profileExperience,
        submittedAt: existing?.submittedAt || now,
        reviewedAt: now,
        reviewedBy: 'auto',
        rejectionReason: '',
      });
      changed = true;
    }

    if (isServiceInactive(provider, name)) {
      setInactive(provider, name, false);
      changed = true;
    }
  }

  if (changed) {
    provider.updatedAt = now;
  }

  return {changed};
}

/** Copy known customer fields onto a new Partner profile when upgrading. */
function syncPartnerProfileFromUser(provider, user) {
  if (!provider || !user) return false;
  let changed = false;

  const {repairPartnerRecord} = require('./partnerNameSync');
  if (repairPartnerRecord(provider, user.name, user.displayName)) {
    changed = true;
  } else {
    const name = partnerDisplayName(provider, user);
    if (!String(provider.name || '').trim() && name) {
      provider.name = name;
      provider.displayName = name;
      changed = true;
    }
  }

  if (user.phoneVerified && !provider.phoneVerified) {
    provider.phoneVerified = true;
    changed = true;
  }

  const current = partnerAddress(provider);
  const userLoc = user.location || user.homeAddress;
  if (
    userLoc &&
    typeof userLoc === 'object' &&
    !current.address &&
    String(userLoc.address || '').trim()
  ) {
    provider.location = {
      ...(provider.location || {}),
      address: userLoc.address,
      landmark: userLoc.landmark,
      city: userLoc.city || userLoc.district,
      district: userLoc.district || userLoc.city,
      state: userLoc.state,
      stateId: userLoc.stateId,
      districtId: userLoc.districtId,
      pincode: userLoc.pincode,
      latitude: userLoc.latitude,
      longitude: userLoc.longitude,
    };
    provider.address = {
      type: 'home',
      address: userLoc.address,
      landmark: userLoc.landmark,
      city: userLoc.city || userLoc.district,
      district: userLoc.district || userLoc.city,
      state: userLoc.state,
      stateId: userLoc.stateId,
      districtId: userLoc.districtId,
      pincode: userLoc.pincode,
      latitude: userLoc.latitude,
      longitude: userLoc.longitude,
    };
    changed = true;
  }

  if (changed) {
    provider.updatedAt = new Date();
  }
  return changed;
}

module.exports = {
  partnerAddress,
  isPartnerProfileCompleteForAutoVerify,
  autoVerifyPartnerIfEligible,
  syncPartnerProfileFromUser,
};
