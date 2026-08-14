/**
 * MongoDB Database Connection using Mongoose
 *
 * Architecture: Only the backend connects to the database.
 * All client apps (HomeServices, HomeServicesProvider, HomeServicesAdmin) must
 * use this backend API only; they must never connect to MongoDB directly.
 */

const dns = require('dns');
const mongoose = require('mongoose');

/**
 * `mongodb+srv` needs DNS SRV lookups. Some local resolvers (esp. on macOS /
 * flaky ISP DNS) return ECONNREFUSED for querySrv and Atlas then looks like
 * ReplicaSetNoPrimary / whitelist failures. Prefer public DNS + IPv4 first.
 */
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // ignore — environment may not allow overriding resolvers
}

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'home-services';

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is required. Set it in .env or your environment.');
}

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
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      // Atlas Network Access lists are usually IPv4 — avoid IPv6 preference.
      family: 4,
    });

    console.log('✅ Connected to MongoDB Atlas via Mongoose');

    return mongoose.connection.db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message || error);
    if (
      /whitelist|IP|ReplicaSetNoPrimary|querySrv|ECONNREFUSED|ENOTFOUND/i.test(
        String(error.message || error),
      )
    ) {
      console.error(
        [
          'Hint: MongoDB Atlas could not be reached.',
          '1) Atlas → Network Access: allow your current public IPv4 (or 0.0.0.0/0 for local dev).',
          '2) Confirm MONGODB_URI in .env (mongodb+srv user/password, no typos).',
          '3) If querySrv fails, this process now forces 8.8.8.8/1.1.1.1 DNS + IPv4.',
        ].join('\n'),
      );
    }
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
