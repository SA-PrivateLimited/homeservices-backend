/**
 * Tent, water tanker, photographer.
 *
 *   cd homeservices-backend && node src/scripts/addTentWaterPhotoCategories.js
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
    _id: 'tent',
    name: 'Tent / Shamiana',
    nameHi: 'टेंट / शामियाना',
    icon: 'camping',
    sectionKey: 'decoration',
    order: 36,
    isPopular: false,
    searchTerms: [
      'tent',
      'shamiana',
      'shading',
      'shadding',
      'canopy',
      'marriage tent',
      'birthday tent',
      'टेंट',
      'शामियाना',
      'छांव',
      'शादी',
      'बर्थडे',
      'पंडाल',
    ],
    questionnaire: q(
      'q_tent_1',
      'What is the tent for?',
      'टेंट किस काम के लिए है?',
      ['Marriage / wedding', 'Birthday party', 'Other function'],
      ['शादी', 'बर्थडे पार्टी', 'और कार्यक्रम'],
    ),
  },
  {
    _id: 'water_tanker',
    name: 'Water Tanker',
    nameHi: 'पानी टैंकर',
    icon: 'water_drop',
    sectionKey: 'delivery',
    order: 37,
    isPopular: false,
    searchTerms: [
      'water tanker',
      'tanker',
      'water supply',
      'पानी टैंकर',
      'टैंकर',
      'पानी',
    ],
    questionnaire: q(
      'q_tanker_1',
      'What do you need?',
      'क्या काम है?',
      ['Fill home tank', 'Drinking water', 'Construction / site', 'Urgent today'],
      ['घर की टंकी भरना', 'पीने का पानी', 'निर्माण / साइट', 'आज तुरंत'],
    ),
  },
  {
    _id: 'photographer',
    name: 'Photographer',
    nameHi: 'फोटोग्राफर',
    icon: 'photo_camera',
    sectionKey: 'personal',
    order: 38,
    isPopular: false,
    searchTerms: [
      'photo',
      'photographer',
      'video',
      'wedding photo',
      'फोटो',
      'फोटोग्राफर',
      'वीडियो',
    ],
    questionnaire: q(
      'q_photo_1',
      'What do you need?',
      'क्या काम है?',
      ['Wedding / function', 'Photo + video', 'Home / passport photos', 'One-day shoot'],
      ['शादी / कार्यक्रम', 'फोटो + वीडियो', 'घर / पासपोर्ट फोटो', 'एक दिन शूट'],
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
