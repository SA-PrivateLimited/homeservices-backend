/**
 * Firebase Admin initialization (Auth ID-token verify + FCM).
 * Compatible with firebase-admin v14 modular API.
 * Session auth for APIs remains JWT (HS256) — see middleware/auth.js
 *
 * Credential resolution order:
 * 1. SERVICE_ACCOUNT_KEY_PATH
 * 2. config/firebase-admin.json (gitignored)
 * 3. Legacy serviceAccountsKey.json paths
 * 4. FIREBASE_SERVICE_ACCOUNT (JSON string env)
 */

const path = require('path');
const fs = require('fs');
const {
  initializeApp,
  getApps,
  getApp,
  cert,
} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getMessaging} = require('firebase-admin/messaging');

function resolveServiceAccountPath() {
  const candidates = [
    process.env.SERVICE_ACCOUNT_KEY_PATH,
    path.join(__dirname, '../../config/firebase-admin.json'),
    path.join(__dirname, '../../serviceAccountsKey.json'),
    path.join(__dirname, '../../../serviceAccountsKey.json'),
    path.join(__dirname, '../../../firebase/serviceAccountKey.json'),
  ];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function loadServiceAccount() {
  const serviceAccountPath = resolveServiceAccountPath();
  if (serviceAccountPath) {
    return {
      serviceAccount: require(serviceAccountPath),
      source: serviceAccountPath,
    };
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return {
      serviceAccount: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),
      source: 'FIREBASE_SERVICE_ACCOUNT',
    };
  }
  return null;
}

function initializeFirebaseAdmin() {
  if (getApps().length) {
    return getApp();
  }

  try {
    const loaded = loadServiceAccount();
    if (!loaded) {
      console.log(
        'ℹ️  Firebase Admin not configured. Set config/firebase-admin.json or FIREBASE_SERVICE_ACCOUNT.',
      );
      return null;
    }

    const app = initializeApp({
      credential: cert(loaded.serviceAccount),
    });
    console.log('✅ Firebase Admin initialized:', loaded.source);
    return app;
  } catch (e) {
    console.warn('⚠️  Firebase Admin init skipped:', e.message);
    return null;
  }
}

const app = initializeFirebaseAdmin();

function isFirebaseReady() {
  return getApps().length > 0;
}

function getFirebaseApp() {
  return getApps().length ? getApp() : null;
}

function auth() {
  if (!isFirebaseReady()) {
    throw new Error('Firebase Admin is not configured');
  }
  return getAuth(getApp());
}

function messaging() {
  if (!isFirebaseReady()) {
    throw new Error('Firebase Admin is not configured');
  }
  return getMessaging(getApp());
}

/**
 * Compatibility surface used by authController (custom tokens) and services.
 */
module.exports = {
  app,
  initializeFirebaseAdmin,
  isFirebaseReady,
  getFirebaseApp,
  auth,
  messaging,
  getAuth: () => auth(),
  getMessaging: () => messaging(),
  get apps() {
    return getApps();
  },
};
