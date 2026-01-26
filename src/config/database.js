/**
 * MongoDB Database Connection using Mongoose
 */

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://sandepkgupta1996_db_user:sandeep1234@prod-services.fakecfy.mongodb.net/';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'home-services';

// Build full connection string with database name
const fullUri = MONGODB_URI.endsWith('/') 
  ? `${MONGODB_URI}${MONGODB_DB_NAME}` 
  : `${MONGODB_URI}/${MONGODB_DB_NAME}`;

/**
 * Connect to MongoDB using Mongoose
 */
async function connectDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      // Already connected
      return mongoose.connection.db;
    }

    await mongoose.connect(fullUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ Connected to MongoDB Atlas via Mongoose');

    return mongoose.connection.db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Get database instance
 */
function getDB() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return mongoose.connection.db;
}

/**
 * Close database connection
 */
async function closeDB() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('🔌 MongoDB connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
    throw error;
  }
}

/**
 * Get collection (for backward compatibility, but prefer using Models)
 * @deprecated Use Mongoose Models instead
 */
async function getCollection(collectionName) {
  // Ensure database is connected
  if (mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
    } catch (error) {
      throw new Error(`Database not connected. Call connectDB() first. Error: ${error.message}`);
    }
  }
  const database = getDB();
  return database.collection(collectionName);
}

module.exports = {
  connectDB,
  getDB,
  closeDB,
  getCollection,
  mongoose, // Export mongoose for direct use if needed
};
