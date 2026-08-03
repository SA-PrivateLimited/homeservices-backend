/**
 * Optional FCM push (Firebase Admin). No-op if Firebase is not configured.
 */

async function notifyUser(userId, {title, body, data} = {}) {
  if (!userId) return {sent: false, reason: 'no_user'};
  try {
    const User = require('../models/User');
    const user = await User.findById(userId).select('+fcmToken fcmToken').lean();
    const token = user?.fcmToken;
    if (!token) return {sent: false, reason: 'no_fcm_token'};

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

module.exports = {notifyUser};
