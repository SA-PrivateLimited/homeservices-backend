/**
 * Socket + one FCM multicast for a capped Partner set.
 */

const {notifyAreaProviders} = require('../realtime/socket');
const {notifyProvidersMulticast} = require('../services/notificationService');
const {providerIdsFromList} = require('./findProvidersInArea');

async function notifyMatchedProviders({
  providers,
  bookingData,
  fcm,
  excludeProviderId,
}) {
  const ids = providerIdsFromList(providers).filter(
    (id) => !excludeProviderId || id !== String(excludeProviderId),
  );
  await notifyAreaProviders({
    providers: ids,
    bookingData,
    excludeProviderId,
  });
  if (fcm && ids.length) {
    await notifyProvidersMulticast(ids, fcm);
  }
  return ids;
}

async function notifyStoredProviderIds({
  ids,
  bookingData,
  fcm,
  excludeProviderId,
}) {
  return notifyMatchedProviders({
    providers: ids || [],
    bookingData,
    fcm,
    excludeProviderId,
  });
}

module.exports = {
  notifyMatchedProviders,
  notifyStoredProviderIds,
};
