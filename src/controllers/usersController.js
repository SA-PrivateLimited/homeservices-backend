/**
 * Users Controller
 * Handles all user-related operations
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const {encryptToken, decryptToken} = require('../utils/tokenEncryption');
const {syncPhoneFields} = require('../utils/phone');
const {verifySuperAdminToken} = require('../utils/jwtAuth');
const {
  createPendingAdmin,
  resolveAdminStatus,
} = require('../services/adminActivationService');
const {
  resolveAdminPermissions,
  PERMISSIONS,
  hasPermission,
} = require('../constants/permissions');
const {isSuperAdminElevated} = require('../middleware/requirePermission');
const ADMIN_LIST_SORT = require('../utils/adminListSort');

const PASSWORD_SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const PIN_SALT_ROUNDS = 12;

function assertSuperAdminElevation(req) {
  const token = (
    req.headers['x-super-admin-token'] ||
    req.body?.superAdminToken ||
    ''
  )
    .toString()
    .trim();
  if (!token) {
    const err = new Error(
      'Act as Super Admin and enter the 4-digit key to manage admin accounts',
    );
    err.statusCode = 403;
    throw err;
  }
  let decoded;
  try {
    decoded = verifySuperAdminToken(token);
  } catch (e) {
    const err = new Error(
      e.message || 'Invalid or expired Super Admin session',
    );
    err.statusCode = 401;
    throw err;
  }
  if (req.user?.uid && decoded.sub !== req.user.uid) {
    const err = new Error(
      'Super Admin session does not match the signed-in admin',
    );
    err.statusCode = 403;
    throw err;
  }
  return decoded;
}

function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

function pinHmacKey(pin) {
  const secret = process.env.JWT_SECRET || process.env.HMAC_JWT_SECRET || 'pin';
  return crypto.createHmac('sha256', secret).update(`pin:${pin}`).digest('hex');
}

function revealLoginPin(encryptedPin) {
  if (!encryptedPin) return null;
  try {
    return decryptToken(encryptedPin);
  } catch {
    return null;
  }
}

function withAdminPinFields(userDoc, isAdmin) {
  const raw =
    typeof userDoc.toObject === 'function' ? userDoc.toObject() : {...userDoc};
  delete raw.passwordHash;
  delete raw.pinHash;
  delete raw.pinKey;
  delete raw.encryptedPin;
  delete raw.encryptedAuthToken;
  delete raw.fcmToken;
  delete raw.totpSecretEncrypted;
  delete raw.activationTokenHash;

  if (isAdmin) {
    raw.hasPin = Boolean(userDoc.pinHash || userDoc.encryptedPin || raw.hasPin);
    // Never bulk-return plaintext PIN — use GET /api/users/:id/pin to reveal
  }

  raw.totpEnabled = Boolean(userDoc.totpEnabled);
  if ((userDoc.role || '').toLowerCase() === 'admin') {
    raw.adminStatus = resolveAdminStatus(userDoc);
    raw.permissions = resolveAdminPermissions(userDoc);
    raw.hasPendingInvitation =
      raw.adminStatus === 'PENDING' &&
      Boolean(userDoc.activationExpiresAt) &&
      new Date(userDoc.activationExpiresAt).getTime() > Date.now();
  }

  return raw;
}

function requireSuperAdminForAdminTarget(req, targetRole) {
  if ((targetRole || '').toLowerCase() !== 'admin') return null;
  try {
    assertSuperAdminElevation(req);
    return null;
  } catch (e) {
    return e;
  }
}

/**
 * Get current user profile
 */
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.uid);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Remove sensitive fields
    const userData = user.toObject();
    delete userData.fcmToken;
    delete userData.passwordHash;
    delete userData.totpSecretEncrypted;
    delete userData.activationTokenHash;

    const jwtRole = req.accessTokenPayload?.role;
    if (
      jwtRole === 'customer' &&
      user.role === 'provider' &&
      user.customerProfileEnabled
    ) {
      userData.role = 'customer';
    }

    userData.id = userData._id;
    if (userData.role === 'admin') {
      userData.permissions = resolveAdminPermissions(user);
    }

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user by ID
 */
exports.getUserById = async (req, res, next) => {
  try {
    const {userId} = req.params;
    const currentUser = await User.findById(req.user.uid);
    const isAdmin = currentUser?.role === 'admin';
    const isOwnProfile = userId === req.user.uid;

    const user = await User.findById(userId).select(
      isAdmin ? '+encryptedPin +pinHash' : undefined,
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const userData = withAdminPinFields(user, isAdmin);

    if (!isAdmin && !isOwnProfile) {
      delete userData.email;
      delete userData.phoneNumber;
      delete userData.phone;
      delete userData.loginPin;
      delete userData.hasPin;
    }

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update current user profile
 */
exports.updateMe = async (req, res, next) => {
  try {
    const updateData = {
      ...req.body,
      updatedAt: new Date(),
    };

    // Prevent role changes
    delete updateData.role;

    if (updateData.phone !== undefined || updateData.phoneNumber !== undefined) {
      const synced = syncPhoneFields(
        updateData.phoneNumber ?? updateData.phone,
      );
      updateData.phone = synced.phone;
      updateData.phoneNumber = synced.phoneNumber;
    }

    const user = await User.findByIdAndUpdate(
      req.user.uid,
      {$set: updateData},
      {new: true, runValidators: false},
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const userData = user.toObject();
    delete userData.fcmToken;

    res.json({
      success: true,
      data: userData,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update FCM token (customer / provider / admin).
 * Also mirrors token onto Provider doc and subscribes to FCM topics.
 */
exports.updateFcmToken = async (req, res, next) => {
  try {
    const {userId} = req.params;
    const {fcmToken} = req.body;

    if (userId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only update your own FCM token',
      });
    }

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'FCM token is required',
      });
    }

    const {registerDeviceToken} = require('../services/notificationService');
    const result = await registerDeviceToken(userId, fcmToken, {
      role: req.userDoc?.role || req.user?.role,
    });

    res.json({
      success: true,
      message: 'FCM token updated successfully',
      data: {
        topics: result.topics,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.statusCode === 404 ? 'Not Found' : 'Bad Request',
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Create or update current user (upsert)
 * Used during signup/login to ensure user exists in database
 */
exports.createOrUpdateMe = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const {name, email, phone, fcmToken, phoneVerified, location, role} = req.body;

    // Build user data
    const userData = {
      _id: userId,
      updatedAt: new Date(),
    };

    // Only set fields that are provided
    if (name !== undefined) userData.name = name;
    if (email !== undefined) userData.email = email;
    if (phone !== undefined || req.body.phoneNumber !== undefined) {
      const synced = syncPhoneFields(req.body.phoneNumber ?? phone);
      userData.phone = synced.phone;
      userData.phoneNumber = synced.phoneNumber;
    }
    if (fcmToken !== undefined) userData.fcmToken = fcmToken;
    if (phoneVerified !== undefined) userData.phoneVerified = phoneVerified;
    if (location !== undefined) userData.location = location;

    // Check if user exists
    const existingUser = await User.findById(userId);

    // Allow role to be set on creation, or updated to 'provider' if currently 'customer'
    if (role) {
      if (!existingUser) {
        // New user - allow any role
        userData.role = role;
      } else if (existingUser.role === 'customer' && role === 'provider') {
        // Allow upgrade from customer to provider
        userData.role = role;
      }
      // Don't allow downgrade or change from provider/admin
    }

    // Upsert: create if not exists, update if exists
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: userData,
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: false,
      },
    );

    const responseData = user.toObject();
    delete responseData.fcmToken;

    res.status(existingUser ? 200 : 201).json({
      success: true,
      data: responseData,
      message: existingUser ? 'User updated successfully' : 'User created successfully',
      created: !existingUser,
    });
  } catch (error) {
    next(error);
  }
};

function hasLocationFields(body) {
  if (!body || typeof body !== 'object') return false;
  return (
    body.address !== undefined ||
    body.landmark !== undefined ||
    body.city !== undefined ||
    body.state !== undefined ||
    body.district !== undefined ||
    body.stateId !== undefined ||
    body.districtId !== undefined ||
    body.pincode !== undefined ||
    body.location !== undefined ||
    body.homeAddress !== undefined
  );
}

function applyLocationUpdate(body, updateData, existing) {
  if (!hasLocationFields(body)) return;
  const address = (body.address || body.location?.address || '').trim();
  const landmark = (
    body.landmark ||
    body.location?.landmark ||
    body.homeAddress?.landmark ||
    ''
  ).trim();
  const city = (body.city || body.location?.city || '').trim();
  const state = (body.state || body.location?.state || '').trim();
  const district = (body.district || body.location?.district || '').trim();
  const stateId = (body.stateId || body.location?.stateId || '').trim();
  const districtId = (body.districtId || body.location?.districtId || '').trim();
  const pincode = String(body.pincode || body.location?.pincode || '').trim();

  updateData.location = {
    address: address || undefined,
    city: city || district || undefined,
    state: state || undefined,
    district: district || undefined,
    stateId: stateId || undefined,
    districtId: districtId || undefined,
    pincode: pincode || undefined,
    country: 'IN',
  };

  const role = updateData.role || existing.role;
  if (role === 'customer') {
    updateData.homeAddress = {
      address: address || undefined,
      landmark: landmark || undefined,
      city: city || district || undefined,
      district: district || undefined,
      state: state || undefined,
      stateId: stateId || undefined,
      districtId: districtId || undefined,
      pincode: pincode || undefined,
      country: 'IN',
      isDefault: true,
    };
  }
}

/**
 * Update user by ID (admin only) — used for role changes, etc.
 */
exports.updateUserByAdmin = async (req, res, next) => {
  try {
    const {userId} = req.params;
    const allowedRoles = ['customer', 'provider', 'admin'];
    const updateData = {
      updatedAt: new Date(),
    };

    if (req.body.role !== undefined) {
      if (!allowedRoles.includes(req.body.role)) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `role must be one of: ${allowedRoles.join(', ')}`,
        });
      }
      updateData.role = req.body.role;
    }

    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.displayName !== undefined) updateData.displayName = req.body.displayName;
    if (req.body.email !== undefined) updateData.email = req.body.email;
    if (req.body.phoneVerified !== undefined) {
      updateData.phoneVerified = Boolean(req.body.phoneVerified);
    }
    if (req.body.phone !== undefined || req.body.phoneNumber !== undefined) {
      const synced = syncPhoneFields(
        req.body.phoneNumber ?? req.body.phone,
      );
      updateData.phone = synced.phone;
      updateData.phoneNumber = synced.phoneNumber;
    }

    // Never allow password hash updates through this route
    delete updateData.passwordHash;

    if (Object.keys(updateData).length <= 1 && !hasLocationFields(req.body)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'No valid fields to update',
      });
    }

    const existing = await User.findById(userId).lean();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    applyLocationUpdate(req.body, updateData, existing);

    const nextRole = updateData.role;
    const touchesAdmin =
      nextRole === 'admin' ||
      existing.role === 'admin' ||
      (nextRole && nextRole !== existing.role && (nextRole === 'admin' || existing.role === 'admin'));

    if (touchesAdmin && nextRole !== undefined) {
      try {
        assertSuperAdminElevation(req);
      } catch (e) {
        return res.status(e.statusCode || 403).json({
          success: false,
          error: e.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
          message: e.message,
        });
      }
      if (nextRole === 'admin') {
        updateData.adminApprovalStatus = 'approved';
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {$set: updateData},
      {new: true, runValidators: false},
    );

    const userData = user.toObject();
    delete userData.fcmToken;
    delete userData.passwordHash;
    delete userData.totpSecretEncrypted;

    res.json({
      success: true,
      data: userData,
      message: 'User updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Set / reset a user's password (admin only).
 * Passwords are bcrypt-hashed — plaintext can never be retrieved.
 */
exports.setUserPasswordByAdmin = async (req, res, next) => {
  try {
    const {userId} = req.params;
    const password = req.body.password;

    if (typeof password !== 'string' || !password) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'password is required',
      });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const elevationError = requireSuperAdminForAdminTarget(req, user.role);
    if (elevationError) {
      return res.status(elevationError.statusCode || 403).json({
        success: false,
        error:
          elevationError.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
        message: elevationError.message,
      });
    }

    user.passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      data: {_id: user._id, email: user.email},
      message: 'Password updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all users (admin only)
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const {
      role,
      roles,
      limit = 50,
      offset = 0,
      includeInactive,
      state,
      district,
      stateId,
      districtId,
    } = req.query;

    // RBAC: list scope by role filter (Super Admin bypasses)
    if (!isSuperAdminElevated(req)) {
      const perms = Array.isArray(req.user?.permissions)
        ? req.user.permissions
        : resolveAdminPermissions(req.userDoc);
      const roleFilter = String(role || '')
        .trim()
        .toLowerCase();
      const needed =
        roleFilter === 'admin'
          ? PERMISSIONS.ADMINS_VIEW
          : roleFilter === 'customer'
            ? PERMISSIONS.CUSTOMERS_VIEW
            : roleFilter === 'provider'
              ? PERMISSIONS.PROVIDERS_VIEW
              : null;
      if (needed && !hasPermission(perms, needed)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Missing permission: ${needed}`,
          required: [needed],
        });
      }
    }

    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const query = {};
    if (roles) {
      const list = String(roles)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (list.length) query.role = {$in: list};
    } else if (role) {
      query.role = String(role).toLowerCase();
    }

    if (String(includeInactive) !== 'true') {
      query.isActive = {$ne: false};
    }

    const andClauses = [];
    const escapeRegex = (s) =>
      String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (stateId || state) {
      const stateParts = [];
      if (stateId) {
        const sid = String(stateId).trim();
        stateParts.push({'location.stateId': sid});
        stateParts.push({'homeAddress.stateId': sid});
      }
      if (state) {
        const re = new RegExp(`^${escapeRegex(String(state).trim())}$`, 'i');
        stateParts.push({'location.state': re});
        stateParts.push({'homeAddress.state': re});
      }
      andClauses.push({$or: stateParts});
    }

    if (districtId || district) {
      const districtParts = [];
      if (districtId) {
        const did = String(districtId).trim();
        districtParts.push({'location.districtId': did});
        districtParts.push({'homeAddress.districtId': did});
      }
      if (district) {
        const d = String(district).trim();
        const re = new RegExp(`^${escapeRegex(d)}$`, 'i');
        districtParts.push({'location.district': re});
        districtParts.push({'homeAddress.district': re});
        districtParts.push({'location.city': re});
        districtParts.push({'homeAddress.city': re});
      }
      andClauses.push({$or: districtParts});
    }

    if (andClauses.length === 1) {
      Object.assign(query, andClauses[0]);
    } else if (andClauses.length > 1) {
      query.$and = andClauses;
    }

    const roleFilter = query.role;
    const onlyAdmins =
      roleFilter === 'admin' ||
      (roleFilter &&
        roleFilter.$in &&
        roleFilter.$in.length === 1 &&
        roleFilter.$in[0] === 'admin');
    if (onlyAdmins) {
      try {
        assertSuperAdminElevation(req);
      } catch (e) {
        return res.status(e.statusCode || 403).json({
          success: false,
          error: e.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
          message: e.message,
        });
      }
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('+encryptedPin +pinHash')
        .sort(ADMIN_LIST_SORT)
        .limit(lim)
        .skip(off)
        .lean(),
      User.countDocuments(query),
    ]);

    const sanitizedUsers = users.map((user) => withAdminPinFields(user, true));

    res.json({
      success: true,
      data: sanitizedUsers,
      count: sanitizedUsers.length,
      total,
      limit: lim,
      offset: off,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:userId/pin
 * One-shot reveal of recoverable login PIN (admin only).
 * Admin-role targets require Super Admin elevation.
 */
exports.revealUserPinByAdmin = async (req, res, next) => {
  try {
    const {userId} = req.params;
    const user = await User.findById(userId).select('+encryptedPin +pinHash');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const elevationError = requireSuperAdminForAdminTarget(req, user.role);
    if (elevationError) {
      return res.status(elevationError.statusCode || 403).json({
        success: false,
        error:
          elevationError.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
        message: elevationError.message,
      });
    }

    const hasPin = Boolean(user.pinHash || user.encryptedPin);
    const loginPin = revealLoginPin(user.encryptedPin);

    res.json({
      success: true,
      data: {
        _id: user._id,
        hasPin,
        loginPin,
        recoverable: Boolean(loginPin),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Set / reset a user's login PIN (admin only).
 * Body: { pin? } — if omitted, a unique 6-digit PIN is generated.
 * Returns plaintext loginPin so admin can share it with the user.
 */
exports.setUserPinByAdmin = async (req, res, next) => {
  try {
    const {userId} = req.params;
    let pin =
      req.body.pin != null ? String(req.body.pin).trim() : '';

    const user = await User.findById(userId).select('+pinHash +pinKey +encryptedPin');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if ((user.role || '').toLowerCase() === 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message:
          'Admin accounts use authenticator MFA, not a login PIN. Reset MFA instead.',
      });
    }

    const elevationError = requireSuperAdminForAdminTarget(req, user.role);
    if (elevationError) {
      return res.status(elevationError.statusCode || 403).json({
        success: false,
        error:
          elevationError.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
        message: elevationError.message,
      });
    }

    if (!pin) {
      for (let i = 0; i < 40; i++) {
        const candidate = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const key = pinHmacKey(candidate);
        const clash = await User.findOne({
          pinKey: key,
          _id: {$ne: userId},
        })
          .select('_id')
          .lean();
        if (!clash) {
          pin = candidate;
          break;
        }
      }
      if (!pin) {
        return res.status(503).json({
          success: false,
          error: 'Service Unavailable',
          message: 'Could not allocate a unique PIN',
        });
      }
    }

    if (!isValidPin(pin)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'PIN must be exactly 6 digits',
      });
    }

    const pinKey = pinHmacKey(pin);
    const clash = await User.findOne({
      pinKey,
      _id: {$ne: userId},
    })
      .select('_id')
      .lean();
    if (clash) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'This PIN is already in use. Choose a different 6-digit PIN.',
      });
    }

    user.pinHash = await bcrypt.hash(pin, PIN_SALT_ROUNDS);
    user.pinKey = pinKey;
    try {
      user.encryptedPin = encryptToken(pin);
    } catch (e) {
      return res.status(500).json({
        success: false,
        error: 'Server Error',
        message:
          e.message ||
          'TOKEN_ENCRYPTION_KEY is required to store recoverable PINs',
      });
    }
    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      data: {
        _id: user._id,
        loginPin: pin,
        hasPin: true,
        role: user.role,
        phone: user.phone || user.phoneNumber,
      },
      message: 'Login PIN updated',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Super Admin: reset an admin's TOTP MFA so they re-enroll on next login.
 * Clears totpSecretEncrypted and sets totpEnabled=false.
 */
exports.resetUserMfaByAdmin = async (req, res, next) => {
  try {
    const {userId} = req.params;
    const user = await User.findById(userId).select('+totpSecretEncrypted');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if ((user.role || '').toLowerCase() !== 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'MFA reset is only available for admin accounts',
      });
    }

    try {
      assertSuperAdminElevation(req);
    } catch (e) {
      return res.status(e.statusCode || 403).json({
        success: false,
        error: e.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
        message: e.message,
      });
    }

    user.totpEnabled = false;
    user.totpSecretEncrypted = null;
    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      data: {
        _id: user._id,
        totpEnabled: false,
        email: user.email,
      },
      message: 'MFA reset. Admin must set up authenticator again on next login.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin create user (customer / provider / admin).
 * Body: { name?, email?, phone?, role, password? }
 */
exports.createUserByAdmin = async (req, res, next) => {
  try {
    const allowedRoles = ['customer', 'provider', 'admin'];
    const role = (req.body.role || 'customer').toLowerCase();
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `role must be one of: ${allowedRoles.join(', ')}`,
      });
    }

    if (role === 'admin') {
      try {
        assertSuperAdminElevation(req);
      } catch (e) {
        return res.status(e.statusCode || 403).json({
          success: false,
          error: e.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
          message: e.message,
        });
      }
    }

    const email = (req.body.email || '').trim().toLowerCase();
    const synced = syncPhoneFields(req.body.phoneNumber ?? req.body.phone);
    const name = (req.body.name || req.body.displayName || '').trim();
    const password = req.body.password;

    if (role === 'customer' || role === 'provider') {
      if (!synced.phone) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'phone is required for customer and provider accounts',
        });
      }
      const {localTenDigits} = require('../utils/phone');
      if (localTenDigits(synced.phone).length !== 10) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Enter a valid 10-digit Indian mobile number',
        });
      }
    } else if (!email && !synced.phone) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'email or phone is required',
      });
    }

    if (email) {
      const existingEmail = await User.findOne({email});
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'Conflict',
          message: 'A user with this email already exists',
        });
      }
    }

    if (synced.phone) {
      const existingPhone = await User.findOne({
        $or: [{phone: synced.phone}, {phoneNumber: synced.phoneNumber}],
      });
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          error: 'Conflict',
          message: 'A user with this phone already exists',
        });
      }
    }

    if (password !== undefined && password !== null && password !== '') {
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        });
      }
    }

    if (role === 'admin' && !password) {
      const result = await createPendingAdmin({
        name,
        email,
        permissions: req.body.permissions,
      });
      return res.status(201).json({
        success: true,
        data: {
          ...result.admin,
          activationLink: result.activationLink,
          activationExpiresAt: result.activationExpiresAt,
          qrCodeDataUrl: result.qrCodeDataUrl,
        },
        message:
          'Admin created as PENDING. Share the activation link manually (no email sent).',
      });
    }

    const _id = crypto.randomUUID();
    const address = (req.body.address || req.body.location?.address || '').trim();
    const city = (req.body.city || req.body.location?.city || '').trim();
    const state = (req.body.state || req.body.location?.state || '').trim();
    const district = (
      req.body.district ||
      req.body.location?.district ||
      ''
    ).trim();
    const stateId = (
      req.body.stateId ||
      req.body.location?.stateId ||
      ''
    ).trim();
    const districtId = (
      req.body.districtId ||
      req.body.location?.districtId ||
      ''
    ).trim();
    const pincode = String(
      req.body.pincode || req.body.location?.pincode || '',
    ).trim();
    const landmark = (
      req.body.landmark ||
      req.body.location?.landmark ||
      req.body.homeAddress?.landmark ||
      ''
    ).trim();
    const location =
      address || city || state || district || stateId || districtId || pincode
        ? {
            address: address || undefined,
            city: city || district || undefined,
            state: state || undefined,
            district: district || undefined,
            stateId: stateId || undefined,
            districtId: districtId || undefined,
            pincode: pincode || undefined,
            country: 'IN',
          }
        : undefined;
    const homeAddress =
      role === 'customer' &&
      (address ||
        landmark ||
        city ||
        state ||
        district ||
        stateId ||
        districtId ||
        pincode)
        ? {
            address: address || undefined,
            landmark: landmark || undefined,
            city: city || district || undefined,
            district: district || undefined,
            state: state || undefined,
            stateId: stateId || undefined,
            districtId: districtId || undefined,
            pincode: pincode || undefined,
            country: 'IN',
            isDefault: true,
          }
        : undefined;

    const experience =
      req.body.experience != null && req.body.experience !== ''
        ? Number(req.body.experience)
        : undefined;
    const rating =
      req.body.rating != null && req.body.rating !== ''
        ? Number(req.body.rating)
        : undefined;
    const serviceType = (req.body.serviceType || '').trim();
    const serviceCategories = Array.isArray(req.body.serviceCategories)
      ? req.body.serviceCategories.filter(Boolean)
      : serviceType
        ? [serviceType]
        : [];

    const doc = {
      _id,
      role,
      name: name || undefined,
      displayName: name || undefined,
      email: email || undefined,
      phone: synced.phone || undefined,
      phoneNumber: synced.phoneNumber || undefined,
      location,
      homeAddress,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (role === 'admin') {
      doc.adminApprovalStatus = 'approved';
      doc.adminStatus = 'ACTIVE';
      if (Array.isArray(req.body.permissions)) {
        doc.permissions = req.body.permissions.filter(Boolean);
      }
    }

    if (password) {
      doc.passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    }

    const user = await User.create(doc);
    const userData = withAdminPinFields(user, true);

    if (role === 'provider') {
      try {
        const Provider = require('../models/Provider');
        const existing = await Provider.findById(_id);
        if (!existing) {
          await Provider.create({
            _id,
            name: name || 'Provider',
            displayName: name || 'Provider',
            phoneNumber: synced.phoneNumber || synced.phone || undefined,
            serviceType: serviceType || undefined,
            specialization: serviceType || undefined,
            serviceCategories,
            experience: Number.isFinite(experience) ? experience : undefined,
            rating: Number.isFinite(rating) ? rating : 0,
            location,
            approvalStatus:
              (req.body.approvalStatus || '').toLowerCase() === 'pending'
                ? 'pending'
                : 'approved',
            verified:
              (req.body.approvalStatus || '').toLowerCase() === 'pending'
                ? false
                : true,
            approvedAt:
              (req.body.approvalStatus || '').toLowerCase() === 'pending'
                ? undefined
                : new Date(),
            approvedBy:
              (req.body.approvalStatus || '').toLowerCase() === 'pending'
                ? undefined
                : req.user?.uid || 'admin',
            isOnline: false,
            isAvailable: true,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      } catch (providerErr) {
        console.warn('Provider profile create failed:', providerErr.message);
      }
    }

    res.status(201).json({
      success: true,
      data: userData,
      message: 'User created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin soft-deactivate user (blocks login). Body: { reason }
 */
exports.deactivateUserByAdmin = async (req, res, next) => {
  try {
    const {userId} = req.params;
    const reason = (req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Deactivation reason is required',
      });
    }
    if (req.user && req.user.uid === userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'You cannot deactivate your own account',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (user.role === 'admin') {
      try {
        assertSuperAdminElevation(req);
      } catch (e) {
        return res.status(e.statusCode || 403).json({
          success: false,
          error: e.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
          message: e.message,
        });
      }
    }

    user.isActive = false;
    user.deactivatedAt = new Date();
    user.deactivationReason = reason;
    user.deactivatedBy = req.user?.uid || '';
    if (user.role === 'admin') {
      user.adminStatus = 'DISABLED';
    }
    user.updatedAt = new Date();
    await user.save();

    if (user.role === 'provider') {
      try {
        const Provider = require('../models/Provider');
        await Provider.findByIdAndUpdate(userId, {
          $set: {
            isActive: false,
            deactivatedAt: user.deactivatedAt,
            deactivationReason: reason,
            deactivatedBy: user.deactivatedBy,
            updatedAt: new Date(),
          },
        });
      } catch (_) {
        /* optional */
      }
    }

    res.json({
      success: true,
      data: withAdminPinFields(user, true),
      message: 'Account deactivated',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin restore soft-deactivated user
 */
exports.restoreUserByAdmin = async (req, res, next) => {
  try {
    const {userId} = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (user.role === 'admin') {
      try {
        assertSuperAdminElevation(req);
      } catch (e) {
        return res.status(e.statusCode || 403).json({
          success: false,
          error: e.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
          message: e.message,
        });
      }
    }

    user.isActive = true;
    user.deactivatedAt = undefined;
    user.deactivationReason = undefined;
    user.deactivatedBy = undefined;
    if (user.role === 'admin') {
      if (user.adminStatus === 'PENDING') {
        // Keep PENDING — they still need activation link
      } else {
        user.adminStatus = 'ACTIVE';
        user.adminApprovalStatus = 'approved';
      }
    }
    user.updatedAt = new Date();
    await user.save();

    if (user.role === 'provider') {
      try {
        const Provider = require('../models/Provider');
        await Provider.findByIdAndUpdate(userId, {
          $set: {
            isActive: true,
            updatedAt: new Date(),
          },
          $unset: {
            deactivatedAt: 1,
            deactivationReason: 1,
            deactivatedBy: 1,
          },
        });
      } catch (_) {
        /* optional */
      }
    }

    res.json({
      success: true,
      data: withAdminPinFields(user, true),
      message: 'Account restored',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin delete user. Cannot delete self.
 * Deleting an admin requires Super Admin elevation.
 */
exports.deleteUserByAdmin = async (req, res, next) => {
  try {
    const {userId} = req.params;
    if (req.user && req.user.uid === userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'You cannot delete your own account',
      });
    }

    const existing = await User.findById(userId).lean();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (existing.role === 'admin') {
      try {
        assertSuperAdminElevation(req);
      } catch (e) {
        return res.status(e.statusCode || 403).json({
          success: false,
          error: e.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
          message: e.message,
        });
      }
    }

    await User.findByIdAndDelete(userId);

    // Providers share the same _id on the Provider collection — remove that too
    if (existing.role === 'provider') {
      try {
        const Provider = require('../models/Provider');
        await Provider.findByIdAndDelete(userId);
      } catch (providerErr) {
        console.warn(
          '⚠️ Provider profile cleanup after user delete:',
          providerErr.message,
        );
      }
    }

    res.json({
      success: true,
      data: {_id: userId},
      message: 'User deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
