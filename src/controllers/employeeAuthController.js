/**
 * Employee portal auth — invite activation + login with TOTP.
 * Separate from Admin /api/auth/activate* and Admin MFA.
 */

const {
  validateEmployeeInviteToken,
  setEmployeeActivationPassword,
  completeEmployeeActivationMfa,
  beginEmployeeLogin,
  completeEmployeeLogin,
  publicEmployeeAccount,
} = require('../services/employeeInviteService');

function handleError(res, error) {
  const status = error.statusCode || 500;
  return res.status(status).json({
    success: false,
    error: error.code || (status >= 500 ? 'Server Error' : 'Bad Request'),
    message: error.message || 'Request failed',
  });
}

/** GET /api/auth/employee/activate?token= */
exports.validateEmployeeActivation = async (req, res) => {
  try {
    const token = String(req.query.token || req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invitation token is required',
      });
    }
    const employee = await validateEmployeeInviteToken(token);
    res.json({
      success: true,
      data: {
        email: employee.email,
        displayName: employee.fullName,
        employeeCode: employee.employeeCode,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/** POST /api/auth/employee/activate/password */
exports.employeeActivationSetPassword = async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = req.body?.password;
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invitation token is required',
      });
    }
    const data = await setEmployeeActivationPassword(token, password);
    res.json({
      success: true,
      data,
      message:
        'Scan the QR code with your authenticator app, then enter the 6-digit code.',
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/** POST /api/auth/employee/activate/mfa */
exports.employeeActivationVerifyMfa = async (req, res) => {
  try {
    const activationMfaToken = req.body?.activationMfaToken;
    const code = req.body?.code || req.body?.totpCode;
    const data = await completeEmployeeActivationMfa(activationMfaToken, code);
    res.json({success: true, data, message: data.message});
  } catch (error) {
    return handleError(res, error);
  }
};

/** POST /api/auth/employee/login — email + password → MFA challenge */
exports.employeeLogin = async (req, res) => {
  try {
    const data = await beginEmployeeLogin(req.body?.email, req.body?.password);
    res.json({
      success: true,
      data: {
        requiresMfa: true,
        ...data,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/** POST /api/auth/employee/login/mfa */
exports.employeeLoginMfa = async (req, res) => {
  try {
    const data = await completeEmployeeLogin(
      req.body?.mfaToken,
      req.body?.code || req.body?.totpCode,
    );
    res.json({success: true, data});
  } catch (error) {
    return handleError(res, error);
  }
};

exports.publicEmployeeAccount = publicEmployeeAccount;
