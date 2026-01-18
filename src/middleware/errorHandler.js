/**
 * Error Handling Middleware
 * Handles all errors and provides appropriate responses
 * Uses logger to log errors while protecting sensitive data
 */

const {logError} = require('./logger');

function errorHandler(err, req, res, next) {
  // Log the error with full context (but sanitized)
  logError(err, req, res, next);

  // Determine error type and status code
  let statusCode = err.statusCode || 500;
  let errorName = err.name || 'Error';
  let errorMessage = err.message || 'An error occurred';

  // Handle specific error types
  if (err.code === 11000) {
    // MongoDB duplicate key error
    statusCode = 400;
    errorName = 'Duplicate Entry';
    errorMessage = 'A record with this identifier already exists';
  } else if (err.name === 'ValidationError' || err.name === 'CastError') {
    // Mongoose validation or cast error
    statusCode = 400;
    errorName = 'Validation Error';
    errorMessage = err.message || 'Invalid data provided';
  } else if (err.name === 'MongoServerError') {
    // MongoDB server error
    statusCode = 500;
    errorName = 'Database Error';
    errorMessage = process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Database operation failed';
  } else if (err.name === 'MongooseError') {
    // Generic Mongoose error
    statusCode = 500;
    errorName = 'Database Error';
    errorMessage = 'Database connection or operation failed';
  } else if (err.statusCode) {
    // Custom error with status code
    statusCode = err.statusCode;
    errorName = err.name || 'Error';
    errorMessage = err.message;
  }

  // Build error response
  const errorResponse = {
    success: false,
    error: errorName,
    message: errorMessage,
  };

  // Include stack trace in development mode
  if (process.env.NODE_ENV === 'development' && err.stack) {
    errorResponse.stack = err.stack.split('\n').slice(0, 10); // First 10 lines of stack
  }

  // Include error code if available
  if (err.code) {
    errorResponse.code = err.code;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

module.exports = errorHandler;
