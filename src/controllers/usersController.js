/**
 * Users Controller
 * Handles all user-related operations
 */

const User = require('../models/User');

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
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Check permissions
    const currentUser = await User.findById(req.user.uid);
    const isAdmin = currentUser?.role === 'admin';
    const isOwnProfile = userId === req.user.uid;

    // Prepare response data
    const userData = user.toObject();

    // Hide sensitive fields unless admin or own profile
    if (!isAdmin && !isOwnProfile) {
      delete userData.fcmToken;
      delete userData.email;
      delete userData.phoneNumber;
    } else if (!isAdmin) {
      delete userData.fcmToken;
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
 * Update FCM token
 */
exports.updateFcmToken = async (req, res, next) => {
  try {
    const {userId} = req.params;
    const {fcmToken} = req.body;

    // Users can only update their own FCM token
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

    await User.findByIdAndUpdate(userId, {
      $set: {
        fcmToken,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: 'FCM token updated successfully',
    });
  } catch (error) {
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
    if (phone !== undefined) {
      userData.phone = phone;
      userData.phoneNumber = phone; // Also set phoneNumber for backward compatibility
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

/**
 * Get all users (admin only)
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const {role, limit = 50, offset = 0} = req.query;

    const query = role ? {role} : {};
    const users = await User.find(query)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    // Remove FCM tokens
    const sanitizedUsers = users.map(({fcmToken, ...user}) => user);

    res.json({
      success: true,
      data: sanitizedUsers,
      count: sanitizedUsers.length,
    });
  } catch (error) {
    next(error);
  }
};
