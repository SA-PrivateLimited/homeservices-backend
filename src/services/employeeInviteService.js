/**
 * Employee portal invitation + TOTP activation.
 * Separate from Admin activation — never sets role=admin or Admin MFA purpose.
 */

const bcrypt = require('bcryptjs');
const Employee = require('../models/Employee');
const {signMfaToken, verifyMfaToken, signAccessToken} = require('../utils/jwtAuth');
const {
  generateTotpSecret,
  buildOtpauthUrl,
  buildQrDataUrl,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyTotpCode,
  ISSUER_EMPLOYEE,
} = require('../utils/totp');
const {
  DEFAULT_TTL_MS,
  hashInviteToken,
  issueInviteTokenBundle,
} = require('../utils/oneTimeToken');

const PASSWORD_SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const EMPLOYEE_ACTIVATION_MFA_PURPOSE = 'employee_activation_mfa';
const EMPLOYEE_LOGIN_MFA_PURPOSE = 'employee_mfa_verify';

const PRODUCTION_ADMIN_ORIGIN = 'https://admin.akansho.com';
const DEFAULT_LOCAL_ORIGIN = 'http://localhost:5173';

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

function getEmployeeWebBaseUrl(preferredOrigin) {
  const raw = String(
    preferredOrigin ||
      process.env.EMPLOYEE_PUBLIC_URL ||
      process.env.ADMIN_PUBLIC_URL ||
      '',
  ).trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      /* fall through */
    }
  }
  if (process.env.NODE_ENV === 'production') return PRODUCTION_ADMIN_ORIGIN;
  return DEFAULT_LOCAL_ORIGIN;
}

function buildEmployeeActivationLink(plainToken, preferredOrigin) {
  return `${getEmployeeWebBaseUrl(preferredOrigin)}/employee/activate?token=${encodeURIComponent(
    plainToken,
  )}`;
}

function buildWhatsAppInviteUrl(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '');
  const ten = digits.length >= 10 ? digits.slice(-10) : '';
  if (!ten) return '';
  const text = encodeURIComponent(message);
  return `https://wa.me/91${ten}?text=${text}`;
}

function publicEmployeeAccount(employee) {
  const o =
    typeof employee.toObject === 'function'
      ? employee.toObject()
      : {...employee};
  delete o.passwordHash;
  delete o.totpSecretEncrypted;
  delete o.inviteTokenHash;
  return o;
}

function accountLabel(status) {
  switch (status) {
    case 'none':
      return 'Not invited';
    case 'invited':
      return 'Invitation sent';
    case 'activation_pending':
      return 'Activation pending';
    case 'active':
      return 'Active';
    case 'suspended':
      return 'Suspended';
    case 'revoked':
      return 'Revoked';
    default:
      return status || 'Not invited';
  }
}

/**
 * Create / rotate invitation. Does not send WhatsApp — caller shares the link.
 */
async function createEmployeeInvitation(employeeId, {origin, createdBy, createdByName} = {}) {
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }
  const email = normalizeEmail(employee.email);
  if (!email || !email.includes('@')) {
    const err = new Error('Employee email is required before sending an invitation');
    err.statusCode = 400;
    throw err;
  }

  const bundle = issueInviteTokenBundle(DEFAULT_TTL_MS);
  employee.inviteTokenHash = bundle.tokenHash;
  employee.inviteExpiresAt = bundle.expiresAt;
  employee.inviteSentAt = new Date();
  employee.accountStatus = 'invited';
  employee.totpEnabled = false;
  employee.totpSecretEncrypted = '';
  employee.passwordHash = '';
  employee.inviteAcceptedAt = undefined;
  employee.updatedBy = createdBy || '';
  employee.activity = employee.activity || [];
  employee.activity.unshift({
    type: 'invitation_created',
    summary: 'Employee invitation created',
    detail: email,
    createdAt: new Date(),
    createdBy: createdBy || '',
    createdByName: createdByName || 'HR',
  });
  await employee.save();

  const activationLink = buildEmployeeActivationLink(
    bundle.plainToken,
    origin,
  );
  const message = [
    'Akansho Employee Invitation',
    '',
    `Hello ${employee.fullName},`,
    '',
    'You have been invited to access your Akansho employee account.',
    '',
    'Activate your account (set password + authenticator):',
    activationLink,
    '',
    'This invitation expires after a limited period.',
    '',
    'Akansho',
  ].join('\n');

  return {
    employee: publicEmployeeAccount(employee),
    activationLink,
    expiresAt: bundle.expiresAt,
    whatsappUrl: buildWhatsAppInviteUrl(employee.phone, message),
    inviteMessage: message,
  };
}

async function revokeEmployeeInvitation(employeeId, {createdBy, createdByName} = {}) {
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }
  employee.inviteTokenHash = '';
  employee.inviteExpiresAt = undefined;
  if (employee.accountStatus === 'invited' || employee.accountStatus === 'activation_pending') {
    employee.accountStatus = 'revoked';
  }
  employee.updatedBy = createdBy || '';
  employee.activity.unshift({
    type: 'invitation_revoked',
    summary: 'Employee invitation revoked',
    detail: '',
    createdAt: new Date(),
    createdBy: createdBy || '',
    createdByName: createdByName || 'HR',
  });
  await employee.save();
  return publicEmployeeAccount(employee);
}

async function validateEmployeeInviteToken(plainToken) {
  const hash = hashInviteToken(plainToken);
  const employee = await Employee.findOne({inviteTokenHash: hash});
  if (!employee) {
    const err = new Error('This invitation is invalid or has already been used.');
    err.statusCode = 400;
    err.code = 'INVITE_INVALID';
    throw err;
  }
  if (
    employee.inviteExpiresAt &&
    new Date(employee.inviteExpiresAt).getTime() < Date.now()
  ) {
    const err = new Error(
      'This invitation has expired. Please contact Akansho HR for a new invitation.',
    );
    err.statusCode = 400;
    err.code = 'INVITE_EXPIRED';
    throw err;
  }
  if (employee.accountStatus === 'active' && employee.totpEnabled) {
    const err = new Error('Invitation already used.');
    err.statusCode = 400;
    err.code = 'INVITE_USED';
    throw err;
  }
  return employee;
}

async function setEmployeeActivationPassword(plainToken, password) {
  assertPassword(password);
  const employee = await validateEmployeeInviteToken(plainToken);
  employee.passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
  employee.accountStatus = 'activation_pending';

  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpauthUrl(
    employee.email,
    secret,
    ISSUER_EMPLOYEE,
  );
  const qrCodeDataUrl = await buildQrDataUrl(otpauthUrl);
  employee.totpSecretEncrypted = encryptTotpSecret(secret);
  employee.totpEnabled = false;
  await employee.save();

  const activationMfaToken = signMfaToken(
    {
      sub: String(employee._id),
      email: normalizeEmail(employee.email),
      role: 'employee',
      employeeId: String(employee._id),
    },
    EMPLOYEE_ACTIVATION_MFA_PURPOSE,
  );

  return {
    email: normalizeEmail(employee.email),
    displayName: employee.fullName,
    secret,
    qrCodeDataUrl,
    activationMfaToken,
  };
}

async function completeEmployeeActivationMfa(activationMfaToken, code) {
  let decoded;
  try {
    decoded = verifyMfaToken(
      activationMfaToken,
      EMPLOYEE_ACTIVATION_MFA_PURPOSE,
    );
  } catch {
    const err = new Error('Activation session expired. Start again from your invitation link.');
    err.statusCode = 401;
    throw err;
  }
  if (!decoded.sub) {
    const err = new Error('Invalid activation session.');
    err.statusCode = 401;
    throw err;
  }

  const employee = await Employee.findById(decoded.sub);
  if (!employee || !employee.totpSecretEncrypted) {
    const err = new Error('Employee activation not found.');
    err.statusCode = 404;
    throw err;
  }

  const secret = decryptTotpSecret(employee.totpSecretEncrypted);
  if (!verifyTotpCode(secret, code)) {
    const err = new Error('Invalid authenticator code.');
    err.statusCode = 401;
    err.code = 'MFA_INVALID';
    throw err;
  }

  employee.totpEnabled = true;
  employee.accountStatus = 'active';
  employee.inviteTokenHash = '';
  employee.inviteExpiresAt = undefined;
  employee.inviteAcceptedAt = new Date();
  employee.activity.unshift({
    type: 'account_activated',
    summary: 'Employee account activated',
    detail: 'Password and authenticator set',
    createdAt: new Date(),
    createdBy: String(employee._id),
    createdByName: employee.fullName,
  });
  await employee.save();

  return {
    employee: publicEmployeeAccount(employee),
    message: 'Account activated. You can sign in with your email, password, and authenticator.',
  };
}

async function updateEmployeeAccess(
  employeeId,
  {profileAccess, canRaiseRequest, createdBy, createdByName} = {},
) {
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }
  const changes = [];
  if (profileAccess === 'view' || profileAccess === 'edit') {
    if (employee.profileAccess !== profileAccess) {
      changes.push(`Profile ${employee.profileAccess} → ${profileAccess}`);
      employee.profileAccess = profileAccess;
    }
  }
  if (typeof canRaiseRequest === 'boolean') {
    if (employee.canRaiseRequest !== canRaiseRequest) {
      changes.push(
        `Raise request ${employee.canRaiseRequest ? 'on' : 'off'} → ${
          canRaiseRequest ? 'on' : 'off'
        }`,
      );
      employee.canRaiseRequest = canRaiseRequest;
    }
  }
  if (changes.length) {
    employee.updatedBy = createdBy || '';
    employee.activity.unshift({
      type: 'access_updated',
      summary: 'Employee access updated',
      detail: changes.join('; '),
      createdAt: new Date(),
      createdBy: createdBy || '',
      createdByName: createdByName || 'HR',
    });
    await employee.save();
  }
  return publicEmployeeAccount(employee);
}

/**
 * Login step 1: email + password → MFA challenge token
 */
async function beginEmployeeLogin(email, password) {
  const normalized = normalizeEmail(email);
  const employee = await Employee.findOne({email: normalized});
  if (!employee || !employee.passwordHash) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }
  if (employee.accountStatus !== 'active' || !employee.totpEnabled) {
    const err = new Error(
      'This employee account is not activated yet. Open your invitation link to finish setup.',
    );
    err.statusCode = 403;
    err.code = 'EMPLOYEE_PENDING';
    throw err;
  }
  if (
    employee.status === 'former' ||
    employee.status === 'inactive' ||
    employee.accountStatus === 'suspended'
  ) {
    const err = new Error('This employee account cannot sign in.');
    err.statusCode = 403;
    throw err;
  }
  const ok = await bcrypt.compare(String(password || ''), employee.passwordHash);
  if (!ok) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }
  const mfaToken = signMfaToken(
    {
      sub: String(employee._id),
      email: normalized,
      role: 'employee',
      employeeId: String(employee._id),
    },
    EMPLOYEE_LOGIN_MFA_PURPOSE,
  );
  return {mfaToken, email: normalized, displayName: employee.fullName};
}

/**
 * Login step 2: MFA → access token (employee purpose, not admin)
 */
async function completeEmployeeLogin(mfaToken, code) {
  let decoded;
  try {
    decoded = verifyMfaToken(mfaToken, EMPLOYEE_LOGIN_MFA_PURPOSE);
  } catch {
    const err = new Error('Sign-in session expired. Please sign in again.');
    err.statusCode = 401;
    throw err;
  }
  if (!decoded.sub) {
    const err = new Error('Invalid sign-in session.');
    err.statusCode = 401;
    throw err;
  }
  const employee = await Employee.findById(decoded.sub);
  if (!employee || !employee.totpEnabled || !employee.totpSecretEncrypted) {
    const err = new Error('Employee account not found.');
    err.statusCode = 404;
    throw err;
  }
  const secret = decryptTotpSecret(employee.totpSecretEncrypted);
  if (!verifyTotpCode(secret, code)) {
    const err = new Error('Invalid authenticator code.');
    err.statusCode = 401;
    throw err;
  }

  const accessToken = signAccessToken({
    sub: `employee:${employee._id}`,
    role: 'employee',
    email: normalizeEmail(employee.email),
    name: employee.fullName,
    phone: employee.phone || '',
  });

  return {
    accessToken,
    employee: publicEmployeeAccount(employee),
  };
}

module.exports = {
  EMPLOYEE_ACTIVATION_MFA_PURPOSE,
  accountLabel,
  publicEmployeeAccount,
  createEmployeeInvitation,
  revokeEmployeeInvitation,
  validateEmployeeInviteToken,
  setEmployeeActivationPassword,
  completeEmployeeActivationMfa,
  updateEmployeeAccess,
  beginEmployeeLogin,
  completeEmployeeLogin,
  buildWhatsAppInviteUrl,
  buildEmployeeActivationLink,
};
