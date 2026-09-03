/**
 * One questionnaire per category: short Hindi-first copy, 4 choices + Other.
 * Also inserts missing everyday services if they do not exist yet.
 *
 *   cd homeservices-backend && node src/scripts/simplifyCategoryQuestionnaires.js
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

const BY_NAME = {
  Plumber: q(
    'q_plumber_1',
    'What do you need?',
    'क्या काम है?',
    ['Tap / pipe leaking', 'Drain / toilet blocked', 'New tap or pipe', 'Tank / motor'],
    ['नल / पाइप लीक', 'नाली / शौचालय बंद', 'नया नल या पाइप', 'टंकी / मोटर'],
  ),
  Electrician: q(
    'q_electrician_1',
    'What do you need?',
    'क्या काम है?',
    ['No power / short circuit', 'Fan / light / switch', 'Wiring', 'Inverter / battery'],
    ['बिजली नहीं / शॉर्ट', 'पंखा / लाइट / स्विच', 'वायरिंग', 'इन्वर्टर / बैटरी'],
  ),
  Carpenter: q(
    'q_carpenter_1',
    'What do you need?',
    'क्या काम है?',
    ['Furniture repair', 'Door / window', 'Cupboard / kitchen', 'New wood work'],
    ['फर्नीचर मरम्मत', 'दरवाजा / खिड़की', 'अलमारी / किचन', 'नया लकड़ी काम'],
  ),
  Painter: q(
    'q_painter_1',
    'What do you need?',
    'क्या काम है?',
    ['One or more rooms', 'Full house', 'Outside walls', 'Small touch-up'],
    ['एक या कुछ कमरे', 'पूरा घर', 'बाहर की दीवार', 'छोटा टच-अप'],
  ),
  'AC Repair': q(
    'q_ac_1',
    'What do you need?',
    'क्या काम है?',
    ['Not cooling', 'Service / clean', 'Install AC', 'Gas / leak'],
    ['ठंडा नहीं कर रहा', 'सर्विस / सफाई', 'एसी लगवाना', 'गैस / लीक'],
  ),
  'Cleaning Service': q(
    'q_cleaning_1',
    'What do you need?',
    'क्या काम है?',
    ['Full home clean', 'Kitchen / bathroom', 'Sofa / carpet', 'Regular cleaning'],
    ['पूरे घर की सफाई', 'किचन / बाथरूम', 'सोफा / कालीन', 'रोज या हफ्ते की सफाई'],
  ),
  'Appliance Repair': q(
    'q_appliance_1',
    'Which machine?',
    'कौन सा सामान?',
    ['Fridge', 'Washing machine', 'Mixer / microwave', 'Geyser'],
    ['फ्रिज', 'वॉशिंग मशीन', 'मिक्सर / माइक्रोवेव', 'गीजर'],
  ),
  'Refrigerator Repair': q(
    'q_fridge_1',
    'What is wrong?',
    'क्या खराब है?',
    ['Not cooling', 'Water leak', 'Noise', 'Door / ice'],
    ['ठंडा नहीं', 'पानी लीक', 'आवाज', 'दरवाजा / बर्फ'],
  ),
  'Washing Machine Repair': q(
    'q_wm_1',
    'What is wrong?',
    'क्या खराब है?',
    ['Not starting', 'Water not going out', 'Not spinning', 'Leak / noise'],
    ['स्टार्ट नहीं', 'पानी नहीं निकल रहा', 'कपड़े नहीं घूम रहे', 'लीक / आवाज'],
  ),
  'RO / Water Purifier': q(
    'q_ro_1',
    'What do you need?',
    'क्या काम है?',
    ['Bad water / taste', 'Change filter', 'Install', 'Leak / no water'],
    ['पानी खराब / स्वाद', 'फिल्टर बदलना', 'लगवाना', 'लीक / पानी नहीं'],
  ),
  'Pump / Motor Repair': q(
    'q_pump_1',
    'What is wrong?',
    'क्या खराब है?',
    ['Motor not starting', 'No water', 'Noise / hot', 'Install'],
    ['मोटर स्टार्ट नहीं', 'पानी नहीं आ रहा', 'आवाज / गर्म', 'लगवाना'],
  ),
  'Tiles Mistry': q(
    'q_tiles_1',
    'What do you need?',
    'क्या काम है?',
    ['New floor tiles', 'Wall / bathroom tiles', 'Broken tile fix', 'Grout / finish'],
    ['फर्श की टाइल', 'दीवार / बाथरूम टाइल', 'टूटी टाइल ठीक', 'जोड़ / फिनिश'],
  ),
  Mason: q(
    'q_mason_1',
    'What do you need?',
    'क्या काम है?',
    ['Wall work', 'Plaster', 'Floor', 'Crack / damp'],
    ['दीवार', 'प्लास्टर', 'फर्श', 'दरार / नमी'],
  ),
  Welding: q(
    'q_welding_1',
    'What do you need?',
    'क्या काम है?',
    ['Gate / grill repair', 'New gate / grill', 'Window / railing', 'Broken metal'],
    ['गेट / ग्रिल मरम्मत', 'नया गेट / ग्रिल', 'खिड़की / रेलिंग', 'टूटी लोहा'],
  ),
  'CCTV Service': q(
    'q_cctv_1',
    'What do you need?',
    'क्या काम है?',
    ['New cameras', 'Camera not working', 'See on phone', 'Add a camera'],
    ['नया कैमरा', 'कैमरा बंद है', 'फोन पर देखना', 'और कैमरा लगाना'],
  ),
  'Internet / Wi-Fi Technician': q(
    'q_wifi_1',
    'What do you need?',
    'क्या काम है?',
    ['No internet', 'Slow Wi-Fi', 'Router setup', 'More coverage'],
    ['इंटरनेट नहीं', 'वाई-फाई धीमा', 'राउटर सेटअप', 'और जगह तक पहुँचे'],
  ),
  'Mobile Repair': q(
    'q_mobile_1',
    'What is wrong?',
    'क्या खराब है?',
    ['Broken screen', 'Battery / charging', 'Hang / software', 'Speaker / camera'],
    ['स्क्रीन टूटी', 'बैटरी / चार्ज', 'हैंग / सॉफ्टवेयर', 'स्पीकर / कैमरा'],
  ),
  'Grocery Pickup & Delivery': q(
    'q_grocery_1',
    'What do you need?',
    'क्या काम है?',
    ['Bring from shop', 'Home delivery', 'Heavy bags', 'Urgent items'],
    ['दुकान से लाना', 'घर पहुँचाना', 'भारी सामान', 'जरूरी सामान'],
  ),
  'Medicine Pickup & Delivery': q(
    'q_medicine_1',
    'What do you need?',
    'क्या काम है?',
    ['Bring from medical', 'Home delivery', 'Urgent medicine', 'With prescription'],
    ['मेडिकल से लाना', 'घर पहुँचाना', 'तुरंत दवा', 'पर्ची से लाना'],
  ),
  'Labour / Helper': q(
    'q_labour_1',
    'What do you need?',
    'क्या काम है?',
    ['Load / unload', 'House shifting', 'Site helper', 'One-day labour'],
    ['सामान उठाना-रखना', 'घर शिफ्टिंग', 'काम पर मदद', 'एक दिन का मजदूर'],
  ),
  Barber: q(
    'q_barber_1',
    'What do you need?',
    'क्या काम है?',
    ['Haircut', 'Beard', 'Hair + beard', 'Home visit'],
    ['हेयरकट', 'दाढ़ी', 'हेयर + दाढ़ी', 'घर आकर'],
  ),
  Tailor: q(
    'q_tailor_1',
    'What do you need?',
    'क्या काम है?',
    ['Alter / fit', 'New stitch', 'Repair tear', 'Blouse / suit'],
    ['छोटा-बड़ा / फिटिंग', 'नई सिलाई', 'फटा ठीक करना', 'ब्लाउज / सूट'],
  ),
  Landlord: q(
    'q_landlord_1',
    'What do you need?',
    'क्या काम है?',
    ['Looking for a house', 'Want to show / rent my house', 'House visit', 'Rent papers'],
    ['मकान ढूँढना है', 'अपना मकान किराए पर देना', 'घर देखना', 'किराये के कागज़'],
  ),
  Other: q(
    'q_other_1',
    'What do you need?',
    'क्या काम है?',
    ['Repair', 'Install', 'Someone to visit', 'Pickup / drop'],
    ['मरम्मत', 'लगवाना', 'कोई आकर देखे', 'लाना-ले जाना'],
  ),
  Driver: q(
    'q_driver_1',
    'What do you need?',
    'क्या काम है?',
    ['Local trip', 'Airport / station', 'Out of town', 'Full day / monthly'],
    ['शहर में सफर', 'एयरपोर्ट / स्टेशन', 'बाहर शहर', 'पूरा दिन / महीने का'],
  ),
  'Bike Repair': q(
    'q_bike_1',
    'What is wrong?',
    'क्या खराब है?',
    ['Not starting', 'Puncture / tyre', 'Brake', 'Service'],
    ['स्टार्ट नहीं', 'पंचर / टायर', 'ब्रेक', 'सर्विस'],
  ),
  'Bike Mechanic': q(
    'q_bike_mechanic_1',
    'What is wrong?',
    'क्या खराब है?',
    ['Not starting', 'Puncture / tyre', 'Brake', 'Service'],
    ['स्टार्ट नहीं', 'पंचर / टायर', 'ब्रेक', 'सर्विस'],
  ),
  'Tractor Driver': q(
    'q_tractor_1',
    'What do you need?',
    'क्या काम है?',
    ['Plough field', 'Trolley / carry', 'Full day with driver'],
    ['खेत जोतना', 'ट्रॉली / सामान ढोना', 'पूरे दिन ड्राइवर सहित'],
  ),
  'Interior Design': q(
    'q_interior_1',
    'What do you need?',
    'क्या काम है?',
    ['One room', 'Kitchen', 'Full house', 'Just advice / visit'],
    ['एक कमरा', 'किचन', 'पूरा घर', 'सलाह / आकर देखना'],
  ),
  'SIM Supplier': q(
    'q_sim_1',
    'What do you need?',
    'क्या काम है?',
    ['New SIM', 'Recharge', 'Number / network help'],
    ['नया सिम', 'रिचार्ज', 'नंबर / नेटवर्क मदद'],
  ),
  'JCB Driver': q(
    'q_jcb_1',
    'What do you need?',
    'क्या काम है?',
    ['Digging / pit', 'House construction', 'Land / road work'],
    ['खोदना / गड्ढा', 'घर बनाने में', 'जमीन / सड़क काम'],
  ),
};

const NEW_CATEGORIES = [
  {
    _id: 'cook',
    name: 'Cook',
    nameHi: 'रसोइया',
    icon: 'restaurant',
    sectionKey: 'personal',
    order: 25,
    isPopular: true,
    searchTerms: ['cook', 'rasoiya', 'chef', 'kitchen', 'रसोइया', 'खाना'],
    questionnaire: q(
      'q_cook_1',
      'What do you need?',
      'क्या काम है?',
      ['Daily home cook', 'One-time party / function', 'Lunch / dinner today'],
      ['रोज़ घर पर पकाना', 'पार्टी / कार्यक्रम', 'आज लंच / डिनर'],
    ),
  },
  {
    _id: 'beautician',
    name: 'Beautician',
    nameHi: 'ब्यूटीशियन',
    icon: 'spa',
    sectionKey: 'personal',
    order: 26,
    isPopular: false,
    searchTerms: ['beauty', 'parlour', 'makeup', 'facial', 'ब्यूटी', 'पार्लर', 'मेकअप'],
    questionnaire: q(
      'q_beautician_1',
      'What do you need?',
      'क्या काम है?',
      ['Facial / cleanup', 'Makeup', 'Waxing / threading', 'Home visit'],
      ['फेशियल / क्लीनअप', 'मेकअप', 'वैक्स / थ्रेडिंग', 'घर आकर'],
    ),
  },
  {
    _id: 'car_mechanic',
    name: 'Car Mechanic',
    nameHi: 'कार मैकेनिक',
    icon: 'car_repair',
    sectionKey: 'transport',
    order: 27,
    isPopular: false,
    searchTerms: ['car', 'mechanic', 'garage', 'four wheeler', 'कार', 'मैकेनिक', 'गैरेज'],
    questionnaire: q(
      'q_car_1',
      'What is wrong?',
      'क्या खराब है?',
      ['Not starting', 'Service', 'Brake / tyre', 'Breakdown nearby'],
      ['स्टार्ट नहीं', 'सर्विस', 'ब्रेक / टायर', 'यहीं खराब हो गई'],
    ),
  },
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
  {
    _id: 'locksmith',
    name: 'Lock & Key',
    nameHi: 'ताला चाबी',
    icon: 'vpn_key',
    sectionKey: 'home_repair',
    order: 28,
    isPopular: false,
    searchTerms: ['lock', 'key', 'duplicate', 'ताला', 'चाबी', 'locksmith'],
    questionnaire: q(
      'q_lock_1',
      'What do you need?',
      'क्या काम है?',
      ['Door locked out', 'New lock', 'Duplicate key', 'Broken lock'],
      ['दरवाजा बंद, चाबी नहीं', 'नया ताला', 'चाबी बनवाना', 'ताला टूटा'],
    ),
  },
  {
    _id: 'pest_control',
    name: 'Pest Control',
    nameHi: 'कीड़े-मकोड़े नियंत्रण',
    icon: 'bug_report',
    sectionKey: 'home_repair',
    order: 29,
    isPopular: false,
    searchTerms: ['pest', 'termite', 'cockroach', 'mosquito', 'कीड़े', 'दीमक', 'झींगुर'],
    questionnaire: q(
      'q_pest_1',
      'What is the problem?',
      'क्या समस्या है?',
      ['Cockroach / insects', 'Termite', 'Mosquito / fly', 'Rats'],
      ['झींगुर / कीड़े', 'दीमक', 'मच्छर / मक्खी', 'चूहे'],
    ),
  },
  {
    _id: 'gardener',
    name: 'Gardener',
    nameHi: 'माली',
    icon: 'yard',
    sectionKey: 'home_repair',
    order: 30,
    isPopular: false,
    searchTerms: ['garden', 'mali', 'plants', 'lawn', 'माली', 'बाग', 'पौधे'],
    questionnaire: q(
      'q_garden_1',
      'What do you need?',
      'क्या काम है?',
      ['Trim / clean garden', 'Plant / grass', 'One-day help', 'Regular visit'],
      ['बाग साफ / काटना', 'पौधे / घास', 'एक दिन मदद', 'नियमित आना'],
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

  for (const [name, questionnaire] of Object.entries(BY_NAME)) {
    const doc = await ServiceCategory.findOne({name});
    if (!doc) {
      console.log('SKIP missing', name);
      continue;
    }
    doc.questionnaire = questionnaire;
    doc.updatedAt = new Date();
    await doc.save();
    console.log('Q', name, questionnaire[0].options.length, 'options');
  }

  for (const row of NEW_CATEGORIES) {
    const existing = await ServiceCategory.findById(row._id);
    if (existing) {
      existing.questionnaire = row.questionnaire;
      existing.sectionKey = row.sectionKey;
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
