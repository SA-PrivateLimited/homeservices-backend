/**
 * One Akanso user may have a customer photo (User.profileImage) before uploading
 * a partner-specific photo (Provider.profileImage). Prefer the partner photo when set.
 */
function resolvePartnerProfileImage(provider, user) {
  const partnerUrl = String(
    provider?.profileImage || provider?.photo || '',
  ).trim();
  if (partnerUrl) return partnerUrl;
  return String(user?.profileImage || user?.photoURL || '').trim();
}

function applyLinkedProfileImageFallback(payload, user) {
  if (!payload) return payload;
  const image = resolvePartnerProfileImage(payload, user);
  if (image) payload.profileImage = image;
  return payload;
}

module.exports = {
  resolvePartnerProfileImage,
  applyLinkedProfileImageFallback,
};
