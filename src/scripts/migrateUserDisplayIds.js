/**
 * Migration: backfill customerDisplayId for all users and
 * auto-enable customerProfileEnabled for all provider users.
 *
 * Run once: node src/scripts/migrateUserDisplayIds.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const User = require('../models/User');

  const usedIds = new Set(
    (await User.find({customerDisplayId: {$ne: null}}).select('customerDisplayId').lean())
      .map((u) => u.customerDisplayId),
  );

  function nextId() {
    for (let i = 0; i < 200; i++) {
      const id = parseInt(String(Date.now()).slice(-4), 10) + Math.floor(Math.random() * 1000);
      const clamped = ((id % 9000) + 1000); // 1000–9999
      if (!usedIds.has(clamped)) {
        usedIds.add(clamped);
        return clamped;
      }
    }
    const fallback = crypto.randomInt(1000, 9999);
    usedIds.add(fallback);
    return fallback;
  }

  // Backfill missing customerDisplayId
  const missing = await User.find({
    $or: [{customerDisplayId: null}, {customerDisplayId: {$exists: false}}],
  }).lean();
  console.log(`Users missing customerDisplayId: ${missing.length}`);
  for (const u of missing) {
    await User.updateOne({_id: u._id}, {$set: {customerDisplayId: nextId()}});
  }

  // Auto-enable customerProfileEnabled for all providers
  const providerResult = await User.updateMany(
    {role: 'provider', customerProfileEnabled: {$ne: true}},
    {$set: {customerProfileEnabled: true, updatedAt: new Date()}},
  );
  console.log(`Providers updated with customerProfileEnabled: ${providerResult.modifiedCount}`);

  console.log('Migration complete');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
