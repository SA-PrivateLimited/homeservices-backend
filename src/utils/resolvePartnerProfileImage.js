/**
 * One Akansho user may have a customer photo (User.profileImage) before uploading
 * a partner-specific photo (Provider.profileImage). Prefer the partner photo when set.
 */
function rewriteLegacyAssetHost(url) {
  return String(url || '').replace(
    /^https?:\/\/assets\.akanso\.in\//i,
    'https://assets.akansho.com/',
  );
}

function rewriteStoredAssetValue(value) {
  if (typeof value === 'string') return rewriteLegacyAssetHost(value);
  if (Array.isArray(value)) return value.map(rewriteStoredAssetValue);
  if (value && typeof value === 'object' && typeof value.url === 'string') {
    return {...value, url: rewriteLegacyAssetHost(value.url)};
  }
  return value;
}

/** Stored CDN URLs keep the old host until rewritten on read. */
function rewriteStoredAssetFields(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  for (const field of [
    'profileImage',
    'photoURL',
    'photo',
    'customerProfileImage',
    'providerProfileImage',
  ]) {
    if (typeof payload[field] === 'string') {
      payload[field] = rewriteLegacyAssetHost(payload[field]);
    }
  }
  if (payload.photos != null) {
    payload.photos = rewriteStoredAssetValue(payload.photos);
  }
  return payload;
}

function resolvePartnerProfileImage(provider, user) {
  const partnerUrl = rewriteLegacyAssetHost(
    provider?.profileImage || provider?.photo || '',
  ).trim();
  if (partnerUrl) return partnerUrl;
  return rewriteLegacyAssetHost(
    user?.profileImage || user?.photoURL || '',
  ).trim();
}

function applyLinkedProfileImageFallback(payload, user) {
  if (!payload) return payload;
  const image = resolvePartnerProfileImage(payload, user);
  if (image) payload.profileImage = image;
  return rewriteStoredAssetFields(payload);
}

module.exports = {
  rewriteLegacyAssetHost,
  rewriteStoredAssetFields,
  resolvePartnerProfileImage,
  applyLinkedProfileImageFallback,
};
