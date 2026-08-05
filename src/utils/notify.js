/**
 * Optional FCM push (Firebase Admin). No-op if Firebase is not configured.
 */

async function sendFcm(token, {title, body, data} = {}) {
  if (!token) return {sent: false, reason: 'no_fcm_token'};
  try {
    const admin = require('../config/firebaseAdmin');
    if (!admin.apps?.length) return {sent: false, reason: 'firebase_not_configured'};

    await admin.messaging().send({
      token,
      notification: {title: title || 'Home Services', body: body || ''},
      data: Object.fromEntries(
        Object.entries(data || {}).map(([k, v]) => [k, String(v ?? '')]),
      ),
    });
    return {sent: true};
  } catch (err) {
    console.warn('FCM notify failed:', err.message);
    return {sent: false, reason: err.message};
  }
}

async function notifyUser(userId, {title, body, data} = {}) {
  if (!userId) return {sent: false, reason: 'no_user'};
  try {
    const User = require('../models/User');
    const user = await User.findById(userId).select('+fcmToken fcmToken').lean();
    return sendFcm(user?.fcmToken, {title, body, data});
  } catch (err) {
    console.warn('FCM notify failed:', err.message);
    return {sent: false, reason: err.message};
  }
}

/** FCM to a provider document (and linked user token as fallback) */
async function notifyProvider(providerId, {title, body, data} = {}) {
  if (!providerId) return {sent: false, reason: 'no_provider'};
  try {
    const Provider = require('../models/Provider');
    const User = require('../models/User');
    const provider = await Provider.findById(providerId)
      .select('fcmToken')
      .lean();
    if (provider?.fcmToken) {
      const result = await sendFcm(provider.fcmToken, {title, body, data});
      if (result.sent) return result;
    }
    const user = await User.findById(providerId).select('fcmToken').lean();
    return sendFcm(user?.fcmToken, {title, body, data});
  } catch (err) {
    console.warn('FCM provider notify failed:', err.message);
    return {sent: false, reason: err.message};
  }
}

/** FCM to all users with role admin */
async function notifyAdmins({title, body, data} = {}) {
  try {
    const User = require('../models/User');
    const admins = await User.find({role: 'admin', fcmToken: {$ne: null}})
      .select('_id fcmToken')
      .lean();
    const results = await Promise.all(
      admins.map((a) => sendFcm(a.fcmToken, {title, body, data})),
    );
    return {
      sent: results.some((r) => r.sent),
      count: results.filter((r) => r.sent).length,
      total: admins.length,
    };
  } catch (err) {
    console.warn('FCM admin notify failed:', err.message);
    return {sent: false, reason: err.message};
  }
}

module.exports = {notifyUser, notifyProvider, notifyAdmins};
