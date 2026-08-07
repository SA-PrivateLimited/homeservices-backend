/**
 * Reusable NotificationService — FCM via Firebase Admin.
 * Controllers should prefer this module (or utils/notify re-exports).
 */

const firebaseService = require('./firebaseService');

async function sendToToken(token, payload) {
  if (!firebaseService.isReady()) {
    return {sent: false, reason: 'firebase_not_configured'};
  }
  return firebaseService.sendToToken(token, payload);
}

async function notifyUser(userId, {title, body, data} = {}) {
  if (!userId) return {sent: false, reason: 'no_user'};
  try {
    const User = require('../models/User');
    const user = await User.findById(userId).select('fcmToken').lean();
    return sendToToken(user?.fcmToken, {title, body, data});
  } catch (err) {
    console.warn('notifyUser failed:', err.message);
    return {sent: false, reason: err.message};
  }
}

async function notifyProvider(providerId, {title, body, data} = {}) {
  if (!providerId) return {sent: false, reason: 'no_provider'};
  try {
    const Provider = require('../models/Provider');
    const User = require('../models/User');
    const provider = await Provider.findById(providerId)
      .select('fcmToken')
      .lean();
    if (provider?.fcmToken) {
      const result = await sendToToken(provider.fcmToken, {title, body, data});
      if (result.sent) return result;
    }
    const user = await User.findById(providerId).select('fcmToken').lean();
    return sendToToken(user?.fcmToken, {title, body, data});
  } catch (err) {
    console.warn('notifyProvider failed:', err.message);
    return {sent: false, reason: err.message};
  }
}

async function notifyAdmins({title, body, data} = {}) {
  try {
    const User = require('../models/User');
    const admins = await User.find({
      role: 'admin',
      fcmToken: {$ne: null, $exists: true},
    })
      .select('_id fcmToken')
      .lean();

    if (!firebaseService.isReady()) {
      return {sent: false, reason: 'firebase_not_configured', total: admins.length};
    }

    const tokens = admins.map((a) => a.fcmToken).filter(Boolean);
    const result = await firebaseService.sendToTokens(tokens, {title, body, data});
    return {
      sent: result.sent,
      count: result.successCount || 0,
      total: admins.length,
      failureCount: result.failureCount || 0,
    };
  } catch (err) {
    console.warn('notifyAdmins failed:', err.message);
    return {sent: false, reason: err.message};
  }
}

/**
 * Persist FCM token on user (and provider mirror) and subscribe to topics.
 */
async function registerDeviceToken(userId, fcmToken, {role} = {}) {
  const User = require('../models/User');
  const Provider = require('../models/Provider');

  const token = String(fcmToken || '').trim();
  if (!userId || !token) {
    const err = new Error('userId and fcmToken are required');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {$set: {fcmToken: token, updatedAt: new Date()}},
    {new: true},
  ).lean();

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const effectiveRole = role || user.role || 'customer';

  if (effectiveRole === 'provider') {
    await Provider.findByIdAndUpdate(userId, {
      $set: {fcmToken: token, updatedAt: new Date()},
    });
  }

  const topics = {
    role: firebaseService.topicForRole(effectiveRole),
    user: firebaseService.topicForUser(userId),
  };

  let topicResult = null;
  if (firebaseService.isReady()) {
    try {
      await firebaseService.subscribeToTopic(token, topics.role);
      await firebaseService.subscribeToTopic(token, topics.user);
      topicResult = {subscribed: [topics.role, topics.user]};
    } catch (e) {
      console.warn('FCM topic subscribe failed:', e.message);
      topicResult = {error: e.message};
    }
  }

  return {
    userId,
    role: effectiveRole,
    topics,
    topicResult,
  };
}

async function notifyTopic(topic, payload) {
  if (!firebaseService.isReady()) {
    return {sent: false, reason: 'firebase_not_configured'};
  }
  return firebaseService.sendToTopic(topic, payload);
}

module.exports = {
  sendToToken,
  notifyUser,
  notifyProvider,
  notifyAdmins,
  registerDeviceToken,
  notifyTopic,
  /** @deprecated alias */
  sendFcm: sendToToken,
};
