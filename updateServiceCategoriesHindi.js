/**
 * Update Service Categories with Hindi Translations
 * Run with: node updateServiceCategoriesHindi.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://sandepkgupta1996_db_user:sandeep1234@prod-services.fakecfy.mongodb.net/';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'home-services';

const fullUri = MONGODB_URI.endsWith('/')
  ? `${MONGODB_URI}${MONGODB_DB_NAME}`
  : `${MONGODB_URI}/${MONGODB_DB_NAME}`;

// Hindi translations for service categories
const hindiTranslations = {
  'Plumber': {
    nameHi: 'प्लंबर',
    questionnaire: [
      {
        id: 'q_plumber_1',
        question: 'What type of plumbing issue are you experiencing?',
        questionHi: 'आपको किस प्रकार की प्लंबिंग समस्या हो रही है?',
        type: 'select',
        options: ['Leaking pipes', 'Clogged drains', 'Water heater issues', 'Toilet repair', 'Faucet installation/repair', 'Pipe installation', 'Other'],
        optionsHi: ['पाइप से रिसाव', 'बंद नाली', 'वॉटर हीटर की समस्या', 'शौचालय मरम्मत', 'नल लगाना/मरम्मत', 'पाइप लगाना', 'अन्य'],
        required: true
      },
      {
        id: 'q_plumber_2',
        question: 'Is this an emergency?',
        questionHi: 'क्या यह आपातकालीन स्थिति है?',
        type: 'boolean',
        required: true
      }
    ]
  },
  'Electrician': {
    nameHi: 'इलेक्ट्रीशियन',
    questionnaire: [
      {
        id: 'q_electrician_1',
        question: 'What electrical service do you need?',
        questionHi: 'आपको किस प्रकार की विद्युत सेवा चाहिए?',
        type: 'select',
        options: ['Wiring installation/repair', 'Light fixture installation', 'Circuit breaker issues', 'Outlet/switch repair', 'Electrical panel upgrade', 'Fan installation', 'Other'],
        optionsHi: ['वायरिंग लगाना/मरम्मत', 'लाइट फिक्स्चर लगाना', 'सर्किट ब्रेकर की समस्या', 'आउटलेट/स्विच मरम्मत', 'इलेक्ट्रिकल पैनल अपग्रेड', 'पंखा लगाना', 'अन्य'],
        required: true
      },
      {
        id: 'q_electrician_2',
        question: 'Is there a power outage or safety hazard?',
        questionHi: 'क्या बिजली गुल है या सुरक्षा खतरा है?',
        type: 'boolean',
        required: true
      }
    ]
  },
  'Carpenter': {
    nameHi: 'बढ़ई',
    questionnaire: [
      {
        id: 'q_carpenter_1',
        question: 'What type of carpentry work do you need?',
        questionHi: 'आपको किस प्रकार का बढ़ईगीरी का काम चाहिए?',
        type: 'select',
        options: ['Furniture repair', 'Custom furniture', 'Door/window installation', 'Cabinet installation', 'Deck/fence building', 'Shelving installation', 'Other'],
        optionsHi: ['फर्नीचर मरम्मत', 'कस्टम फर्नीचर', 'दरवाजा/खिड़की लगाना', 'कैबिनेट लगाना', 'डेक/बाड़ बनाना', 'शेल्फ लगाना', 'अन्य'],
        required: true
      },
      {
        id: 'q_carpenter_2',
        question: 'Do you have materials or need carpenter to provide them?',
        questionHi: 'क्या आपके पास सामग्री है या बढ़ई से लाने की जरूरत है?',
        type: 'select',
        options: ['I have materials', 'Carpenter should provide materials', 'Need consultation'],
        optionsHi: ['मेरे पास सामग्री है', 'बढ़ई सामग्री लाएं', 'परामर्श चाहिए'],
        required: true
      },
      {
        id: 'q_carpenter_3',
        question: 'Project details',
        questionHi: 'प्रोजेक्ट विवरण',
        type: 'text',
        placeholder: 'Describe the carpentry project...',
        placeholderHi: 'बढ़ईगीरी प्रोजेक्ट का वर्णन करें...',
        required: false
      }
    ]
  },
  'Painter': {
    nameHi: 'पेंटर',
    questionnaire: [
      {
        id: 'q_painter_1',
        question: 'What type of painting service?',
        questionHi: 'किस प्रकार की पेंटिंग सेवा चाहिए?',
        type: 'select',
        options: ['Interior painting', 'Exterior painting', 'Wall texturing', 'Wallpaper installation/removal', 'Touch-up painting', 'Other'],
        optionsHi: ['अंदर की पेंटिंग', 'बाहर की पेंटिंग', 'वॉल टेक्सचरिंग', 'वॉलपेपर लगाना/हटाना', 'टच-अप पेंटिंग', 'अन्य'],
        required: true
      },
      {
        id: 'q_painter_2',
        question: 'How many rooms or area size?',
        questionHi: 'कितने कमरे या क्षेत्र का आकार?',
        type: 'text',
        placeholder: 'e.g., 3 rooms or 500 sq ft',
        placeholderHi: 'जैसे, 3 कमरे या 500 वर्ग फीट',
        required: true
      },
      {
        id: 'q_painter_3',
        question: 'Do you have paint or need painter to provide?',
        questionHi: 'क्या आपके पास पेंट है या पेंटर से लेना है?',
        type: 'select',
        options: ['I have paint', 'Painter should provide paint', 'Need color consultation'],
        optionsHi: ['मेरे पास पेंट है', 'पेंटर पेंट लाएं', 'रंग परामर्श चाहिए'],
        required: true
      }
    ]
  },
  'AC Repair': {
    nameHi: 'एसी मरम्मत',
    questionnaire: [
      {
        id: 'q_ac_1',
        question: 'What AC service do you need?',
        questionHi: 'आपको किस प्रकार की एसी सेवा चाहिए?',
        type: 'select',
        options: ['AC not cooling', 'AC installation', 'AC maintenance/servicing', 'Gas refilling', 'AC making noise', 'Water leakage', 'Other'],
        optionsHi: ['एसी ठंडा नहीं कर रहा', 'एसी लगवाना', 'एसी सर्विसिंग', 'गैस भरवाना', 'एसी से आवाज आ रही है', 'पानी का रिसाव', 'अन्य'],
        required: true
      },
      {
        id: 'q_ac_2',
        question: 'AC type and capacity',
        questionHi: 'एसी का प्रकार और क्षमता',
        type: 'text',
        placeholder: 'e.g., Split AC, 1.5 ton',
        placeholderHi: 'जैसे, स्प्लिट एसी, 1.5 टन',
        required: false
      },
      {
        id: 'q_ac_3',
        question: 'Additional details',
        questionHi: 'अतिरिक्त विवरण',
        type: 'text',
        placeholder: 'Describe the AC issue...',
        placeholderHi: 'एसी की समस्या का वर्णन करें...',
        required: false
      }
    ]
  },
  'Cleaning Service': {
    nameHi: 'सफाई सेवा',
    questionnaire: [
      {
        id: 'q_cleaning_1',
        question: 'What type of cleaning service?',
        questionHi: 'किस प्रकार की सफाई सेवा चाहिए?',
        type: 'select',
        options: ['Deep cleaning', 'Regular cleaning', 'Move-in/move-out cleaning', 'Kitchen cleaning', 'Bathroom cleaning', 'Carpet cleaning', 'Other'],
        optionsHi: ['गहरी सफाई', 'नियमित सफाई', 'शिफ्टिंग सफाई', 'किचन सफाई', 'बाथरूम सफाई', 'कालीन सफाई', 'अन्य'],
        required: true
      },
      {
        id: 'q_cleaning_2',
        question: 'Property size',
        questionHi: 'संपत्ति का आकार',
        type: 'text',
        placeholder: 'e.g., 2 BHK or 1000 sq ft',
        placeholderHi: 'जैसे, 2 BHK या 1000 वर्ग फीट',
        required: true
      },
      {
        id: 'q_cleaning_3',
        question: 'Frequency',
        questionHi: 'कितनी बार',
        type: 'select',
        options: ['One-time', 'Weekly', 'Bi-weekly', 'Monthly'],
        optionsHi: ['एक बार', 'साप्ताहिक', 'पाक्षिक', 'मासिक'],
        required: true
      }
    ]
  },
  'Driver': {
    nameHi: 'ड्राइवर',
    questionnaire: [
      {
        id: 'q_driver_1',
        question: 'What type of driver service do you need?',
        questionHi: 'आपको किस प्रकार की ड्राइवर सेवा चाहिए?',
        type: 'select',
        options: ['Personal driver', 'Chauffeur service', 'Delivery driver', 'Airport pickup/drop', 'Outstation trip', 'Other'],
        optionsHi: ['पर्सनल ड्राइवर', 'चालक सेवा', 'डिलीवरी ड्राइवर', 'एयरपोर्ट पिकअप/ड्रॉप', 'आउटस्टेशन यात्रा', 'अन्य'],
        required: true
      },
      {
        id: 'q_driver_2',
        question: 'Duration of service',
        questionHi: 'सेवा की अवधि',
        type: 'select',
        options: ['Few hours', 'Full day', 'Multiple days', 'Monthly'],
        optionsHi: ['कुछ घंटे', 'पूरा दिन', 'कई दिन', 'मासिक'],
        required: true
      },
      {
        id: 'q_driver_3',
        question: 'Do you have a vehicle or need driver with vehicle?',
        questionHi: 'क्या आपके पास वाहन है या वाहन सहित ड्राइवर चाहिए?',
        type: 'select',
        options: ['I have vehicle', 'Driver should have vehicle'],
        optionsHi: ['मेरे पास वाहन है', 'ड्राइवर के पास वाहन हो'],
        required: true
      },
      {
        id: 'q_driver_4',
        question: 'Additional requirements',
        questionHi: 'अतिरिक्त आवश्यकताएं',
        type: 'text',
        placeholder: 'Any specific requirements or route details...',
        placeholderHi: 'कोई विशेष आवश्यकता या मार्ग विवरण...',
        required: false
      }
    ]
  },
  'Appliance Repair': {
    nameHi: 'उपकरण मरम्मत',
    questionnaire: [
      {
        id: 'q_appliance_1',
        question: 'Which appliance needs repair?',
        questionHi: 'किस उपकरण की मरम्मत चाहिए?',
        type: 'select',
        options: ['Washing machine', 'Refrigerator', 'Microwave', 'Dishwasher', 'Oven/Stove', 'Water purifier', 'Other'],
        optionsHi: ['वॉशिंग मशीन', 'रेफ्रिजरेटर', 'माइक्रोवेव', 'डिशवॉशर', 'ओवन/स्टोव', 'वॉटर प्यूरीफायर', 'अन्य'],
        required: true
      },
      {
        id: 'q_appliance_2',
        question: 'What is the issue?',
        questionHi: 'समस्या क्या है?',
        type: 'text',
        placeholder: 'Describe the problem with your appliance...',
        placeholderHi: 'अपने उपकरण की समस्या का वर्णन करें...',
        required: true
      },
      {
        id: 'q_appliance_3',
        question: 'Brand and model (if known)',
        questionHi: 'ब्रांड और मॉडल (यदि पता हो)',
        type: 'text',
        placeholder: 'e.g., Samsung WA70H4200',
        placeholderHi: 'जैसे, Samsung WA70H4200',
        required: false
      }
    ]
  }
};

async function updateServiceCategories() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(fullUri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('serviceCategories');

    for (const [name, data] of Object.entries(hindiTranslations)) {
      console.log(`\nUpdating ${name}...`);

      const result = await collection.updateOne(
        { name: name },
        {
          $set: {
            nameHi: data.nameHi,
            questionnaire: data.questionnaire,
            updatedAt: new Date()
          }
        }
      );

      if (result.matchedCount > 0) {
        console.log(`✅ Updated ${name} with Hindi translations`);
      } else {
        console.log(`⚠️ ${name} not found in database`);
      }
    }

    console.log('\n✅ All service categories updated with Hindi translations!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

updateServiceCategories();
