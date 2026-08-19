/**
 * Seed: add Hindi names to ServiceCategory documents.
 * Safe to run multiple times — only updates if nameHi is missing.
 *
 * Run: node src/scripts/seedServiceCategoryHindiNames.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const HINDI_MAP = {
  Plumber: 'प्लंबर',
  Electrician: 'इलेक्ट्रीशियन',
  Carpenter: 'बढ़ई',
  Painter: 'पेंटर',
  'AC Repair': 'एसी मरम्मत',
  'Cleaning Service': 'सफाई सेवा',
  Driver: 'ड्राइवर',
  Mason: 'राजमिस्त्री',
  Welder: 'वेल्डर',
  'Appliance Repair': 'उपकरण मरम्मत',
  Gardener: 'माली',
  Roofer: 'छत कारीगर',
  Flooring: 'फ़्लोरिंग',
  'Tiles & Marble': 'टाइल्स और मार्बल',
  'Interior Designer': 'इंटीरियर डिज़ाइनर',
  Other: 'अन्य',
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const ServiceCategory = require('../models/ServiceCategory');
  const cats = await ServiceCategory.find({}).lean();
  let updated = 0;

  for (const cat of cats) {
    const hindi = HINDI_MAP[cat.name];
    if (hindi && !cat.nameHi) {
      await ServiceCategory.updateOne({_id: cat._id}, {$set: {nameHi: hindi}});
      console.log(`  Updated: ${cat.name} → ${hindi}`);
      updated++;
    }
  }

  console.log(`\nDone. Updated ${updated} categories.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
