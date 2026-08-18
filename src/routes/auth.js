/**
 * Auth routes — JWT (HMAC/HS256)
 * Primary: phone + PIN
 * Phone OTP proof: Firebase Phone Auth idToken (default) or Twilio code (fallback)
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
  enableCustomerProfile,
  createCustomerContextHandoff,
  exchangeContextHandoff,
} = require('../controllers/authController');
const {
  validateActivation,
  activationSetPassword,
  activationVerifyMfa,
} = require('../controllers/adminActivationController');
const {optionalAuth, verifyAuth} = require('../middleware/auth');
const {logRequest} = require('../middleware/logger');

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth routes active',
    otpProviderHint:
      'Firebase Phone Auth idToken (default) or AUTH_OTP_PROVIDER=twilio',
    routes: [
      'POST /api/auth/phone/lookup',
      'POST /api/auth/phone/register-pin',
      'POST /api/auth/phone/register-with-otp (idToken + pin)',
      'POST /api/auth/phone/login-pin',
      'POST /api/auth/phone/enable-customer-profile',
      'POST /api/auth/phone/reset-pin (idToken + pin)',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'POST /api/auth/mfa/enable',
      'POST /api/auth/mfa/verify',
      'GET /api/auth/activate?token=',
      'POST /api/auth/activate/password',
      'POST /api/auth/activate/mfa',
      'POST /api/auth/phone/send-otp',
      'POST /api/auth/phone/verify-otp (idToken)',
    ],
  });
});

router.post('/register', register);
router.post('/login', login);
router.post('/logout', optionalAuth, logRequest, logout);
router.post('/mfa/enable', enableMfa);
router.post('/mfa/verify', verifyMfa);

// Admin invitation activation (public — no JWT; token in body/query)
router.get('/activate', logRequest, validateActivation);
router.post('/activate/password', logRequest, activationSetPassword);
router.post('/activate/mfa', logRequest, activationVerifyMfa);

// Primary customer auth (PIN)
router.post('/phone/lookup', lookupPhone);
router.post('/phone/register-pin', registerPin);
router.post('/phone/register-with-otp', registerWithOtp);
router.post('/phone/login-pin', loginPin);
router.post('/phone/enable-customer-profile', enableCustomerProfile);
router.post('/phone/reset-pin', resetPin);

// Cross-app context handoff (Partner → Customer)
router.post(
  '/context/customer-handoff',
  verifyAuth,
  logRequest,
  createCustomerContextHandoff,
);
router.post('/context/exchange', logRequest, exchangeContextHandoff);

// OTP — Firebase Phone Auth (client) or Twilio (AUTH_OTP_PROVIDER=twilio)
router.post('/phone/send-otp', sendPhoneOtp);
router.post('/phone/verify-otp', verifyPhoneOtp);

module.exports = router;
