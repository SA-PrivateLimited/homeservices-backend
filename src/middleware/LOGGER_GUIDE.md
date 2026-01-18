# Logger Middleware Guide

## Overview

The logger middleware provides comprehensive, explanatory logging while protecting sensitive user data. All sensitive fields are automatically sanitized before logging.

## Features

### ✅ Sensitive Data Protection

The following fields are automatically sanitized in logs:
- Passwords
- FCM tokens
- Authentication tokens
- API keys
- Credit card information
- PINs (including taskPIN)
- And more...

**Example:**
```
Before: { password: "secret123", fcmToken: "abc123..." }
After:  { password: "********", fcmToken: "********..." }
```

### ✅ Comprehensive Request Logging

Every request is logged with:
- HTTP method and path
- User ID and role
- IP address
- Timestamp
- Sanitized request body

**Example Output:**
```
┌─────────────────────────────────────────────────────────────┐
│ 📥 INCOMING REQUEST
├─────────────────────────────────────────────────────────────┤
│ Method:    POST
│ Path:      /api/customer/jobCards/abc123/cancel
│ User ID:   user_xyz123
│ User Role: customer
│ IP:        192.168.1.1
│ Time:      2024-01-18T10:30:00.000Z
│ Body:      {"cancellationReason":"Change of plans"}
└─────────────────────────────────────────────────────────────┘
```

### ✅ Response Logging with Status Codes

Every response is logged with:
- Status code and message
- Response time
- Error details (if error occurred)
- Success indicators

**Example Output:**
```
┌─────────────────────────────────────────────────────────────┐
│ ✅ OUTGOING RESPONSE (INFO)
├─────────────────────────────────────────────────────────────┤
│ Method:       POST
│ Path:         /api/customer/jobCards/abc123/cancel
│ Status:       200 OK
│ Response Time: 145ms
│ User ID:      user_xyz123
│ User Role:    customer
│ Time:         2024-01-18T10:30:00.145Z
└─────────────────────────────────────────────────────────────┘
```

### ✅ Detailed Error Logging

Errors are logged with full context:
- Error name and message
- Error code
- Stack trace (first 5 lines)
- Request details
- Sanitized request body/params

**Example Output:**
```
╔═════════════════════════════════════════════════════════════╗
║ ❌ ERROR DETECTED                                           ║
╠═════════════════════════════════════════════════════════════╣
║ Error Name:     ValidationError
║ Error Message:  customerId is required
║ Error Code:     N/A
║ 
║ Request Details:
║   Method:       POST
║   Path:         /api/provider/jobCards
║   User ID:      provider_xyz123
║   User Role:    provider
║   IP:           192.168.1.1
║   Timestamp:    2024-01-18T10:30:00.000Z
║ 
║ Stack Trace (first 5 lines):
║    at validateJobCard (...)
║    at router.post (...)
╚═════════════════════════════════════════════════════════════╝
```

### ✅ Database Operation Logging

Database queries can be logged for debugging:

```javascript
const {logDatabaseOperation} = require('./middleware/logger');

logDatabaseOperation('find', 'jobCards', {customerId: 'user123'});
```

**Output:**
```
┌─────────────────────────────────────────────────────────────┐
│ 💾 DATABASE OPERATION
├─────────────────────────────────────────────────────────────┤
│ Operation:  find
│ Collection: jobCards
│ Filter:     {"customerId":"user123"}
│ Time:       2024-01-18T10:30:00.000Z
└─────────────────────────────────────────────────────────────┘
```

### ✅ Performance Monitoring

Slow operations are automatically logged:

```javascript
const {logPerformance} = require('./middleware/logger');

logPerformance('getMyJobCards', 1500, 1000); // Logs if > 1000ms
```

## Usage in Routes

The logger middleware is automatically applied to all routes:

```javascript
router.get(
  '/:jobCardId',
  verifyAuth,           // 1. Authentication
  validateObjectId,     // 2. Validation
  checkJobCardCustomer, // 3. Permissions
  logRequest,           // 4. Request logging
  getMyJobCardById,     // 5. Controller
);
```

## Usage in Controllers

You can add additional logging in controllers:

```javascript
const {logDatabaseOperation, logPerformance} = require('../../middleware/logger');

exports.getMyJobCards = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const query = {customerId: req.user.uid};
    
    logDatabaseOperation('find', 'jobCards', query);
    
    const jobCards = await JobCard.find(query).lean();
    
    const duration = Date.now() - startTime;
    logPerformance('getMyJobCards', duration);
    
    res.json({success: true, data: jobCards});
  } catch (error) {
    console.error(`❌ [getMyJobCards] Failed for user ${req.user.uid}:`, error.message);
    next(error);
  }
};
```

## Configuration

### Sensitive Fields

To add more sensitive fields to sanitize, update `SENSITIVE_FIELDS` array in `logger.js`:

```javascript
const SENSITIVE_FIELDS = [
  'password',
  'fcmToken',
  'token',
  // Add more fields...
];
```

### Performance Threshold

Default threshold for slow operation warnings is 1000ms. Adjust in `logPerformance()` calls.

## Security Notes

- ✅ All sensitive fields are automatically sanitized
- ✅ Passwords and tokens are never logged in plain text
- ✅ Stack traces only shown in development mode
- ✅ Request/response bodies are truncated in logs (max 200 chars)
- ✅ Full error details logged server-side only

## Best Practices

1. **Always use `logRequest`** on routes that need detailed logging
2. **Use `logDatabaseOperation`** for complex queries
3. **Use `logPerformance`** for operations that might be slow
4. **Don't log sensitive data manually** - let the sanitizer handle it
5. **Check logs for patterns** to identify common errors

## Troubleshooting

### Too Much Logging

If logs are too verbose, you can:
- Remove `logRequest` from specific routes
- Adjust log levels in production
- Use environment-based logging

### Missing Information

If logs don't show enough detail:
- Check that `logRequest` is in the middleware chain
- Ensure `logError` is called for errors
- Add `logDatabaseOperation` for database queries

### Sensitive Data Leaking

If sensitive data appears in logs:
- Check `SENSITIVE_FIELDS` array includes all sensitive fields
- Ensure `sanitizeData` is being called
- Report any leaks immediately
