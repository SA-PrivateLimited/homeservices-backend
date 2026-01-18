/**
 * Logger Middleware
 * Comprehensive request/response logging with sensitive data sanitization
 * Helps identify errors while protecting user privacy
 */

/**
 * Fields to hide/sanitize in logs
 */
const SENSITIVE_FIELDS = [
  'password',
  'fcmToken',
  'token',
  'authorization',
  'auth',
  'secret',
  'apiKey',
  'privateKey',
  'accessToken',
  'refreshToken',
  'creditCard',
  'cvv',
  'ssn',
  'pin',
  'taskPIN',
];

/**
 * Sanitize object by removing/hiding sensitive fields
 */
function sanitizeData(data, depth = 0) {
  if (depth > 5) return '[Max Depth Reached]'; // Prevent infinite recursion
  
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item, depth + 1));
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    // Check if field is sensitive
    const isSensitive = SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()));

    if (isSensitive) {
      // Hide sensitive values but show that the field exists
      if (value && typeof value === 'string') {
        const maskedLength = Math.min(value.length, 8);
        sanitized[key] = '*'.repeat(maskedLength) + (value.length > 8 ? '...' : '');
      } else {
        sanitized[key] = '[HIDDEN]';
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeData(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Format request for logging
 */
function formatRequest(req) {
  return {
    method: req.method,
    path: req.path,
    url: req.originalUrl || req.url,
    query: req.query || {},
    params: req.params || {},
    userId: req.user?.uid || 'Anonymous',
    userRole: req.user?.role || 'N/A',
    userAgent: req.get('user-agent')?.substring(0, 100) || 'Unknown',
    ip: req.ip || req.connection?.remoteAddress || 'Unknown',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for logging
 */
function formatResponse(res, statusCode, responseTime) {
  return {
    statusCode,
    statusMessage: res.statusMessage || 'N/A',
    responseTime: `${responseTime}ms`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format error for logging
 */
function formatError(error, req) {
  return {
    message: error.message || 'Unknown error',
    name: error.name || 'Error',
    stack: error.stack?.split('\n').slice(0, 5).join('\n') || 'No stack trace',
    code: error.code || 'N/A',
    request: formatRequest(req),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Request logger middleware
 * Logs incoming requests with sanitized data
 */
exports.logRequest = (req, res, next) => {
  const requestInfo = formatRequest(req);
  
  // Sanitize request body (excluding sensitive fields)
  const sanitizedBody = req.body ? sanitizeData({...req.body}) : null;

  console.log(`
┌─────────────────────────────────────────────────────────────┐
│ 📥 INCOMING REQUEST
├─────────────────────────────────────────────────────────────┤
│ Method:    ${requestInfo.method}
│ Path:      ${requestInfo.path}
│ User ID:   ${requestInfo.userId}
│ User Role: ${requestInfo.userRole}
│ IP:        ${requestInfo.ip}
│ Time:      ${requestInfo.timestamp}
${sanitizedBody ? `│ Body:      ${JSON.stringify(sanitizedBody).substring(0, 200)}${JSON.stringify(sanitizedBody).length > 200 ? '...' : ''}` : ''}
└─────────────────────────────────────────────────────────────┘`);

  // Store start time for response logging
  req._startTime = Date.now();
  
  next();
};

/**
 * Response logger middleware
 * Logs outgoing responses with status codes and timing
 */
exports.logResponse = (req, res, next) => {
  const originalSend = res.json;
  const startTime = req._startTime || Date.now();

  res.json = function(body) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Determine log level based on status code
    const isError = statusCode >= 400;
    const emoji = statusCode >= 500 ? '❌' : statusCode >= 400 ? '⚠️' : '✅';
    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';

    const responseInfo = formatResponse(res, statusCode, responseTime);
    const requestInfo = formatRequest(req);

    // Sanitize response body
    const sanitizedBody = body?.data ? sanitizeData({...body}) : body;

    console.log(`
┌─────────────────────────────────────────────────────────────┐
│ ${emoji} OUTGOING RESPONSE (${level})
├─────────────────────────────────────────────────────────────┤
│ Method:       ${requestInfo.method}
│ Path:         ${requestInfo.path}
│ Status:       ${responseInfo.statusCode} ${responseInfo.statusMessage}
│ Response Time: ${responseInfo.responseTime}
│ User ID:      ${requestInfo.userId}
│ User Role:    ${requestInfo.userRole}
│ Time:         ${responseInfo.timestamp}
${isError && sanitizedBody?.error ? `│ Error:        ${sanitizedBody.error}` : ''}
${isError && sanitizedBody?.message ? `│ Message:      ${sanitizedBody.message}` : ''}
${!isError && sanitizedBody?.data ? `│ Data Type:    ${Array.isArray(sanitizedBody.data) ? `Array[${sanitizedBody.data.length}]` : typeof sanitizedBody.data}` : ''}
└─────────────────────────────────────────────────────────────┘`);

    // If error, log full details for debugging
    if (isError) {
      console.error(`\n🔍 Error Details:\n${JSON.stringify(sanitizedBody, null, 2)}\n`);
    }

    return originalSend.call(this, body);
  };

  next();
};

/**
 * Error logger middleware
 * Comprehensive error logging with context
 */
exports.logError = (error, req, res, next) => {
  const errorInfo = formatError(error, req);
  const requestInfo = formatRequest(req);

  // Log detailed error information
  console.error(`
╔═════════════════════════════════════════════════════════════╗
║ ❌ ERROR DETECTED                                           ║
╠═════════════════════════════════════════════════════════════╣
║ Error Name:     ${errorInfo.name}
║ Error Message:  ${errorInfo.message}
║ Error Code:     ${errorInfo.code}
║ 
║ Request Details:
║   Method:       ${requestInfo.method}
║   Path:         ${requestInfo.path}
║   User ID:      ${requestInfo.userId}
║   User Role:    ${requestInfo.userRole}
║   IP:           ${requestInfo.ip}
║   Timestamp:    ${errorInfo.timestamp}
║ 
║ Stack Trace (first 5 lines):
║ ${errorInfo.stack.split('\n').map(line => `   ${line}`).join('\n║ ')}
╚═════════════════════════════════════════════════════════════╝`);

  // If request body exists, log sanitized version for debugging
  if (req.body) {
    const sanitizedBody = sanitizeData({...req.body});
    console.error(`\n📋 Request Body (sanitized):\n${JSON.stringify(sanitizedBody, null, 2)}\n`);
  }

  // If request params exist, log them
  if (Object.keys(req.params || {}).length > 0) {
    console.error(`📌 Request Params: ${JSON.stringify(req.params)}\n`);
  }

  // If request query exists, log it
  if (Object.keys(req.query || {}).length > 0) {
    console.error(`🔍 Request Query: ${JSON.stringify(req.query)}\n`);
  }

  // Continue to error handler
  next(error);
};

/**
 * Database operation logger
 * Logs database queries and operations (useful for debugging)
 */
exports.logDatabaseOperation = (operation, collection, filter = {}, result = null) => {
  const sanitizedFilter = sanitizeData(filter);
  const sanitizedResult = result ? sanitizeData(result) : null;

  console.log(`
┌─────────────────────────────────────────────────────────────┐
│ 💾 DATABASE OPERATION
├─────────────────────────────────────────────────────────────┤
│ Operation:  ${operation}
│ Collection: ${collection}
│ Filter:     ${JSON.stringify(sanitizedFilter).substring(0, 200)}
${sanitizedResult ? `│ Result:     ${JSON.stringify(sanitizedResult).substring(0, 200)}` : ''}
│ Time:       ${new Date().toISOString()}
└─────────────────────────────────────────────────────────────┘`);
};

/**
 * Performance logger
 * Logs slow operations (> threshold ms)
 */
exports.logPerformance = (operation, duration, threshold = 1000) => {
  if (duration > threshold) {
    console.warn(`
⚠️  SLOW OPERATION DETECTED
   Operation: ${operation}
   Duration:  ${duration}ms (threshold: ${threshold}ms)
   Time:      ${new Date().toISOString()}`);
  }
};

module.exports = {
  logRequest: exports.logRequest,
  logResponse: exports.logResponse,
  logError: exports.logError,
  logDatabaseOperation: exports.logDatabaseOperation,
  logPerformance: exports.logPerformance,
  sanitizeData, // Export for use in controllers if needed
};
