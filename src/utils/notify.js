/**
 * FCM push helpers — thin re-export of NotificationService for existing controllers.
 * Prefer: require('../services/notificationService') in new code.
 */

const notificationService = require('../services/notificationService');

module.exports = {
  sendFcm: notificationService.sendToToken,
  notifyUser: notificationService.notifyUser,
  notifyProvider: notificationService.notifyProvider,
  notifyAdmins: notificationService.notifyAdmins,
  registerDeviceToken: notificationService.registerDeviceToken,
  notifyTopic: notificationService.notifyTopic,
};
