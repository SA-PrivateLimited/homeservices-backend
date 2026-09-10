/**
 * Authenticate Employee portal JWTs (role=employee, sub=employee:<id>).
 * Separate from Admin / Customer / Partner User auth.
 */

const {connectDB} = require('../config/database');
const Employee = require('../models/Employee');
const {verifyAccessToken} = require('../utils/jwtAuth');
const {parseEmployeeIdFromSub} = require('../utils/employeeAuthSubject');

/**
 * Verify Bearer JWT issued for an employee portal session.
 * Attaches req.employee (mongoose doc) and req.employeeId.
 */
async function requireEmployee(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Sign in required',
      });
    }

    const token = authHeader.split('Bearer ')[1].trim();
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Session expired. Please sign in again.',
      });
    }

    if (decoded.role !== 'employee') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Employee access required',
      });
    }

    const employeeId = parseEmployeeIdFromSub(decoded.sub);
    if (!employeeId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid employee session',
      });
    }

    await connectDB();
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Employee account not found',
      });
    }

    if (employee.accountStatus !== 'active' || !employee.totpEnabled) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'This employee account is not active',
      });
    }

    if (
      employee.status === 'former' ||
      employee.accountStatus === 'suspended' ||
      employee.accountStatus === 'revoked'
    ) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'This employee account cannot access the portal',
      });
    }

    req.employee = employee;
    req.employeeId = String(employee._id);
    req.accessTokenPayload = decoded;
    next();
  } catch (error) {
    console.error('requireEmployee error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired authentication token',
    });
  }
}

module.exports = {
  requireEmployee,
  parseEmployeeIdFromSub,
};
