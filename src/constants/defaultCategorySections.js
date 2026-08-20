/**
 * Default browse sections — seeded into Mongo once if collection is empty.
 * Runtime source of truth is the serviceCategorySections collection.
 */

const DEFAULT_CATEGORY_SECTIONS = [
  {
    _id: 'home_repair',
    labelEn: 'Home Repair & Services',
    labelHi: 'घर की मरम्मत और सेवाएँ',
    order: 1,
    isActive: true,
  },
  {
    _id: 'delivery',
    labelEn: 'Delivery & Local Help',
    labelHi: 'डिलीवरी और स्थानीय सहायता',
    order: 2,
    isActive: true,
  },
  {
    _id: 'transport',
    labelEn: 'Transport & Agriculture',
    labelHi: 'ट्रांसपोर्ट और कृषि',
    order: 3,
    isActive: true,
  },
  {
    _id: 'personal',
    labelEn: 'Personal Services',
    labelHi: 'व्यक्तिगत सेवाएँ',
    order: 4,
    isActive: true,
  },
  {
    _id: 'other',
    labelEn: 'Other',
    labelHi: 'अन्य',
    order: 99,
    isActive: true,
  },
];

module.exports = {DEFAULT_CATEGORY_SECTIONS};
