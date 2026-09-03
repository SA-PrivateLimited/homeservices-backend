/**
 * Flower, event decoration, car/bike rental, car wash.
 *
 *   cd homeservices-backend && node src/scripts/addFlowerAndVehicleCategories.js
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
    _id: 'florist',
    name: 'Florist',
    nameHi: 'फूल वाले',
    icon: 'local_florist',
    sectionKey: 'decoration',
    order: 31,
    isPopular: false,
    searchTerms: [
      'flower',
      'florist',
      'bouquet',
      'mala',
      'phool',
      'फूल',
      'माला',
      'गुलदस्ता',
      'पूजा',
    ],
    questionnaire: q(
      'q_florist_1',
      'What do you need?',
      'क्या काम है?',
      ['Puja / mala flowers', 'Bouquet', 'Home / shop decoration', 'Wedding / function'],
      ['पूजा / माला', 'गुलदस्ता', 'घर / दुकान सजाना', 'शादी / कार्यक्रम'],
    ),
  },
  {
    _id: 'event_decorator',
    name: 'Event Decorator',
    nameHi: 'सजावट',
    icon: 'celebration',
    sectionKey: 'decoration',
    order: 32,
    isPopular: false,
    searchTerms: [
      'decorator',
      'wedding',
      'shaadi',
      'tent',
      'lights',
      'सजावट',
      'शादी',
      'टेंट',
      'लाइट',
    ],
    questionnaire: q(
      'q_event_1',
      'What do you need?',
      'क्या काम है?',
      ['Wedding / function', 'Home party', 'Lights / backdrop', 'Tent / seating'],
      ['शादी / कार्यक्रम', 'घर पर पार्टी', 'लाइट / बैकड्रॉप', 'टेंट / बैठक'],
    ),
  },
  {
    _id: 'car_rental',
    name: 'Car Rental',
    nameHi: 'कार किराए पर',
    icon: 'directions_car',
    sectionKey: 'transport',
    order: 33,
    isPopular: false,
    searchTerms: [
      'car rental',
      'rent a car',
      'hire car',
      'self drive',
      'कार किराया',
      'गाड़ी किराए',
      'टैक्सी',
    ],
    questionnaire: q(
      'q_car_rental_1',
      'What do you need?',
      'क्या काम है?',
      ['With driver', 'Self drive', 'Airport / station', 'Wedding / function'],
      ['ड्राइवर के साथ', 'खुद चलानी है', 'एयरपोर्ट / स्टेशन', 'शादी / कार्यक्रम'],
    ),
  },
  {
    _id: 'car_wash',
    name: 'Car Wash',
    nameHi: 'कार धुलाई',
    icon: 'local_car_wash',
    sectionKey: 'transport',
    order: 34,
    isPopular: false,
    searchTerms: [
      'car wash',
      'car cleaning',
      'bike wash',
      'vehicle wash',
      'कार धोना',
      'गाड़ी धुलाई',
      'बाइक धोना',
    ],
    questionnaire: q(
      'q_car_wash_1',
      'What do you need?',
      'क्या काम है?',
      ['Car wash at home', 'Bike / scooter wash', 'Interior clean', 'Full wash + polish'],
      ['घर पर कार धोना', 'बाइक / स्कूटर धोना', 'अंदर की सफाई', 'पूरी धुलाई + पॉलिश'],
    ),
  },
  {
    _id: 'bike_rental',
    name: 'Bike Rental',
    nameHi: 'बाइक किराए पर',
    icon: 'two_wheeler',
    sectionKey: 'transport',
    order: 35,
    isPopular: false,
    searchTerms: [
      'bike rental',
      'scooter rental',
      'activa',
      'hire bike',
      'बाइक किराया',
      'स्कूटर किराए',
    ],
    questionnaire: q(
      'q_bike_rental_1',
      'What do you need?',
      'क्या काम है?',
      ['Scooter / Activa', 'Bike', 'Few hours', 'Full day'],
      ['स्कूटर / एक्टिवा', 'बाइक', 'कुछ घंटे', 'पूरा दिन'],
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
