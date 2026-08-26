/**
 * Inject bilingual select questionnaires for every service category.
 *
 * Usage (from homeServicesBackend):
 *   node scripts/injectServiceQuestionnaires.js
 *
 * Uses MONGODB_URI + MONGODB_DB_NAME from .env.
 * Matches categories by name (case-insensitive). Services without a
 * specific map get a sensible generic select + "Other".
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'home-services';

if (!MONGODB_URI) {
  console.error('MONGODB_URI is missing in .env');
  process.exit(1);
}

const fullUri = MONGODB_URI.endsWith('/')
  ? `${MONGODB_URI}${MONGODB_DB_NAME}`
  : `${MONGODB_URI.replace(/\/?$/, '')}/${MONGODB_DB_NAME}`;

function problemSelect(id, question, questionHi, pairs) {
  const options = pairs.map(([en]) => en);
  const optionsHi = pairs.map(([, hi]) => hi);
  if (!options.some((o) => /^other$/i.test(o))) {
    options.push('Other');
    optionsHi.push('अन्य');
  }
  return {
    id,
    question,
    questionHi,
    type: 'select',
    required: true,
    options,
    optionsHi,
  };
}

/** Per-service primary problem selectors (EN value + HI label). */
const QUESTIONNAIRES = {
  Landlord: [
    problemSelect(
      'q_landlord_1',
      "What's the problem?",
      'समस्या क्या है?',
      [
        ['Rent / payment issue', 'किराया / भुगतान की समस्या'],
        ['Maintenance request', 'मेंटनेंस अनुरोध'],
        ['Lease / agreement help', 'किरायानामा / समझौता मदद'],
        ['Property inspection visit', 'प्रॉपर्टी देखने आना'],
        ['Tenant / landlord dispute help', 'किरायेदार / मकान मालिक विवाद मदद'],
        ['Document or NOC help', 'दस्तावेज़ या NOC मदद'],
      ],
    ),
  ],
  'Tiles Mistry': [
    problemSelect(
      'q_tiles_1',
      'What tile work do you need?',
      'आपको कौन-सा टाइल काम चाहिए?',
      [
        ['Floor tile installation', 'फर्श टाइल लगवाना'],
        ['Wall tile installation', 'दीवार टाइल लगवाना'],
        ['Broken tile repair', 'टूटी टाइल मरम्मत'],
        ['Bathroom / kitchen tiling', 'बाथरूम / किचन टाइलिंग'],
        ['Tile polishing / finishing', 'टाइल पॉलिश / फिनिशिंग'],
        ['Grouting / joint fix', 'ग्रॉउटिंग / जोड़ ठीक करना'],
      ],
    ),
  ],
  Plumber: [
    problemSelect(
      'q_plumber_1',
      'What plumbing issue are you facing?',
      'आपको किस प्रकार की प्लंबिंग समस्या है?',
      [
        ['Leaking tap / pipe', 'नल / पाइप से रिसाव'],
        ['Clogged drain / toilet', 'बंद नाली / शौचालय'],
        ['Toilet repair', 'शौचालय मरम्मत'],
        ['Water tank / motor issue', 'पानी की टंकी / मोटर समस्या'],
        ['New tap / pipe installation', 'नया नल / पाइप लगवाना'],
        ['Low water pressure', 'पानी का दबाव कम'],
      ],
    ),
  ],
  Electrician: [
    problemSelect(
      'q_electrician_1',
      'What electrical help do you need?',
      'आपको बिजली से जुड़ी क्या मदद चाहिए?',
      [
        ['No power / short circuit', 'बिजली नहीं / शॉर्ट सर्किट'],
        ['Fan installation / repair', 'पंखा लगवाना / मरम्मत'],
        ['Light / switch / socket', 'लाइट / स्विच / सॉकेट'],
        ['Wiring repair', 'वायरिंग मरम्मत'],
        ['MCB / fuse / board issue', 'MCB / फ्यूज / बोर्ड समस्या'],
        ['Inverter / battery help', 'इन्वर्टर / बैटरी मदद'],
      ],
    ),
  ],
  Carpenter: [
    problemSelect(
      'q_carpenter_1',
      'What carpentry work do you need?',
      'आपको किस प्रकार का बढ़ई का काम चाहिए?',
      [
        ['Furniture repair', 'फर्नीचर मरम्मत'],
        ['Door / window work', 'दरवाजा / खिड़की का काम'],
        ['Kitchen cabinet work', 'किचन कैबिनेट काम'],
        ['Wardrobe / cupboard', 'अलमारी / कपबोर्ड'],
        ['Shelves / wood fitting', 'शेल्फ / लकड़ी फिटिंग'],
        ['Custom furniture', 'कस्टम फर्नीचर'],
      ],
    ),
  ],
  Painter: [
    problemSelect(
      'q_painter_1',
      'What painting work do you need?',
      'आपको किस प्रकार की पेंटिंग चाहिए?',
      [
        ['Room / interior painting', 'कमरा / अंदर की पेंटिंग'],
        ['Exterior painting', 'बाहर की पेंटिंग'],
        ['Touch-up / patch work', 'टच-अप / पैच वर्क'],
        ['Damp / seepage wall paint', 'नमी / सीपेज दीवार पेंट'],
        ['Putty / wall preparation', 'पुट्टी / दीवार तैयारी'],
        ['Full house painting', 'पूरे घर की पेंटिंग'],
      ],
    ),
  ],
  'AC Repair': [
    problemSelect(
      'q_ac_1',
      'What AC service do you need?',
      'आपको किस प्रकार की एसी सेवा चाहिए?',
      [
        ['AC not cooling', 'एसी ठंडा नहीं कर रहा'],
        ['AC servicing / cleaning', 'एसी सर्विसिंग / सफाई'],
        ['AC installation', 'एसी लगवाना'],
        ['Gas refill', 'गैस भरवाना'],
        ['Water leakage', 'पानी का रिसाव'],
        ['Noise / smell issue', 'आवाज / गंध की समस्या'],
      ],
    ),
  ],
  'Cleaning Service': [
    problemSelect(
      'q_cleaning_1',
      'What cleaning do you need?',
      'आपको किस प्रकार की सफाई चाहिए?',
      [
        ['Home deep cleaning', 'घर की गहरी सफाई'],
        ['Kitchen cleaning', 'किचन सफाई'],
        ['Bathroom cleaning', 'बाथरूम सफाई'],
        ['Move-in / move-out cleaning', 'शिफ्टिंग सफाई'],
        ['Sofa / carpet cleaning', 'सोफा / कालीन सफाई'],
        ['Regular house cleaning', 'नियमित घर की सफाई'],
      ],
    ),
  ],
  Driver: [
    problemSelect(
      'q_driver_1',
      'What driver help do you need?',
      'आपको किस प्रकार की ड्राइवर मदद चाहिए?',
      [
        ['Local trip', 'लोकल यात्रा'],
        ['Airport pickup / drop', 'एयरपोर्ट पिकअप / ड्रॉप'],
        ['Outstation trip', 'आउटस्टेशन यात्रा'],
        ['Full-day driver', 'पूरे दिन का ड्राइवर'],
        ['Monthly personal driver', 'मासिक पर्सनल ड्राइवर'],
        ['Delivery driving', 'डिलीवरी ड्राइविंग'],
      ],
    ),
  ],
  'Appliance Repair': [
    problemSelect(
      'q_appliance_1',
      'Which appliance needs help?',
      'किस उपकरण की मदद चाहिए?',
      [
        ['Washing machine', 'वॉशिंग मशीन'],
        ['Refrigerator', 'फ्रिज'],
        ['Microwave', 'माइक्रोवेव'],
        ['Mixer / grinder', 'मिक्सर / ग्राइंडर'],
        ['Geyser / water heater', 'गीजर / वॉटर हीटर'],
        ['Oven / stove', 'ओवन / स्टोव'],
      ],
    ),
  ],
  'Medicine Pickup & Delivery': [
    problemSelect(
      'q_medicine_1',
      'What medicine help do you need?',
      'दवा से जुड़ी क्या मदद चाहिए?',
      [
        ['Pickup from medical store', 'मेडिकल स्टोर से लाना'],
        ['Delivery to home', 'घर पर डिलीवरी'],
        ['Urgent medicine needed', 'तुरंत दवा चाहिए'],
        ['Prescription pickup', 'पर्ची से दवा लाना'],
        ['Return / exchange help', 'वापसी / बदलने में मदद'],
      ],
    ),
  ],
  'Grocery Pickup & Delivery': [
    problemSelect(
      'q_grocery_1',
      'What grocery help do you need?',
      'किराने से जुड़ी क्या मदद चाहिए?',
      [
        ['Pickup from shop', 'दुकान से सामान लाना'],
        ['Home delivery', 'घर डिलीवरी'],
        ['Weekly grocery run', 'साप्ताहिक किराना'],
        ['Urgent items needed', 'तुरंत सामान चाहिए'],
        ['Heavy items carry help', 'भारी सामान उठाने में मदद'],
      ],
    ),
  ],
  'Mobile Repair': [
    problemSelect(
      'q_mobile_1',
      'What mobile issue are you facing?',
      'मोबाइल की क्या समस्या है?',
      [
        ['Screen broken', 'स्क्रीन टूटी है'],
        ['Battery / charging issue', 'बैटरी / चार्जिंग समस्या'],
        ['Software / hang issue', 'सॉफ्टवेयर / हैंग समस्या'],
        ['Speaker / mic issue', 'स्पीकर / माइक समस्या'],
        ['Camera not working', 'कैमरा काम नहीं कर रहा'],
        ['Water damage', 'पानी से खराब'],
      ],
    ),
  ],
  'RO / Water Purifier': [
    problemSelect(
      'q_ro_1',
      'What RO / purifier help do you need?',
      'आरओ / प्यूरीफायर की क्या मदद चाहिए?',
      [
        ['Not purifying / bad taste', 'साफ नहीं / स्वाद खराब'],
        ['Filter / cartridge change', 'फिल्टर / कार्ट्रिज बदलना'],
        ['Installation', 'इंस्टॉलेशन'],
        ['Leakage', 'रिसाव'],
        ['No water / low flow', 'पानी नहीं / फ्लो कम'],
        ['Annual service', 'वार्षिक सर्विस'],
      ],
    ),
  ],
  'Refrigerator Repair': [
    problemSelect(
      'q_fridge_1',
      'What fridge problem are you facing?',
      'फ्रिज की क्या समस्या है?',
      [
        ['Not cooling', 'ठंडा नहीं कर रहा'],
        ['Water leakage', 'पानी का रिसाव'],
        ['Noise issue', 'आवाज की समस्या'],
        ['Gas refill', 'गैस भरवाना'],
        ['Door / gasket issue', 'दरवाजा / गैसकेट समस्या'],
        ['Ice / freezer issue', 'आइस / फ्रीजर समस्या'],
      ],
    ),
  ],
  'Washing Machine Repair': [
    problemSelect(
      'q_wm_1',
      'What washing machine problem are you facing?',
      'वॉशिंग मशीन की क्या समस्या है?',
      [
        ['Not starting', 'स्टार्ट नहीं हो रही'],
        ['Not draining water', 'पानी नहीं निकल रहा'],
        ['Not spinning', 'स्पिन नहीं हो रहा'],
        ['Noise / vibration', 'आवाज / कंपन'],
        ['Water leakage', 'पानी का रिसाव'],
        ['Error code on display', 'डिस्प्ले पर एरर कोड'],
      ],
    ),
  ],
  'Bike Repair': [
    problemSelect(
      'q_bike_1',
      'What bike help do you need?',
      'बाइक की क्या मदद चाहिए?',
      [
        ['Engine / starting issue', 'इंजन / स्टार्ट समस्या'],
        ['Puncture / tyre', 'पंचर / टायर'],
        ['Brake problem', 'ब्रेक समस्या'],
        ['Battery / electrical', 'बैटरी / बिजली'],
        ['Service / oil change', 'सर्विस / ऑयल चेंज'],
        ['Chain / gear issue', 'चेन / गियर समस्या'],
      ],
    ),
  ],
  Tailor: [
    problemSelect(
      'q_tailor_1',
      'What tailoring work do you need?',
      'आपको किस प्रकार का दर्जी काम चाहिए?',
      [
        ['Alteration / fitting', 'अल्टरेशन / फिटिंग'],
        ['New stitching', 'नई सिलाई'],
        ['Blouse / suit stitching', 'ब्लाउज / सूट सिलाई'],
        ['Repair / tear fix', 'मरम्मत / फटा ठीक करना'],
        ['Uniform stitching', 'यूनिफॉर्म सिलाई'],
        ['Curtain / home fabric', 'पर्दा / घर का कपड़ा'],
      ],
    ),
  ],
  Barber: [
    problemSelect(
      'q_barber_1',
      'What grooming service do you need?',
      'आपको किस प्रकार की सेवा चाहिए?',
      [
        ['Haircut', 'हेयरकट'],
        ['Beard trim / shave', 'दाढ़ी ट्रिम / शेव'],
        ['Hair + beard', 'हेयर + दाढ़ी'],
        ['Kids haircut', 'बच्चों का हेयरकट'],
        ['Home visit grooming', 'घर आकर सेवा'],
        ['Hair colour / styling', 'हेयर कलर / स्टाइलिंग'],
      ],
    ),
  ],
  Mason: [
    problemSelect(
      'q_mason_1',
      'What masonry work do you need?',
      'आपको किस प्रकार का राजमिस्त्री काम चाहिए?',
      [
        ['Wall construction / repair', 'दीवार बनाना / मरम्मत'],
        ['Plaster work', 'प्लास्टर काम'],
        ['Flooring work', 'फर्श का काम'],
        ['Bathroom / kitchen civil work', 'बाथरूम / किचन सिविल वर्क'],
        ['Crack / damp repair', 'दरार / नमी मरम्मत'],
        ['Small renovation help', 'छोटा रेनोवेशन मदद'],
      ],
    ),
  ],
  'Labour / Helper': [
    problemSelect(
      'q_labour_1',
      'What helper work do you need?',
      'आपको किस प्रकार की मदद चाहिए?',
      [
        ['Loading / unloading', 'लोडिंग / अनलोडिंग'],
        ['House shifting help', 'घर शिफ्टिंग मदद'],
        ['Construction helper', 'निर्माण सहायक'],
        ['Cleaning / clearing help', 'सफाई / साफ करने में मदद'],
        ['Garden / outdoor help', 'बगीचा / बाहर मदद'],
        ['One-day labour', 'एक दिन का मजदूर'],
      ],
    ),
  ],
  Welding: [
    problemSelect(
      'q_welding_1',
      'What welding work do you need?',
      'आपको किस प्रकार का वेल्डिंग काम चाहिए?',
      [
        ['Gate / grill repair', 'गेट / ग्रिल मरम्मत'],
        ['New gate / grill', 'नया गेट / ग्रिल'],
        ['Window / railing welding', 'खिड़की / रेलिंग वेल्डिंग'],
        ['Broken metal repair', 'टूटी धातु मरम्मत'],
        ['Shade / shed fabrication', 'शेड / छाया बनाना'],
        ['Furniture metal work', 'फर्नीचर मेटल वर्क'],
      ],
    ),
  ],
  'Pump / Motor Repair': [
    problemSelect(
      'q_pump_1',
      'What pump / motor problem are you facing?',
      'पंप / मोटर की क्या समस्या है?',
      [
        ['Motor not starting', 'मोटर स्टार्ट नहीं हो रही'],
        ['No water / low pressure', 'पानी नहीं / दबाव कम'],
        ['Motor noise / overheating', 'मोटर आवाज / गर्म होना'],
        ['Rewinding needed', 'रीवाइंडिंग चाहिए'],
        ['Installation', 'इंस्टॉलेशन'],
        ['Switch / starter issue', 'स्विच / स्टार्टर समस्या'],
      ],
    ),
  ],
  'Tractor Driver': [
    problemSelect(
      'q_tractor_1',
      'What tractor help do you need?',
      'ट्रैक्टर से जुड़ी क्या मदद चाहिए?',
      [
        ['Field ploughing', 'खेत जोतना'],
        ['Transport / trolley work', 'ट्रांसपोर्ट / ट्रॉली काम'],
        ['Farm equipment work', 'कृषि औजार काम'],
        ['Short distance haul', 'कम दूरी ढुलाई'],
        ['Full-day tractor with driver', 'पूरे दिन ट्रैक्टर ड्राइवर सहित'],
      ],
    ),
  ],
  'CCTV Service': [
    problemSelect(
      'q_cctv_1',
      'What CCTV help do you need?',
      'सीसीटीवी की क्या मदद चाहिए?',
      [
        ['New CCTV installation', 'नया सीसीटीवी लगवाना'],
        ['Camera not working', 'कैमरा काम नहीं कर रहा'],
        ['DVR / NVR issue', 'DVR / NVR समस्या'],
        ['Remote viewing setup', 'रिमोट देखने का सेटअप'],
        ['Cable / power issue', 'केबल / पावर समस्या'],
        ['Add extra camera', 'अतिरिक्त कैमरा जोड़ना'],
      ],
    ),
  ],
  'Internet / Wi-Fi Technician': [
    problemSelect(
      'q_wifi_1',
      'What internet / Wi-Fi help do you need?',
      'इंटरनेट / वाई-फाई की क्या मदद चाहिए?',
      [
        ['No internet', 'इंटरनेट नहीं चल रहा'],
        ['Slow Wi-Fi', 'वाई-फाई धीमा है'],
        ['Router setup / reset', 'राउटर सेटअप / रीसेट'],
        ['New connection help', 'नया कनेक्शन मदद'],
        ['Wiring / LAN issue', 'वायरिंग / LAN समस्या'],
        ['Extend Wi-Fi coverage', 'वाई-फाई कवरेज बढ़ाना'],
      ],
    ),
  ],
  Other: [
    problemSelect(
      'q_other_1',
      'What kind of help do you need?',
      'आपको किस प्रकार की मदद चाहिए?',
      [
        ['Repair / fix', 'मरम्मत / ठीक करना'],
        ['Installation / setup', 'इंस्टॉलेशन / सेटअप'],
        ['Inspection / visit', 'जांच / विजिट'],
        ['Pickup / delivery help', 'पिकअप / डिलीवरी मदद'],
        ['General home help', 'सामान्य घर की मदद'],
      ],
    ),
  ],
};

function genericQuestionnaire(serviceName) {
  const slug = String(serviceName || 'service')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);
  return [
    problemSelect(
      `q_${slug || 'service'}_1`,
      "What's the problem?",
      'समस्या क्या है?',
      [
        ['General service needed', 'सामान्य सेवा चाहिए'],
        ['Repair / fix needed', 'मरम्मत चाहिए'],
        ['Installation / setup', 'इंस्टॉलेशन / सेटअप'],
        ['Inspection / visit', 'जांच / विजिट'],
      ],
    ),
  ];
}

function resolveQuestionnaire(name) {
  if (QUESTIONNAIRES[name]) return QUESTIONNAIRES[name];
  const key = Object.keys(QUESTIONNAIRES).find(
    (k) => k.toLowerCase() === String(name || '').toLowerCase(),
  );
  return key ? QUESTIONNAIRES[key] : genericQuestionnaire(name);
}

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(fullUri);
  console.log('Connected');

  const collection = mongoose.connection.db.collection('serviceCategories');
  const categories = await collection
    .find({}, {projection: {_id: 1, name: 1, nameHi: 1, questionnaire: 1}})
    .sort({order: 1, name: 1})
    .toArray();

  if (!categories.length) {
    console.error('No service categories found.');
    process.exitCode = 1;
    return;
  }

  let updated = 0;
  for (const cat of categories) {
    const questionnaire = resolveQuestionnaire(cat.name);
    const result = await collection.updateOne(
      {_id: cat._id},
      {
        $set: {
          questionnaire,
          updatedAt: new Date(),
        },
      },
    );
    const optionCount = questionnaire.reduce(
      (n, q) => n + (q.options?.length || 0),
      0,
    );
    const mapped = QUESTIONNAIRES[cat.name] ? 'mapped' : 'generic';
    console.log(
      `${result.modifiedCount ? 'updated' : 'unchanged'}  ${cat.name}  (${mapped}, ${questionnaire.length} q, ${optionCount} options)`,
    );
    if (result.modifiedCount) updated += 1;
  }

  console.log(`\nDone. Updated ${updated}/${categories.length} categories.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
