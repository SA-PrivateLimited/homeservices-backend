/**
 * Auth routes — JWT (HMAC/HS256)
 * Primary: phone + PIN (no Firebase / no SMS required)
 * Optional legacy: password login, Twilio OTP (if configured)
 */

const express = require('express');
const router = express.Router();
const {
  register,
  login,
  logout,
  enableMfa,
  verifyMfa,
  sendPhoneOtp,
  verifyPhoneOtp,
  lookupPhone,
  registerPin,
  loginPin,
  resetPin,
  registerWithOtp,
} = require('../controllers/authController');
const {optionalAuth} = require('../middleware/auth');
const {logRequest} = require('../middleware/logger');

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth routes active',
    routes: [
      'POST /api/auth/phone/lookup',
      'POST /api/auth/phone/register-pin',
      'POST /api/auth/phone/register-with-otp',
      'POST /api/auth/phone/login-pin',
      'POST /api/auth/phone/reset-pin',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'POST /api/auth/mfa/enable',
      'POST /api/auth/mfa/verify',
      'POST /api/auth/phone/send-otp',
      'POST /api/auth/phone/verify-otp',
    ],
  });
});

router.post('/register', register);
router.post('/login', login);
router.post('/logout', optionalAuth, logRequest, logout);
router.post('/mfa/enable', enableMfa);
router.post('/mfa/verify', verifyMfa);

// Primary customer auth (PIN)
router.post('/phone/lookup', lookupPhone);
router.post('/phone/register-pin', registerPin);
router.post('/phone/register-with-otp', registerWithOtp);
router.post('/phone/login-pin', loginPin);
router.post('/phone/reset-pin', resetPin);

// OTP (Twilio or TWILIO_DEV_MODE) — signup + forgot-PIN
router.post('/phone/send-otp', sendPhoneOtp);
router.post('/phone/verify-otp', verifyPhoneOtp);

module.exports = router;
