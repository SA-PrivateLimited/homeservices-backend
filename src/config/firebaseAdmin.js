/**
 * Optional Firebase Admin initialization (Realtime DB, legacy integrations).
 * Auth uses JWT (HMAC/HS256) — see middleware/auth.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

if (!admin.apps.length) {
  try {
    let serviceAccountPath = null;
    const possiblePaths = [
      path.join(__dirname, '../../serviceAccountsKey.json'),
      path.join(__dirname, '../../../serviceAccountsKey.json'),
      path.join(__dirname, '../../../firebase/serviceAccountKey.json'),
      process.env.SERVICE_ACCOUNT_KEY_PATH,
    ];

    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        serviceAccountPath = p;
        break;
      }
    }

    if (serviceAccountPath) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized (RTDB/legacy):', serviceAccountPath);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT');
    } else {
      console.log('ℹ️  Firebase Admin not configured (optional for RTDB).');
    }
  } catch (e) {
    console.warn('⚠️  Firebase Admin init skipped:', e.message);
  }
}

module.exports = admin;
