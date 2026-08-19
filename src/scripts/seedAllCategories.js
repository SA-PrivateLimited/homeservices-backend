/**
 * Seed / upsert all 24 Akanso service categories with:
 *   - English + Hindi names
 *   - bilingual primary question
 *   - display order
 *   - isPopular flag (first 8 appear in the main Popular Services grid)
 *   - icon (Material Symbols name)
 *
 * Safe to run multiple times — uses upsert so existing data is not wiped.
 * Run: node src/scripts/seedAllCategories.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const q = (en, hi) => ({
  id: `q_${en.toLowerCase().replace(/\s+/g, '_').slice(0, 20)}`,
  question: en,
  questionHi: hi,
  type: 'text',
  required: false,
});

const CATEGORIES = [
  // ── Popular (isPopular: true) ──
  {
    _id: 'plumber',
    name: 'Plumber',
    nameHi: 'प्लंबर',
    description: 'Taps, pipes, and water leaks',
    descriptionHi: 'नल, पाइप और पानी टपकने की मरम्मत',
    icon: 'plumbing',
    order: 1,
    isPopular: true,
    questionnaire: [q('What needs to be repaired?', 'आपको किस चीज़ की मरम्मत चाहिए?')],
  },
  {
    _id: 'electrician',
    name: 'Electrician',
    nameHi: 'इलेक्ट्रीशियन',
    description: 'Wiring, switches, fans, and electrical repair',
    descriptionHi: 'बिजली, वायरिंग, स्विच और फैन का काम',
    icon: 'electrical_services',
    order: 2,
    isPopular: true,
    questionnaire: [q('What electrical problem are you facing?', 'बिजली से जुड़ी क्या समस्या है?')],
  },
  {
    _id: 'carpenter',
    name: 'Carpenter',
    nameHi: 'बढ़ई',
    description: 'Furniture and woodwork',
    descriptionHi: 'फर्नीचर और लकड़ी का काम',
    icon: 'carpenter',
    order: 3,
    isPopular: true,
    questionnaire: [q('What carpentry work do you need?', 'आपको कौन सा लकड़ी का काम चाहिए?')],
  },
  {
    _id: 'painter',
    name: 'Painter',
    nameHi: 'पेंटर',
    description: 'Wall painting and finishing',
    descriptionHi: 'दीवारों की पेंटिंग',
    icon: 'format_paint',
    order: 4,
    isPopular: true,
    questionnaire: [q('What do you want painted?', 'कौन सा हिस्सा पेंट करवाना है?')],
  },
  {
    _id: 'ac_repair',
    name: 'AC Repair',
    nameHi: 'एसी मरम्मत',
    description: 'AC installation and repair',
    descriptionHi: 'एसी इंस्टॉलेशन और मरम्मत',
    icon: 'ac_unit',
    order: 5,
    isPopular: true,
    questionnaire: [q('What is wrong with the AC?', 'AC में क्या समस्या है?')],
  },
  {
    _id: 'cleaning',
    name: 'Cleaning Service',
    nameHi: 'सफाई सेवा',
    description: 'Home and office cleaning',
    descriptionHi: 'घर और ऑफिस की सफाई',
    icon: 'cleaning_services',
    order: 6,
    isPopular: true,
    questionnaire: [q('What needs to be cleaned?', 'आपको किस जगह की सफाई चाहिए?')],
  },
  {
    _id: 'driver',
    name: 'Driver',
    nameHi: 'ड्राइवर',
    description: 'Personal and commercial driving',
    descriptionHi: 'पर्सनल और कमर्शियल ड्राइविंग',
    icon: 'drive_eta',
    order: 7,
    isPopular: true,
    questionnaire: [q('What type of driving service do you need?', 'आपको किस तरह की ड्राइविंग सेवा चाहिए?')],
  },
  {
    _id: 'appliance_repair',
    name: 'Appliance Repair',
    nameHi: 'उपकरण मरम्मत',
    description: 'Washing machine, fridge, etc.',
    descriptionHi: 'वॉशिंग मशीन, फ्रिज आदि',
    icon: 'home_repair_service',
    order: 8,
    isPopular: true,
    questionnaire: [q('Which appliance needs repair?', 'कौन सा उपकरण खराब है?')],
  },

  // ── Extended (isPopular: false — visible in "See all") ──
  {
    _id: 'medicine_delivery',
    name: 'Medicine Pickup & Delivery',
    nameHi: 'दवा लाने-ले जाने की सेवा',
    description: 'Pick up and deliver medicines from a medical store',
    descriptionHi: 'मेडिकल स्टोर से दवा लाकर घर पहुँचाना',
    icon: 'local_pharmacy',
    order: 9,
    isPopular: false,
    questionnaire: [q('Where should the medicine be picked up from?', 'दवा कहाँ से लानी है?')],
  },
  {
    _id: 'grocery_delivery',
    name: 'Grocery Pickup & Delivery',
    nameHi: 'किराना लाने-ले जाने की सेवा',
    description: 'Pick up and deliver groceries',
    descriptionHi: 'दुकान से सामान लाकर घर पहुँचाना',
    icon: 'shopping_basket',
    order: 10,
    isPopular: false,
    questionnaire: [q('Where should the groceries be picked up from?', 'सामान कहाँ से लाना है?')],
  },
  {
    _id: 'mobile_repair',
    name: 'Mobile Repair',
    nameHi: 'मोबाइल मरम्मत',
    description: 'Phone screen, battery, and hardware repair',
    descriptionHi: 'मोबाइल की स्क्रीन, बैटरी और हार्डवेयर मरम्मत',
    icon: 'phone_android',
    order: 11,
    isPopular: false,
    questionnaire: [q('What is wrong with the phone?', 'मोबाइल में क्या समस्या है?')],
  },
  {
    _id: 'ro_repair',
    name: 'RO / Water Purifier',
    nameHi: 'आरओ / पानी की मशीन',
    description: 'RO and water purifier installation and repair',
    descriptionHi: 'आरओ और पानी की मशीन की मरम्मत',
    icon: 'water_drop',
    order: 12,
    isPopular: false,
    questionnaire: [q('What is wrong with the water purifier?', 'पानी की मशीन में क्या समस्या है?')],
  },
  {
    _id: 'fridge_repair',
    name: 'Refrigerator Repair',
    nameHi: 'फ्रिज मरम्मत',
    description: 'Fridge cooling and compressor repair',
    descriptionHi: 'फ्रिज की कूलिंग और कंप्रेसर मरम्मत',
    icon: 'kitchen',
    order: 13,
    isPopular: false,
    questionnaire: [q('What is wrong with the refrigerator?', 'फ्रिज में क्या समस्या है?')],
  },
  {
    _id: 'washing_machine_repair',
    name: 'Washing Machine Repair',
    nameHi: 'वॉशिंग मशीन मरम्मत',
    description: 'Washing machine repair and servicing',
    descriptionHi: 'वॉशिंग मशीन की मरम्मत और सर्विसिंग',
    icon: 'local_laundry_service',
    order: 14,
    isPopular: false,
    questionnaire: [q('What is wrong with the washing machine?', 'वॉशिंग मशीन में क्या समस्या है?')],
  },
  {
    _id: 'bike_repair',
    name: 'Bike Repair',
    nameHi: 'बाइक मरम्मत',
    description: 'Motorcycle and bicycle repair',
    descriptionHi: 'मोटरसाइकिल और साइकिल की मरम्मत',
    icon: 'two_wheeler',
    order: 15,
    isPopular: false,
    questionnaire: [q('What is wrong with the bike?', 'बाइक में क्या समस्या है?')],
  },
  {
    _id: 'tailor',
    name: 'Tailor',
    nameHi: 'दर्जी',
    description: 'Stitching and clothing alterations',
    descriptionHi: 'कपड़े सिलाई और बदलाव',
    icon: 'checkroom',
    order: 16,
    isPopular: false,
    questionnaire: [q('What would you like stitched?', 'कौन सा कपड़ा सिलवाना है?')],
  },
  {
    _id: 'barber',
    name: 'Barber',
    nameHi: 'नाई',
    description: 'Hair cutting and grooming',
    descriptionHi: 'बाल काटना और ग्रूमिंग',
    icon: 'content_cut',
    order: 17,
    isPopular: false,
    questionnaire: [q('Which service do you need?', 'आपको कौन सी सेवा चाहिए?')],
  },
  {
    _id: 'mason',
    name: 'Mason',
    nameHi: 'राजमिस्त्री',
    description: 'Brickwork and construction',
    descriptionHi: 'ईंट का काम और निर्माण',
    icon: 'construction',
    order: 18,
    isPopular: false,
    questionnaire: [q('What construction work do you need?', 'किस तरह का निर्माण काम है?')],
  },
  {
    _id: 'labour_helper',
    name: 'Labour / Helper',
    nameHi: 'मजदूर / सहायक',
    description: 'General labour and helper services',
    descriptionHi: 'सामान्य मजदूरी और सहायता',
    icon: 'engineering',
    order: 19,
    isPopular: false,
    questionnaire: [q('What work do you need help with?', 'किस काम के लिए मदद चाहिए?')],
  },
  {
    _id: 'welding',
    name: 'Welding',
    nameHi: 'वेल्डिंग',
    description: 'Metal welding and fabrication',
    descriptionHi: 'धातु वेल्डिंग और फेब्रिकेशन',
    icon: 'hardware',
    order: 20,
    isPopular: false,
    questionnaire: [q('What needs welding?', 'किस चीज़ की वेल्डिंग चाहिए?')],
  },
  {
    _id: 'pump_motor_repair',
    name: 'Pump / Motor Repair',
    nameHi: 'पंप / मोटर मरम्मत',
    description: 'Water pump and motor repair',
    descriptionHi: 'पानी के पंप और मोटर की मरम्मत',
    icon: 'water_pump',
    order: 21,
    isPopular: false,
    questionnaire: [q('What is wrong with the pump or motor?', 'पंप या मोटर में क्या समस्या है?')],
  },
  {
    _id: 'tractor_driver',
    name: 'Tractor Driver',
    nameHi: 'ट्रैक्टर ड्राइवर',
    description: 'Tractor driving for agriculture or transport',
    descriptionHi: 'खेती या ढुलाई के लिए ट्रैक्टर ड्राइवर',
    icon: 'agriculture',
    order: 22,
    isPopular: false,
    questionnaire: [q('What do you need the tractor for?', 'ट्रैक्टर किस काम के लिए चाहिए?')],
  },
  {
    _id: 'cctv_service',
    name: 'CCTV Service',
    nameHi: 'सीसीटीवी सेवा',
    description: 'CCTV installation and repair',
    descriptionHi: 'सीसीटीवी लगाना और मरम्मत',
    icon: 'videocam',
    order: 23,
    isPopular: false,
    questionnaire: [q('Do you need installation or repair?', 'नया लगाना है या मरम्मत करनी है?')],
  },
  {
    _id: 'wifi_technician',
    name: 'Internet / Wi-Fi Technician',
    nameHi: 'इंटरनेट / वाई-फाई तकनीशियन',
    description: 'Internet and Wi-Fi setup and troubleshooting',
    descriptionHi: 'इंटरनेट और वाई-फाई सेटअप और समस्या समाधान',
    icon: 'wifi',
    order: 24,
    isPopular: false,
    questionnaire: [q('What is wrong with the internet?', 'इंटरनेट में क्या समस्या है?')],
  },
  {
    _id: 'other',
    name: 'Other',
    nameHi: 'अन्य',
    description: 'Other home or local services',
    descriptionHi: 'अन्य घरेलू या स्थानीय सेवाएँ',
    icon: 'miscellaneous_services',
    order: 99,
    isPopular: false,
    questionnaire: [q('What service do you need?', 'आपको किस सेवा की ज़रूरत है?')],
  },
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const ServiceCategory = require('../models/ServiceCategory');
  let upserted = 0;

  for (const cat of CATEGORIES) {
    await ServiceCategory.updateOne(
      {_id: cat._id},
      {
        $set: {
          ...cat,
          isActive: true,
          updatedAt: new Date(),
        },
        $setOnInsert: {createdAt: new Date()},
      },
      {upsert: true},
    );
    upserted++;
  }

  console.log(`\nUpserted ${upserted} categories.`);

  const all = await ServiceCategory.find({}).sort({order: 1}).lean();
  console.log('\nFinal state:');
  all.forEach((c) =>
    console.log(
      `  [${c.isPopular ? 'POPULAR' : '       '}] ${String(c.order).padStart(2)} ${c.name.padEnd(32)} ${c.nameHi || ''}`,
    ),
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
