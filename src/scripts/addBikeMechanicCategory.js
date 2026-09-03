/**
 * Bike Mechanic — same transport family as Car Mechanic.
 *
 *   cd homeservices-backend && npm run seed:bike-mechanic
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ServiceCategory = require('../models/ServiceCategory');

function q(id, question, questionHi, options, optionsHi) {
  return [
    {
      id,
      question,
      questionHi,
      type: 'select',
      required: true,
      options: [...options, 'Other'],
      optionsHi: [...optionsHi, 'अन्य'],
    },
  ];
}

const CATEGORIES = [
  {
    _id: 'bike_mechanic',
    name: 'Bike Mechanic',
    nameHi: 'बाइक मैकेनिक',
    icon: 'two_wheeler',
    sectionKey: 'transport',
    order: 43,
    isPopular: false,
    searchTerms: [
      'bike',
      'scooter',
      'activa',
      'mechanic',
      'puncture',
      'two wheeler',
      'बाइक',
      'स्कूटर',
      'मैकेनिक',
      'पंचर',
    ],
    questionnaire: q(
      'q_bike_mechanic_1',
      'What is wrong?',
      'क्या खराब है?',
      ['Not starting', 'Puncture / tyre', 'Brake', 'Service'],
      ['स्टार्ट नहीं', 'पंचर / टायर', 'ब्रेक', 'सर्विस'],
    ),
  },
];

function buildMongoUri() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) return null;
  const dbName = process.env.MONGODB_DB_NAME || 'home-services';
  return uri.endsWith('/') ? `${uri}${dbName}` : `${uri}/${dbName}`;
}

(async () => {
  const fullUri = buildMongoUri();
  if (!fullUri) throw new Error('Missing MONGODB_URI');
  await mongoose.connect(fullUri);

  for (const row of CATEGORIES) {
    const existing = await ServiceCategory.findById(row._id);
    if (existing) {
      existing.questionnaire = row.questionnaire;
      existing.sectionKey = row.sectionKey;
      existing.name = row.name;
      existing.nameHi = row.nameHi;
      existing.icon = row.icon;
      existing.searchTerms = row.searchTerms;
      existing.isActive = true;
      existing.updatedAt = new Date();
      await existing.save();
      console.log('UPDATE', row.name);
      continue;
    }
    await ServiceCategory.create({
      ...row,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('ADD', row.name);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
