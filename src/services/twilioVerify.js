/**
 * Twilio Verify — send and check SMS OTP.
 *
 * Env:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_VERIFY_SERVICE_SID
 *
 * Optional local testing without SMS:
 *   TWILIO_DEV_MODE=true
 *   → generates a temporary 6-digit OTP per phone (5 min expiry)
 *   → returns otp + expiresAt so the app can show a banner
 */

const axios = require('axios');

const OTP_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, {code: string, expiresAt: number}>} */
const otpStore = new Map();

function getConfig() {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const serviceSid = (process.env.TWILIO_VERIFY_SERVICE_SID || '').trim();
  const devMode =
    String(process.env.TWILIO_DEV_MODE || '').toLowerCase() === 'true';

  return {accountSid, authToken, serviceSid, devMode};
}

function isConfigured() {
  const {accountSid, authToken, serviceSid, devMode} = getConfig();
  if (devMode) return true;
  return Boolean(accountSid && authToken && serviceSid);
}

function authHeader(accountSid, authToken) {
  const token = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  return `Basic ${token}`;
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Create / replace a temporary OTP for this phone (5 minutes).
 */
function issueTempOtp(phoneE164) {
  const code = generateOtpCode();
  const expiresAt = Date.now() + OTP_TTL_MS;
  otpStore.set(phoneE164, {code, expiresAt});
  return {
    code,
    expiresAt,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
  };
}

/**
 * Verify stored OTP. One-time use; rejects after expiry.
 */
function verifyTempOtp(phoneE164, code) {
  const entry = otpStore.get(phoneE164);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phoneE164);
    return false;
  }
  const ok = entry.code === String(code || '').trim();
  if (ok) {
    otpStore.delete(phoneE164);
  }
  return ok;
}

/**
 * Start SMS verification for E.164 phone number.
 */
async function sendVerification(phoneE164) {
  const {accountSid, authToken, serviceSid, devMode} = getConfig();

  if (devMode) {
    const issued = issueTempOtp(phoneE164);
    console.log(
      `[OTP DEV] ${phoneE164} → ${issued.code} (expires in 5 min)`,
    );
    return {
      status: 'pending',
      channel: 'app',
      to: phoneE164,
      dev: true,
      otp: issued.code,
      expiresAt: new Date(issued.expiresAt).toISOString(),
      expiresInSeconds: issued.expiresInSeconds,
    };
  }

  if (!accountSid || !authToken || !serviceSid) {
    const err = new Error(
      'Twilio Verify is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID',
    );
    err.statusCode = 503;
    throw err;
  }

  const url = `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`;
  try {
    const {data} = await axios.post(
      url,
      new URLSearchParams({To: phoneE164, Channel: 'sms'}),
      {
        headers: {
          Authorization: authHeader(accountSid, authToken),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
      },
    );
    return {
      status: data.status,
      channel: data.channel,
      to: data.to,
    };
  } catch (error) {
    const message =
      error.response?.data?.message ||
      error.message ||
      'Failed to send verification code';
    const err = new Error(message);
    err.statusCode = error.response?.status || 502;
    throw err;
  }
}

/**
 * Check OTP code. Returns true if approved.
 */
async function checkVerification(phoneE164, code) {
  const {accountSid, authToken, serviceSid, devMode} = getConfig();

  if (devMode) {
    return verifyTempOtp(phoneE164, code);
  }

  if (!accountSid || !authToken || !serviceSid) {
    const err = new Error(
      'Twilio Verify is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID',
    );
    err.statusCode = 503;
    throw err;
  }

  const url = `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`;
  try {
    const {data} = await axios.post(
      url,
      new URLSearchParams({To: phoneE164, Code: code}),
      {
        headers: {
          Authorization: authHeader(accountSid, authToken),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
      },
    );
    return data.status === 'approved';
  } catch (error) {
    const message =
      error.response?.data?.message ||
      error.message ||
      'Failed to verify code';
    const err = new Error(message);
    err.statusCode = error.response?.status || 502;
    throw err;
  }
}

module.exports = {
  isConfigured,
  sendVerification,
  checkVerification,
  OTP_TTL_MS,
};
