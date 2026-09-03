/**
 * Persist showRequestService on existing Partner rows.
 * Admin / Excel-created → false. Everyone else (self or unknown) → true if unset.
 *
 *   cd homeservices-backend && node src/scripts/backfillShowRequestService.js
 */
require('dotenv').config();
const {connectDB, closeDB} = require('../config/database');
const Provider = require('../models/Provider');
const {defaultShowRequestService} = require('../utils/showRequestService');

(async () => {
  await connectDB();
  const unset = {
    $or: [
      {showRequestService: {$exists: false}},
      {showRequestService: null},
    ],
  };
  const rows = await Provider.find(unset).select('_id onboardingSource').lean();
  let off = 0;
  let on = 0;
  for (const row of rows) {
    const next = defaultShowRequestService(row.onboardingSource);
    await Provider.updateOne({_id: row._id}, {$set: {showRequestService: next}});
    if (next) on += 1;
    else off += 1;
  }
  console.log(`backfillShowRequestService: ${rows.length} updated (${off} off, ${on} on)`);
  await closeDB();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
