/**
 * Firebase Admin service — ID token verify, FCM, topic management.
 * Does not replace app JWT auth; only verifies Firebase Phone Auth tokens
 * and sends push notifications.
 */

const firebaseAdmin = require('../config/firebaseAdmin');

function isFirebaseReady() {
  return firebaseAdmin.isFirebaseReady();
}

function assertReady() {
  if (!isFirebaseReady()) {
    const err = new Error(
      'Firebase Admin is not configured. Add config/firebase-admin.json or FIREBASE_SERVICE_ACCOUNT.',
    );
    err.statusCode = 503;
    throw err;
  }
}

/**
 * Verify a Firebase ID token from client Phone Auth.
 * @param {string} idToken
 * @returns {Promise<object>} decoded token
 */
async function verifyIdToken(idToken) {
  assertReady();
  const token = String(idToken || '').trim();
  if (!token) {
    const err = new Error('Firebase idToken is required');
    err.statusCode = 400;
    throw err;
  }

  try {
    return await firebaseAdmin.auth().verifyIdToken(token, true);
  } catch (e) {
    const err = new Error(
      e.code === 'auth/id-token-expired'
        ? 'Firebase ID token expired. Sign in with phone again.'
        : 'Invalid Firebase ID token',
    );
    err.statusCode = 401;
    err.cause = e;
    throw err;
  }
}

/**
 * Verify ID token and ensure phone_number matches the requested phone.
 * @returns {Promise<{ decoded: object, phoneE164: string, firebaseUid: string }>}
 */
async function verifyPhoneIdToken(idToken, expectedPhone) {
  const decoded = await verifyIdToken(idToken);
  const phoneE164 = decoded.phone_number || '';

  if (!phoneE164) {
    const err = new Error(
      'Firebase token has no phone_number. Complete Firebase Phone Auth first.',
    );
    err.statusCode = 401;
    throw err;
  }

  if (expectedPhone) {
    const expectedDigits = String(expectedPhone).replace(/\D/g, '');
    const tokenDigits = String(phoneE164).replace(/\D/g, '');
    const expectedTen = expectedDigits.slice(-10);
    const tokenTen = tokenDigits.slice(-10);
    if (!expectedTen || expectedTen !== tokenTen) {
      const err = new Error(
        'Phone number does not match the Firebase authenticated phone',
      );
      err.statusCode = 403;
      throw err;
    }
  }

  return {
    decoded,
    phoneE164,
    firebaseUid: decoded.uid,
  };
}

async function sendToToken(token, {title, body, data, android, apns} = {}) {
  assertReady();
  if (!token) {
    return {sent: false, reason: 'no_fcm_token'};
  }

  const message = {
    token,
    notification: {
      title: title || 'Homora',
      body: body || '',
    },
    data: Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [k, String(v ?? '')]),
    ),
  };
  if (android) message.android = android;
  if (apns) message.apns = apns;

  try {
    const messageId = await firebaseAdmin.messaging().send(message);
    return {sent: true, messageId};
  } catch (err) {
    console.warn('FCM sendToToken failed:', err.message);
    return {sent: false, reason: err.message, code: err.code};
  }
}

async function sendToTokens(tokens, payload = {}) {
  assertReady();
  const list = [...new Set((tokens || []).filter(Boolean))];
  if (!list.length) {
    return {sent: false, successCount: 0, failureCount: 0, reason: 'no_tokens'};
  }

  let successCount = 0;
  let failureCount = 0;
  const CHUNK = 500;

  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const res = await firebaseAdmin.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: payload.title || 'Homora',
        body: payload.body || '',
      },
      data: Object.fromEntries(
        Object.entries(payload.data || {}).map(([k, v]) => [k, String(v ?? '')]),
      ),
    });
    successCount += res.successCount;
    failureCount += res.failureCount;
  }

  return {
    sent: successCount > 0,
    successCount,
    failureCount,
    total: list.length,
  };
}

async function sendToTopic(topic, {title, body, data} = {}) {
  assertReady();
  const name = String(topic || '').trim();
  if (!name) {
    return {sent: false, reason: 'no_topic'};
  }

  try {
    const messageId = await firebaseAdmin.messaging().send({
      topic: name,
      notification: {
        title: title || 'Homora',
        body: body || '',
      },
      data: Object.fromEntries(
        Object.entries(data || {}).map(([k, v]) => [k, String(v ?? '')]),
      ),
    });
    return {sent: true, messageId};
  } catch (err) {
    console.warn('FCM sendToTopic failed:', err.message);
    return {sent: false, reason: err.message};
  }
}

async function subscribeToTopic(tokens, topic) {
  assertReady();
  const list = Array.isArray(tokens) ? tokens.filter(Boolean) : [tokens].filter(Boolean);
  if (!list.length || !topic) {
    return {successCount: 0, failureCount: 0};
  }
  return firebaseAdmin.messaging().subscribeToTopic(list, topic);
}

async function unsubscribeFromTopic(tokens, topic) {
  assertReady();
  const list = Array.isArray(tokens) ? tokens.filter(Boolean) : [tokens].filter(Boolean);
  if (!list.length || !topic) {
    return {successCount: 0, failureCount: 0};
  }
  return firebaseAdmin.messaging().unsubscribeFromTopic(list, topic);
}

function topicForRole(role) {
  const r = String(role || 'customer').toLowerCase();
  return `role_${r}`;
}

function topicForUser(userId) {
  return `user_${String(userId)}`;
}

module.exports = {
  isReady: isFirebaseReady,
  verifyIdToken,
  verifyPhoneIdToken,
  sendToToken,
  sendToTokens,
  sendToTopic,
  subscribeToTopic,
  unsubscribeFromTopic,
  topicForRole,
  topicForUser,
};
