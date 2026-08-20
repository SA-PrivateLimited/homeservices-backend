/**
 * Category section helpers — always read from MongoDB.
 */

const ServiceCategorySection = require('../models/ServiceCategorySection');
const {
  DEFAULT_CATEGORY_SECTIONS,
} = require('../constants/defaultCategorySections');

let ensurePromise = null;

async function ensureDefaultSections() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      const count = await ServiceCategorySection.countDocuments();
      if (count > 0) return;
      const now = new Date();
      await ServiceCategorySection.insertMany(
        DEFAULT_CATEGORY_SECTIONS.map((row) => ({
          ...row,
          createdAt: now,
          updatedAt: now,
        })),
      );
    } finally {
      ensurePromise = null;
    }
  })();
  return ensurePromise;
}

async function listSections({includeInactive = false} = {}) {
  await ensureDefaultSections();
  const filter = includeInactive ? {} : {isActive: {$ne: false}};
  return ServiceCategorySection.find(filter).sort({order: 1, _id: 1}).lean();
}

async function buildSectionMap({includeInactive = true} = {}) {
  const rows = await listSections({includeInactive});
  const map = new Map();
  for (const row of rows) {
    map.set(String(row._id), row);
  }
  return map;
}

function fallbackOther(map) {
  return (
    map.get('other') || {
      _id: 'other',
      labelEn: 'Other',
      labelHi: 'अन्य',
      order: 99,
      isActive: true,
    }
  );
}

function resolveSection(map, sectionKey) {
  const key = String(sectionKey || 'other').trim() || 'other';
  return map.get(key) || fallbackOther(map);
}

function toPublicSection(row) {
  return {
    key: String(row._id),
    labelEn: row.labelEn,
    labelHi: row.labelHi,
    order: typeof row.order === 'number' ? row.order : 100,
    isActive: row.isActive !== false,
  };
}

function withSectionLabels(category, map) {
  const section = resolveSection(map, category.sectionKey);
  return {
    ...category,
    sectionKey: String(section._id || 'other'),
    sectionLabelEn: section.labelEn,
    sectionLabelHi: section.labelHi,
  };
}

module.exports = {
  ensureDefaultSections,
  listSections,
  buildSectionMap,
  resolveSection,
  toPublicSection,
  withSectionLabels,
};
