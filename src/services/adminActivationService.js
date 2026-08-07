/**
 * Admin invitation / activation (no email).
 * Super Admin issues a link; invitee sets password + TOTP, then becomes ACTIVE.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const {signMfaToken, verifyMfaToken} = require('../utils/jwtAuth');
const {
  generateTotpSecret,
  buildOtpauthUrl,
  buildQrDataUrl,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyTotpCode,
} = require('../utils/totp');
const {
  normalizePermissions,
  defaultInvitePermissions,
  resolveAdminPermissions,
} = require('../constants/permissions');

const PASSWORD_SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;
const ACTIVATION_MFA_PURPOSE = 'admin_activation_mfa';

const ADMIN_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
  DISABLED: 'DISABLED',
});

function hashActivationToken(plainToken) {
  return crypto.createHash('sha256').update(String(plainToken)).digest('hex');
}

function generateActivationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function getAdminWebBaseUrl() {
  const raw =
    process.env.ADMIN_WEB_BASE_URL ||
    process.env.ADMIN_PUBLIC_URL ||
    'http://localhost:5173';
  return String(raw).replace(/\/$/, '');
}

function buildActivationLink(plainToken) {
  return `${getAdminWebBaseUrl()}/activate?token=${encodeURIComponent(
    plainToken,
  )}`;
}

function issueActivationTokenBundle() {
  const plainToken = generateActivationToken();
  return {
    plainToken,
    activationTokenHash: hashActivationToken(plainToken),
    activationExpiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
    activationLink: buildActivationLink(plainToken),
  };
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    const err = new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
    err.statusCode = 400;
    throw err;
  }
}

function resolveAdminStatus(user) {
  if (user?.adminStatus) return user.adminStatus;
  if (user?.isActive === false) return ADMIN_STATUSES.DISABLED;
  if (user?.adminApprovalStatus === 'pending') return ADMIN_STATUSES.PENDING;
  if (user?.adminApprovalStatus === 'rejected') return ADMIN_STATUSES.DISABLED;
  return ADMIN_STATUSES.ACTIVE;
}

function assertCanLoginAsAdmin(user) {
  const status = resolveAdminStatus(user);
  if (status === ADMIN_STATUSES.PENDING) {
    const err = new Error(
      'This admin account is not activated yet. Open your activation link to set a password and authenticator.',
    );
    err.statusCode = 403;
    err.code = 'ADMIN_PENDING';
    throw err;
  }
  if (status === ADMIN_STATUSES.LOCKED) {
    const err = new Error(
      'This admin account is locked. Contact a Super Admin.',
    );
    err.statusCode = 403;
    err.code = 'ADMIN_LOCKED';
    throw err;
  }
  if (status === ADMIN_STATUSES.DISABLED || user.isActive === false) {
    const err = new Error(
      user.deactivationReason ||
        'This admin account has been disabled. Contact a Super Admin.',
    );
    err.statusCode = 403;
    err.code = 'ADMIN_DISABLED';
    throw err;
  }
}

function publicAdminFields(user) {
  const raw =
    typeof user.toObject === 'function' ? user.toObject() : {...user};
  delete raw.passwordHash;
  delete raw.pinHash;
  delete raw.pinKey;
  delete raw.encryptedPin;
  delete raw.encryptedAuthToken;
  delete raw.fcmToken;
  delete raw.totpSecretEncrypted;
  delete raw.activationTokenHash;

  const status = resolveAdminStatus(user);
  const hasPendingInvitation =
    status === ADMIN_STATUSES.PENDING &&
    Boolean(user.activationExpiresAt) &&
    new Date(user.activationExpiresAt).getTime() > Date.now();

  return {
    ...raw,
    adminStatus: status,
    totpEnabled: Boolean(user.totpEnabled),
    permissions: resolveAdminPermissions({
      role: 'admin',
      permissions: user.permissions,
    }),
    hasPendingInvitation,
    activationExpiresAt: user.activationExpiresAt || null,
  };
}

async function buildInvitationPayload(plainToken, expiresAt) {
  const activationLink = buildActivationLink(plainToken);
  const qrCodeDataUrl = await buildQrDataUrl(activationLink);
  return {
    activationLink,
    activationExpiresAt: expiresAt,
    qrCodeDataUrl,
  };
}

/**
 * Create PENDING admin + one-time activation link (returned once; hashed in DB).
 */
async function createPendingAdmin({name, email, permissions} = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    const err = new Error('A valid email is required');
    err.statusCode = 400;
    throw err;
  }

  const existing = await User.findOne({email: normalizedEmail});
  if (existing) {
    const err = new Error('A user with this email already exists');
    err.statusCode = 409;
    throw err;
  }

  const bundle = issueActivationTokenBundle();
  const displayName = String(name || '').trim() || undefined;
  const perms =
    permissions === undefined
      ? defaultInvitePermissions()
      : normalizePermissions(permissions);
  const _id = crypto.randomUUID();

  const user = await User.create({
    _id,
    role: 'admin',
    name: displayName,
    displayName,
    email: normalizedEmail,
    passwordHash: null,
    totpSecretEncrypted: null,
    totpEnabled: false,
    adminStatus: ADMIN_STATUSES.PENDING,
    adminApprovalStatus: 'pending',
    permissions: perms,
    activationTokenHash: bundle.activationTokenHash,
    activationExpiresAt: bundle.activationExpiresAt,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const invitation = await buildInvitationPayload(
    bundle.plainToken,
    bundle.activationExpiresAt,
  );

  return {
    admin: publicAdminFields(user),
    ...invitation,
  };
}

async function findAdminOrThrow(userId) {
  const user = await User.findById(userId).select(
    '+activationTokenHash +passwordHash +totpSecretEncrypted',
  );
  if (!user) {
    const err = new Error('Admin not found');
    err.statusCode = 404;
    throw err;
  }
  if ((user.role || '').toLowerCase() !== 'admin') {
    const err = new Error('Target user is not an admin');
    err.statusCode = 400;
    throw err;
  }
  return user;
}

/**
 * Issue a new activation token (invalidates previous). PENDING only.
 */
async function regenerateActivation(userId) {
  const user = await findAdminOrThrow(userId);
  const status = resolveAdminStatus(user);
  if (status !== ADMIN_STATUSES.PENDING) {
    const err = new Error(
      'Activation links can only be regenerated for PENDING admins',
    );
    err.statusCode = 400;
    throw err;
  }

  const bundle = issueActivationTokenBundle();
  user.activationTokenHash = bundle.activationTokenHash;
  user.activationExpiresAt = bundle.activationExpiresAt;
  // Fresh invite: clear any partial activation progress
  user.passwordHash = null;
  user.totpSecretEncrypted = null;
  user.totpEnabled = false;
  user.adminStatus = ADMIN_STATUSES.PENDING;
  user.adminApprovalStatus = 'pending';
  user.isActive = true;
  user.updatedAt = new Date();
  await user.save();

  const invitation = await buildInvitationPayload(
    bundle.plainToken,
    bundle.activationExpiresAt,
  );

  return {
    admin: publicAdminFields(user),
    ...invitation,
  };
}

/**
 * Cancel invitation: clear token; mark DISABLED so login stays blocked.
 */
async function cancelInvitation(userId) {
  const user = await findAdminOrThrow(userId);
  if (resolveAdminStatus(user) !== ADMIN_STATUSES.PENDING) {
    const err = new Error('Only PENDING invitations can be cancelled');
    err.statusCode = 400;
    throw err;
  }

  user.activationTokenHash = null;
  user.activationExpiresAt = null;
  user.passwordHash = null;
  user.totpSecretEncrypted = null;
  user.totpEnabled = false;
  user.adminStatus = ADMIN_STATUSES.DISABLED;
  user.adminApprovalStatus = 'rejected';
  user.isActive = false;
  user.deactivatedAt = new Date();
  user.deactivationReason = 'Invitation cancelled';
  user.updatedAt = new Date();
  await user.save();

  return publicAdminFields(user);
}

async function findByActivationToken(plainToken) {
  const token = String(plainToken || '').trim();
  if (!token) {
    const err = new Error('Activation token is required');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({
    role: 'admin',
    activationTokenHash: hashActivationToken(token),
  }).select('+activationTokenHash +passwordHash +totpSecretEncrypted');

  if (!user) {
    const err = new Error('Invalid or already used activation link');
    err.statusCode = 404;
    err.code = 'ACTIVATION_INVALID';
    throw err;
  }

  if (resolveAdminStatus(user) !== ADMIN_STATUSES.PENDING) {
    const err = new Error('This invitation is no longer pending');
    err.statusCode = 410;
    err.code = 'ACTIVATION_NOT_PENDING';
    throw err;
  }

  if (
    !user.activationExpiresAt ||
    new Date(user.activationExpiresAt).getTime() <= Date.now()
  ) {
    const err = new Error(
      'This activation link has expired. Ask a Super Admin to regenerate it.',
    );
    err.statusCode = 410;
    err.code = 'ACTIVATION_EXPIRED';
    throw err;
  }

  return user;
}

/**
 * Public: validate token before showing activation UI.
 */
async function validateActivationToken(plainToken) {
  const user = await findByActivationToken(plainToken);
  return {
    valid: true,
    email: user.email,
    name: user.name || user.displayName || null,
    expiresAt: user.activationExpiresAt,
  };
}

/**
 * Step 1: set password, provision TOTP secret, return QR + short-lived MFA token.
 */
async function setActivationPassword(plainToken, password, confirmPassword) {
  if (confirmPassword !== undefined && password !== confirmPassword) {
    const err = new Error('Passwords do not match');
    err.statusCode = 400;
    throw err;
  }
  assertPassword(password);

  const user = await findByActivationToken(plainToken);
  const secret = generateTotpSecret();
  let encrypted;
  try {
    encrypted = encryptTotpSecret(secret);
  } catch (encErr) {
    const err = new Error(
      encErr.message ||
        'TOKEN_ENCRYPTION_KEY is required to store MFA secrets',
    );
    err.statusCode = 500;
    throw err;
  }

  user.passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
  user.totpSecretEncrypted = encrypted;
  user.totpEnabled = false;
  user.updatedAt = new Date();
  await user.save();

  const otpauthUrl = buildOtpauthUrl(user.email, secret);
  const qrCodeDataUrl = await buildQrDataUrl(otpauthUrl);
  const activationMfaToken = signMfaToken(
    {
      sub: user._id,
      email: user.email,
      role: user.role,
    },
    ACTIVATION_MFA_PURPOSE,
  );

  return {
    email: user.email,
    secret,
    otpauthUrl,
    qrCodeDataUrl,
    activationMfaToken,
    message:
      'Scan the QR code with Google Authenticator, then enter the 6-digit code to finish activation.',
  };
}

/**
 * Step 2: verify first TOTP code → ACTIVE; consume activation token.
 */
async function completeActivation(activationMfaToken, code) {
  let decoded;
  try {
    decoded = verifyMfaToken(activationMfaToken, ACTIVATION_MFA_PURPOSE);
  } catch (e) {
    const err = new Error(e.message || 'Invalid or expired activation session');
    err.statusCode = 401;
    throw err;
  }

  const user = await User.findById(decoded.sub).select(
    '+passwordHash +totpSecretEncrypted +activationTokenHash',
  );
  if (!user || (user.role || '').toLowerCase() !== 'admin') {
    const err = new Error('Admin not found');
    err.statusCode = 404;
    throw err;
  }
  if (resolveAdminStatus(user) !== ADMIN_STATUSES.PENDING) {
    const err = new Error('This invitation is no longer pending');
    err.statusCode = 410;
    throw err;
  }
  if (!user.passwordHash || !user.totpSecretEncrypted) {
    const err = new Error('Create a password before verifying authenticator');
    err.statusCode = 400;
    throw err;
  }

  const secret = decryptTotpSecret(user.totpSecretEncrypted);
  if (!verifyTotpCode(secret, code)) {
    const err = new Error('Invalid authenticator code');
    err.statusCode = 401;
    throw err;
  }

  user.totpEnabled = true;
  user.adminStatus = ADMIN_STATUSES.ACTIVE;
  user.adminApprovalStatus = 'approved';
  user.activationTokenHash = null;
  user.activationExpiresAt = null;
  user.isActive = true;
  user.deactivatedAt = undefined;
  user.deactivationReason = undefined;
  user.updatedAt = new Date();
  await user.save();

  return {
    admin: publicAdminFields(user),
    message: 'Account activated. You can sign in with email, password, and authenticator.',
  };
}

async function setAdminLifecycleStatus(userId, nextStatus, {reason, actorId} = {}) {
  const allowed = Object.values(ADMIN_STATUSES);
  if (!allowed.includes(nextStatus)) {
    const err = new Error(`status must be one of: ${allowed.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const user = await findAdminOrThrow(userId);
  const current = resolveAdminStatus(user);

  if (nextStatus === ADMIN_STATUSES.ACTIVE) {
    if (current === ADMIN_STATUSES.PENDING) {
      const err = new Error(
        'PENDING admins must complete the activation link (password + MFA)',
      );
      err.statusCode = 400;
      throw err;
    }
    if (!user.passwordHash) {
      const err = new Error('Cannot activate an admin without a password');
      err.statusCode = 400;
      throw err;
    }
    user.adminStatus = ADMIN_STATUSES.ACTIVE;
    user.adminApprovalStatus = 'approved';
    user.isActive = true;
    user.deactivatedAt = undefined;
    user.deactivationReason = undefined;
    user.deactivatedBy = undefined;
  } else if (nextStatus === ADMIN_STATUSES.DISABLED) {
    user.adminStatus = ADMIN_STATUSES.DISABLED;
    user.isActive = false;
    user.deactivatedAt = new Date();
    user.deactivationReason = reason || 'Disabled by Super Admin';
    user.deactivatedBy = actorId || undefined;
  } else if (nextStatus === ADMIN_STATUSES.LOCKED) {
    user.adminStatus = ADMIN_STATUSES.LOCKED;
    user.isActive = false;
    user.deactivatedAt = new Date();
    user.deactivationReason = reason || 'Locked by Super Admin';
    user.deactivatedBy = actorId || undefined;
  } else if (nextStatus === ADMIN_STATUSES.PENDING) {
    // Re-open as invitation — regenerate separately
    user.adminStatus = ADMIN_STATUSES.PENDING;
    user.adminApprovalStatus = 'pending';
    user.isActive = true;
    user.passwordHash = null;
    user.totpSecretEncrypted = null;
    user.totpEnabled = false;
    user.deactivatedAt = undefined;
    user.deactivationReason = undefined;
  }

  user.updatedAt = new Date();
  await user.save();
  return publicAdminFields(user);
}

/**
 * Replace admin permissions (Super Admin). Effective on target's next login (JWT).
 */
async function updateAdminPermissions(userId, permissions) {
  const user = await findAdminOrThrow(userId);
  const next = normalizePermissions(permissions);
  user.permissions = next;
  user.updatedAt = new Date();
  await user.save();
  return publicAdminFields(user);
}

module.exports = {
  ADMIN_STATUSES,
  ACTIVATION_MFA_PURPOSE,
  MIN_PASSWORD_LENGTH,
  hashActivationToken,
  buildActivationLink,
  getAdminWebBaseUrl,
  resolveAdminStatus,
  assertCanLoginAsAdmin,
  publicAdminFields,
  createPendingAdmin,
  regenerateActivation,
  cancelInvitation,
  validateActivationToken,
  setActivationPassword,
  completeActivation,
  setAdminLifecycleStatus,
  updateAdminPermissions,
};
