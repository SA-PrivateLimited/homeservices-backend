/**
 * Water jar, ice, packed bottles — daily / function supply.
 *
 *   cd homeservices-backend && node src/scripts/addWaterJarIceCategories.js
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
    _id: 'water_jar',
    name: 'Water Jar Supplier',
    nameHi: 'पानी जार',
    icon: 'water_bottle',
    sectionKey: 'delivery',
    order: 39,
    isPopular: false,
    searchTerms: [
      'water jar',
      'jar',
      'bisleri',
      '20 litre',
      'can',
      'पानी जार',
      'जार',
      'कैन',
      'मिनरल वाटर',
    ],
    questionnaire: q(
      'q_jar_1',
      'What do you need?',
      'क्या काम है?',
      ['Home jar delivery', 'New connection', 'Today / urgent', 'For function'],
      ['घर पर जार', 'नया कनेक्शन', 'आज / तुरंत', 'कार्यक्रम के लिए'],
    ),
  },
  {
    _id: 'ice_supplier',
    name: 'Ice Cube Supplier',
    nameHi: 'बर्फ',
    icon: 'ac_unit',
    sectionKey: 'delivery',
    order: 40,
    isPopular: false,
    searchTerms: [
      'ice',
      'ice cube',
      'ice block',
      'barf',
      'बर्फ',
      'आइस',
      'क्यूब',
    ],
    questionnaire: q(
      'q_ice_1',
      'What do you need?',
      'क्या काम है?',
      ['Ice cubes', 'Ice block', 'For party / function', 'Today / urgent'],
      ['आइस क्यूब', 'बर्फ का ब्लॉक', 'पार्टी / कार्यक्रम', 'आज / तुरंत'],
    ),
  },
  {
    _id: 'packed_water',
    name: 'Packed Water Bottles',
    nameHi: 'बोतल पानी',
    icon: 'local_drink',
    sectionKey: 'delivery',
    order: 41,
    isPopular: false,
    searchTerms: [
      'bottle water',
      'packed water',
      'mineral water',
      'बोतल',
      'पैक्ड पानी',
      'मिनरल',
    ],
    questionnaire: q(
      'q_bottle_1',
      'What do you need?',
      'क्या काम है?',
      ['Home few bottles', 'For marriage / function', 'Today / urgent'],
      ['घर के लिए कुछ बोतल', 'शादी / कार्यक्रम', 'आज / तुरंत'],
    ),
  },
  {
    _id: 'cold_drinks',
    name: 'Cold Drinks Supplier',
    nameHi: 'कोल्ड ड्रिंक',
    icon: 'liquor',
    sectionKey: 'delivery',
    order: 42,
    isPopular: false,
    searchTerms: [
      'cold drink',
      'soft drink',
      'crate',
      'pepsi',
      'coke',
      'कोल्ड ड्रिंक',
      'क्रेट',
      'सोडा',
    ],
    questionnaire: q(
      'q_drinks_1',
      'What do you need?',
      'क्या काम है?',
      ['Crate for home', 'For marriage / function', 'Today / urgent'],
      ['घर के लिए क्रेट', 'शादी / कार्यक्रम', 'आज / तुरंत'],
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
