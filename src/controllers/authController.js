/**
 * Email / phone + password registration and login.
 * Issues HS256-signed JWTs (HMAC). No Firebase Auth for login/signup.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const {signAccessToken, signMfaToken, verifyMfaToken} = require('../utils/jwtAuth');
const {encryptToken} = require('../utils/tokenEncryption');
const twilioVerify = require('../services/twilioVerify');
const {
  normalizePhone,
  toE164,
  syncPhoneFields,
} = require('../utils/phone');
const {
  generateTotpSecret,
  buildOtpauthUrl,
  buildQrDataUrl,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyTotpCode,
} = require('../utils/totp');

const SALT_ROUNDS = 12;

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

async function issueSessionForUser(user, {includePin} = {}) {
  const token = signAccessToken({
    sub: user._id,
    email: user.email,
    phone: user.phoneNumber || user.phone,
    name: user.name || user.displayName,
    role: user.role || 'customer',
  });

  let encryptedAuthToken;
  try {
    encryptedAuthToken = encryptToken(token);
  } catch (encErr) {
    const err = new Error(
      encErr.message ||
        'TOKEN_ENCRYPTION_KEY is missing or invalid. Set openssl rand -hex 32 in .env',
    );
    err.statusCode = 500;
    throw err;
  }

  await User.findByIdAndUpdate(user._id, {
    $set: {encryptedAuthToken, updatedAt: new Date()},
  });

  // Optional / future: only when ENABLE_FIREBASE=true
  let firebaseCustomToken = null;
  if (String(process.env.ENABLE_FIREBASE || '').toLowerCase() === 'true') {
    try {
      const admin = require('../config/firebaseAdmin');
      if (admin.apps?.length) {
        firebaseCustomToken = await admin.auth().createCustomToken(user._id, {
          role: user.role || 'customer',
          phone: user.phoneNumber || user.phone || '',
        });
      }
    } catch (e) {
      console.warn('Firebase custom token skipped:', e.message);
    }
  }

  const safe = typeof user.toObject === 'function' ? user.toObject() : {...user};
  delete safe.passwordHash;
  delete safe.pinHash;
  delete safe.pinKey;
  delete safe.encryptedPin;
  delete safe.encryptedAuthToken;
  delete safe.totpSecretEncrypted;
  safe.hasPin = true;
  safe.phoneVerified = true;

  if ((safe.role || user.role) === 'provider') {
    try {
      const Provider = require('../models/Provider');
      const provider = await Provider.findById(user._id).lean();
      if (provider) {
        safe.approvalStatus = provider.approvalStatus || 'pending';
        safe.specialization = provider.specialization;
        safe.isOnline = provider.isOnline;
      } else {
        safe.approvalStatus = 'pending';
      }
    } catch (e) {
      console.warn('Could not load provider profile for session:', e.message);
      safe.approvalStatus = 'pending';
    }
  }

  const result = {
    user: safe,
    token,
    expiresIn: require('../utils/jwtAuth').expiresIn,
  };
  if (includePin) {
    result.pin = includePin;
  }
  if (firebaseCustomToken) {
    result.firebaseCustomToken = firebaseCustomToken;
  }
  return result;
}

function resolveAuthRole(raw) {
  const role = String(raw || 'customer').trim().toLowerCase();
  return role === 'provider' ? 'provider' : 'customer';
}

async function ensureProviderProfile(user, fullName) {
  const Provider = require('../models/Provider');
  const existing = await Provider.findById(user._id);
  if (existing) return existing;
  return Provider.create({
    _id: user._id,
    name: fullName || user.name || user.displayName || 'Provider',
    displayName: fullName || user.displayName || user.name || 'Provider',
    phoneNumber: user.phoneNumber || user.phone,
    approvalStatus: 'pending',
    verified: false,
    isOnline: false,
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

function pinHmacKey(pin) {
  const secret = process.env.JWT_SECRET || process.env.HMAC_JWT_SECRET || 'pin';
  return crypto.createHmac('sha256', secret).update(`pin:${pin}`).digest('hex');
}

async function assertPinGloballyUnique(pin, excludeUserId) {
  const key = pinHmacKey(pin);
  const query = {pinKey: key};
  if (excludeUserId) {
    query._id = {$ne: excludeUserId};
  }
  const existing = await User.findOne(query).select('_id').lean();
  if (existing) {
    const err = new Error('This PIN is already in use. Choose a different 6-digit PIN.');
    err.statusCode = 409;
    throw err;
  }
  return key;
}

async function generateUniquePin(maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i++) {
    const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    try {
      await assertPinGloballyUnique(pin);
      return pin;
    } catch (e) {
      if (e.statusCode !== 409) throw e;
    }
  }
  const err = new Error('Could not allocate a unique PIN. Please try again.');
  err.statusCode = 503;
  throw err;
}

/** Last 10 digits for India-style mobile matching */
function localTenDigits(phone) {
  const digits = normalizePhone(phone).replace(/\D/g, '');
  return digits.slice(-10);
}

function assertTenDigitMobile(phone) {
  const ten = localTenDigits(phone);
  if (!/^\d{10}$/.test(ten)) {
    const err = new Error('Enter a valid 10-digit mobile number');
    err.statusCode = 400;
    throw err;
  }
  return {ten, e164: toE164(ten)};
}

/**
 * POST /api/auth/register
 * Body: { email, password, fullName, phoneNumber, role?, adminSecret? }
 * role: customer | provider | admin
 * Admin: requires ADMIN_REGISTRATION_SECRET in .env and matching adminSecret (body) or X-Admin-Registration-Secret header.
 */
exports.register = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    const fullName = (req.body.fullName || req.body.name || '').trim();
    const synced = syncPhoneFields(req.body.phoneNumber || req.body.phone);
    let role = (req.body.role || 'customer').toLowerCase();

    if (!email || !password || !fullName || !synced.phone) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'email, password, fullName, and phoneNumber are required',
      });
    }

    if (!['customer', 'provider', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'role must be customer, provider, or admin',
      });
    }

    if (role === 'admin') {
      const expected = (process.env.ADMIN_REGISTRATION_SECRET || '').trim();
      const provided = (
        req.body.adminSecret ||
        req.headers['x-admin-registration-secret'] ||
        ''
      ).trim();

      if (!expected || expected.length < 8) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message:
            'Admin registration is disabled until ADMIN_REGISTRATION_SECRET (min 8 chars) is set in server .env',
        });
      }

      if (provided !== expected) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Invalid admin registration secret',
        });
      }
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Password must be at least 8 characters',
      });
    }

    const existing = await User.findOne({
      $or: [
        {email},
        {phoneNumber: synced.phoneNumber},
        {phone: synced.phone},
      ],
    }).lean();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'An account with this email or phone already exists',
      });
    }

    const _id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      _id,
      email,
      phoneNumber: synced.phoneNumber,
      phone: synced.phone,
      name: fullName,
      displayName: fullName,
      role,
      passwordHash,
      phoneVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const token = signAccessToken({
      sub: user._id,
      email: user.email,
      phone: user.phoneNumber || user.phone,
      name: user.name || user.displayName,
      role: user.role,
    });

    let encryptedAuthToken;
    try {
      encryptedAuthToken = encryptToken(token);
    } catch (encErr) {
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        success: false,
        error: 'Server Configuration',
        message:
          encErr.message ||
          'TOKEN_ENCRYPTION_KEY is missing or invalid. Set openssl rand -hex 32 in .env',
      });
    }

    await User.findByIdAndUpdate(user._id, {
      $set: {encryptedAuthToken, updatedAt: new Date()},
    });

    const safe = user.toObject();
    delete safe.passwordHash;

    res.status(201).json({
      success: true,
      data: {
        user: safe,
        token,
        expiresIn: require('../utils/jwtAuth').expiresIn,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 * Body: { password, email? , phoneNumber? } — one of email or phoneNumber required
 *
 * Admin accounts with authenticator MFA:
 * - totpEnabled → { requiresMfa: true, mfaToken } then POST /api/auth/mfa/verify
 * - not enrolled → { requiresMfaSetup: true, mfaToken, qrCodeDataUrl, secret, otpauthUrl }
 *   then POST /api/auth/mfa/enable with first authenticator code
 * Non-admin password login is unchanged (no TOTP).
 */
exports.login = async (req, res, next) => {
  try {
    const password = req.body.password;
    const email = normalizeEmail(req.body.email);
    const synced = syncPhoneFields(req.body.phoneNumber || req.body.phone);

    if (!password || (!email && !synced.phone)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'password and (email or phoneNumber) are required',
      });
    }

    const query = email
      ? {email}
      : {
          $or: [
            {phoneNumber: synced.phoneNumber},
            {phone: synced.phone},
          ],
        };

    const user = await User.findOne(query)
      .select('+passwordHash +totpSecretEncrypted')
      .exec();

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid email/phone or password',
      });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid email/phone or password',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message:
          user.deactivationReason ||
          'This account has been deactivated. Contact support.',
      });
    }

    // Admin: authenticator MFA (TOTP) — not Twilio
    if (user.role === 'admin') {
      if (user.totpEnabled && user.totpSecretEncrypted) {
        const mfaToken = signMfaToken(
          {
            sub: user._id,
            email: user.email,
            role: user.role,
          },
          'mfa_verify',
        );
        return res.json({
          success: true,
          data: {
            requiresMfa: true,
            mfaToken,
            email: user.email,
          },
          message: 'Enter the 6-digit code from your authenticator app',
        });
      }

      const secret = generateTotpSecret();
      let encrypted;
      try {
        encrypted = encryptTotpSecret(secret);
      } catch (encErr) {
        return res.status(500).json({
          success: false,
          error: 'Server Configuration',
          message:
            encErr.message ||
            'TOKEN_ENCRYPTION_KEY is required to store MFA secrets',
        });
      }

      await User.findByIdAndUpdate(user._id, {
        $set: {
          totpSecretEncrypted: encrypted,
          totpEnabled: false,
          updatedAt: new Date(),
        },
      });

      const otpauthUrl = buildOtpauthUrl(user.email, secret);
      const qrCodeDataUrl = await buildQrDataUrl(otpauthUrl);
      const mfaToken = signMfaToken(
        {
          sub: user._id,
          email: user.email,
          role: user.role,
        },
        'mfa_setup',
      );

      return res.json({
        success: true,
        data: {
          requiresMfaSetup: true,
          mfaToken,
          email: user.email,
          secret,
          otpauthUrl,
          qrCodeDataUrl,
        },
        message:
          'Scan the QR code with Google Authenticator / Authy, then enter the 6-digit code',
      });
    }

    const session = await issueSessionForUser(user);
    res.json({
      success: true,
      data: session,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/mfa/enable
 * After password login when requiresMfaSetup — confirm first TOTP code and issue session.
 * Body: { mfaToken, code }
 */
exports.enableMfa = async (req, res, next) => {
  try {
    const {mfaToken, code} = req.body;
    if (!mfaToken || !code) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'mfaToken and code are required',
      });
    }

    let decoded;
    try {
      decoded = verifyMfaToken(mfaToken, 'mfa_setup');
    } catch (e) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: e.message || 'Invalid or expired MFA setup token',
      });
    }

    const user = await User.findById(decoded.sub)
      .select('+totpSecretEncrypted +passwordHash')
      .exec();

    if (!user || user.role !== 'admin' || !user.totpSecretEncrypted) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'MFA setup is not available for this account',
      });
    }

    let secret;
    try {
      secret = decryptTotpSecret(user.totpSecretEncrypted);
    } catch {
      return res.status(500).json({
        success: false,
        error: 'Server Error',
        message: 'Could not read MFA secret',
      });
    }

    if (!verifyTotpCode(secret, code)) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid authenticator code',
      });
    }

    user.totpEnabled = true;
    user.updatedAt = new Date();
    await user.save();

    const session = await issueSessionForUser(user);
    res.json({
      success: true,
      data: session,
      message: 'Authenticator registered. You are signed in.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/mfa/verify
 * After password login when requiresMfa — verify TOTP and issue session.
 * Body: { mfaToken, code }
 */
exports.verifyMfa = async (req, res, next) => {
  try {
    const {mfaToken, code} = req.body;
    if (!mfaToken || !code) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'mfaToken and code are required',
      });
    }

    let decoded;
    try {
      decoded = verifyMfaToken(mfaToken, 'mfa_verify');
    } catch (e) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: e.message || 'Invalid or expired MFA token',
      });
    }

    const user = await User.findById(decoded.sub)
      .select('+totpSecretEncrypted +passwordHash')
      .exec();

    if (
      !user ||
      user.role !== 'admin' ||
      !user.totpEnabled ||
      !user.totpSecretEncrypted
    ) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'MFA is not enabled for this account',
      });
    }

    let secret;
    try {
      secret = decryptTotpSecret(user.totpSecretEncrypted);
    } catch {
      return res.status(500).json({
        success: false,
        error: 'Server Error',
        message: 'Could not read MFA secret',
      });
    }

    if (!verifyTotpCode(secret, code)) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid authenticator code',
      });
    }

    const session = await issueSessionForUser(user);
    res.json({
      success: true,
      data: session,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/phone/send-otp
 * Body: { phoneNumber } — E.164 preferred (+9198...)
 */
exports.sendPhoneOtp = async (req, res, next) => {
  try {
    const phoneNumber = toE164(req.body.phoneNumber || req.body.phone);
    if (!phoneNumber || phoneNumber.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'A valid phoneNumber is required (e.g. +919876543210)',
      });
    }

    if (!twilioVerify.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message:
          'Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID to .env',
      });
    }

    const result = await twilioVerify.sendVerification(phoneNumber);
    res.json({
      success: true,
      data: {
        phoneNumber,
        status: result.status,
        channel: result.channel || 'sms',
        dev: Boolean(result.dev),
        // Returned only in TWILIO_DEV_MODE so the app can show a banner
        ...(result.otp
          ? {
              otp: result.otp,
              expiresAt: result.expiresAt,
              expiresInSeconds: result.expiresInSeconds,
            }
          : {}),
      },
      message: result.dev
        ? 'Temporary OTP generated (valid 5 minutes). Shown in-app.'
        : 'OTP sent via SMS',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: 'Twilio Error',
        message: err.message,
      });
    }
    next(err);
  }
};

/**
 * POST /api/auth/phone/verify-otp
 * Body: { phoneNumber, code, fullName? }
 * Creates / updates customer, marks phoneVerified, returns JWT (+ optional Firebase custom token)
 */
exports.verifyPhoneOtp = async (req, res, next) => {
  try {
    const phoneNumber = toE164(req.body.phoneNumber || req.body.phone);
    const code = String(req.body.code || req.body.otp || '').trim();
    const fullName = (req.body.fullName || req.body.name || 'Customer').trim();

    if (!phoneNumber || !code) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'phoneNumber and code are required',
      });
    }

    if (!twilioVerify.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message:
          'Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID to .env',
      });
    }

    const approved = await twilioVerify.checkVerification(phoneNumber, code);
    if (!approved) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired verification code',
      });
    }

    let user = await User.findOne({
      $or: [{phoneNumber}, {phone: phoneNumber}],
    });

    const synced = syncPhoneFields(phoneNumber);

    if (!user) {
      user = await User.create({
        _id: crypto.randomUUID(),
        phoneNumber: synced.phoneNumber,
        phone: synced.phone,
        phoneVerified: true,
        name: fullName,
        displayName: fullName,
        role: 'customer',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      user.phoneNumber = synced.phoneNumber;
      user.phone = synced.phone;
      user.phoneVerified = true;
      user.role = user.role || 'customer';
      if (!user.name && !user.displayName) {
        user.name = fullName;
        user.displayName = fullName;
      }
      user.updatedAt = new Date();
      await user.save();
    }

    const session = await issueSessionForUser(user);
    res.json({
      success: true,
      data: session,
      message: 'Phone verified successfully',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: 'Twilio Error',
        message: err.message,
      });
    }
    next(err);
  }
};

/**
 * POST /api/auth/phone/lookup
 * Body: { phoneNumber, role? } — role defaults to customer
 */
exports.lookupPhone = async (req, res, next) => {
  try {
    const {ten, e164} = assertTenDigitMobile(
      req.body.phoneNumber || req.body.phone,
    );
    const requestedRole = resolveAuthRole(req.body.role);

    const user = await User.findOne({
      $or: [
        {phoneNumber: e164},
        {phone: e164},
        {phoneNumber: ten},
        {phone: ten},
      ],
    })
      .select('+pinHash')
      .lean();

    const roleMatch = !user || user.role === requestedRole;

    res.json({
      success: true,
      data: {
        phoneNumber: e164,
        localPhone: ten,
        exists: Boolean(user),
        hasPin: Boolean(user?.pinHash),
        role: user?.role || null,
        roleMatch,
        requestedRole,
      },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: 'Bad Request',
        message: err.message,
      });
    }
    next(err);
  }
};

/**
 * POST /api/auth/phone/register-pin
 * Body: { phoneNumber, pin?, fullName? }
 */
exports.registerPin = async (req, res, next) => {
  try {
    const {ten, e164} = assertTenDigitMobile(
      req.body.phoneNumber || req.body.phone,
    );
    const fullName = (req.body.fullName || req.body.name || 'Customer').trim();
    let pin = req.body.pin != null ? String(req.body.pin).trim() : '';

    if (!pin) {
      pin = await generateUniquePin();
    }
    if (!isValidPin(pin)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'PIN must be exactly 6 digits',
      });
    }

    let user = await User.findOne({
      $or: [
        {phoneNumber: e164},
        {phone: e164},
        {phoneNumber: ten},
        {phone: ten},
      ],
    }).select('+pinHash +pinKey +encryptedPin');

    if (user?.pinHash) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'PIN already set for this number. Use login instead.',
      });
    }

    const pinKey = await assertPinGloballyUnique(pin, user?._id);
    const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
    let encryptedPin = null;
    try {
      encryptedPin = encryptToken(pin);
    } catch (e) {
      console.warn('Could not encrypt PIN for admin recovery:', e.message);
    }

    if (!user) {
      user = await User.create({
        _id: crypto.randomUUID(),
        phoneNumber: e164,
        phone: ten,
        phoneVerified: true,
        pinHash,
        pinKey,
        encryptedPin,
        name: fullName,
        displayName: fullName,
        role: 'customer',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      user.phoneNumber = e164;
      user.phone = ten;
      user.phoneVerified = true;
      user.pinHash = pinHash;
      user.pinKey = pinKey;
      if (encryptedPin) user.encryptedPin = encryptedPin;
      user.role = user.role || 'customer';
      if (!user.name) {
        user.name = fullName;
        user.displayName = fullName;
      }
      user.updatedAt = new Date();
      await user.save();
    }

    const session = await issueSessionForUser(user, {includePin: pin});
    res.status(201).json({
      success: true,
      data: session,
      message: 'PIN created. Save it — you will use the same PIN next time.',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: 'Bad Request',
        message: err.message,
      });
    }
    next(err);
  }
};

/**
 * POST /api/auth/phone/login-pin
 * Body: { phoneNumber, pin, role? }
 */
exports.loginPin = async (req, res, next) => {
  try {
    const {ten, e164} = assertTenDigitMobile(
      req.body.phoneNumber || req.body.phone,
    );
    const pin = String(req.body.pin || '').trim();
    const requestedRole = resolveAuthRole(req.body.role);

    if (!isValidPin(pin)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'PIN must be exactly 6 digits',
      });
    }

    const user = await User.findOne({
      $or: [
        {phoneNumber: e164},
        {phone: e164},
        {phoneNumber: ten},
        {phone: ten},
      ],
    }).select('+pinHash');

    if (!user || !user.pinHash) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'No PIN set for this number. Create a PIN first.',
      });
    }

    if (user.role !== requestedRole) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message:
          requestedRole === 'provider'
            ? 'This number is not registered as a provider. Sign up as a provider first.'
            : 'This number is registered as a provider. Use the provider app to sign in.',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message:
          user.deactivationReason ||
          'This account has been deactivated. Contact support.',
      });
    }

    const match = await bcrypt.compare(pin, user.pinHash);
    if (!match) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Incorrect PIN',
      });
    }

    user.phoneVerified = true;
    user.updatedAt = new Date();
    await user.save();

    if (requestedRole === 'provider') {
      await ensureProviderProfile(user, user.name || user.displayName);
    }

    const session = await issueSessionForUser(user);
    res.json({
      success: true,
      data: session,
      message: 'Logged in successfully',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: 'Bad Request',
        message: err.message,
      });
    }
    next(err);
  }
};

/**
 * POST /api/auth/phone/register-with-otp
 * New number: verify OTP, then create account with user-chosen 6-digit PIN.
 * Body: { phoneNumber, code, pin, fullName?, role? }
 */
exports.registerWithOtp = async (req, res, next) => {
  try {
    const {ten, e164} = assertTenDigitMobile(
      req.body.phoneNumber || req.body.phone,
    );
    const code = String(req.body.code || req.body.otp || '').trim();
    const pin = req.body.pin != null ? String(req.body.pin).trim() : '';
    const requestedRole = resolveAuthRole(req.body.role);
    const fullName = (
      req.body.fullName ||
      req.body.name ||
      (requestedRole === 'provider' ? 'Provider' : 'Customer')
    ).trim();

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Verification code is required',
      });
    }
    if (!isValidPin(pin)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'PIN must be exactly 6 digits',
      });
    }

    if (!twilioVerify.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message:
          'OTP is not configured. Set TWILIO_DEV_MODE=true for local testing, or configure Twilio.',
      });
    }

    const approved = await twilioVerify.checkVerification(e164, code);
    if (!approved) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired verification code',
      });
    }

    let user = await User.findOne({
      $or: [
        {phoneNumber: e164},
        {phone: e164},
        {phoneNumber: ten},
        {phone: ten},
      ],
    }).select('+pinHash +pinKey +encryptedPin');

    if (user?.pinHash) {
      if (user.role !== requestedRole) {
        return res.status(409).json({
          success: false,
          error: 'Conflict',
          message:
            requestedRole === 'provider'
              ? 'This number is already registered as a customer. Use a different number for provider signup.'
              : 'This number is already registered as a provider. Use the provider app.',
        });
      }
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Account already exists. Log in with your PIN.',
      });
    }

    if (user && user.role && user.role !== requestedRole) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message:
          requestedRole === 'provider'
            ? 'This number is already registered as a customer. Use a different number for provider signup.'
            : 'This number is already registered as a provider.',
      });
    }

    const pinKey = await assertPinGloballyUnique(pin, user?._id);
    const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
    let encryptedPin = null;
    try {
      encryptedPin = encryptToken(pin);
    } catch (e) {
      console.warn('Could not encrypt PIN for admin recovery:', e.message);
    }

    if (!user) {
      user = await User.create({
        _id: crypto.randomUUID(),
        phoneNumber: e164,
        phone: ten,
        phoneVerified: true,
        pinHash,
        pinKey,
        encryptedPin,
        name: fullName,
        displayName: fullName,
        role: requestedRole,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      user.phoneNumber = e164;
      user.phone = ten;
      user.phoneVerified = true;
      user.pinHash = pinHash;
      user.pinKey = pinKey;
      if (encryptedPin) user.encryptedPin = encryptedPin;
      user.role = requestedRole;
      if (!user.name) {
        user.name = fullName;
        user.displayName = fullName;
      }
      user.updatedAt = new Date();
      await user.save();
    }

    if (requestedRole === 'provider') {
      await ensureProviderProfile(user, fullName);
    }

    const session = await issueSessionForUser(user, {includePin: pin});
    res.status(201).json({
      success: true,
      data: session,
      message:
        requestedRole === 'provider'
          ? 'Provider account created. Complete your profile — you appear to customers after admin approval.'
          : 'Account created. Save your PIN for next login.',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: 'Bad Request',
        message: err.message,
      });
    }
    next(err);
  }
};

/**
 * POST /api/auth/phone/reset-pin
 * Forgot PIN: verify SMS OTP, then set a new login PIN (user must choose PIN).
 * Body: { phoneNumber, code, pin }
 */
exports.resetPin = async (req, res, next) => {
  try {
    const {ten, e164} = assertTenDigitMobile(
      req.body.phoneNumber || req.body.phone,
    );
    const code = String(req.body.code || req.body.otp || '').trim();
    const pin = req.body.pin != null ? String(req.body.pin).trim() : '';

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Verification code is required',
      });
    }

    if (!isValidPin(pin)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'PIN must be exactly 6 digits',
      });
    }

    if (!twilioVerify.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message:
          'OTP is not configured. Set TWILIO_DEV_MODE=true for local testing, or configure Twilio.',
      });
    }

    const approved = await twilioVerify.checkVerification(e164, code);
    if (!approved) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired verification code',
      });
    }

    let user = await User.findOne({
      $or: [
        {phoneNumber: e164},
        {phone: e164},
        {phoneNumber: ten},
        {phone: ten},
      ],
    }).select('+pinHash +pinKey +encryptedPin');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'No account found for this mobile number',
      });
    }

    const pinKey = await assertPinGloballyUnique(pin, user._id);
    const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
    let encryptedPin = null;
    try {
      encryptedPin = encryptToken(pin);
    } catch (e) {
      console.warn('Could not encrypt PIN for admin recovery:', e.message);
    }

    user.phoneNumber = e164;
    user.phone = ten;
    user.phoneVerified = true;
    user.pinHash = pinHash;
    user.pinKey = pinKey;
    if (encryptedPin) user.encryptedPin = encryptedPin;
    user.role = user.role || 'customer';
    user.updatedAt = new Date();
    await user.save();

    const session = await issueSessionForUser(user, {includePin: pin});
    res.json({
      success: true,
      data: session,
      message: 'PIN reset successfully. You are now signed in.',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: 'Bad Request',
        message: err.message,
      });
    }
    next(err);
  }
};

/**
 * POST /api/auth/logout
 * Client clears storage; JWT is stateless so this acknowledges logout for future denylist hooks.
 */
exports.logout = async (req, res) => {
  res.json({
    success: true,
    data: {loggedOut: true},
    message: 'Logged out',
  });
};
