/**
 * Service Categories Controller (Shared)
 * Handles service category + browse section operations
 */

const ServiceCategory = require('../../models/ServiceCategory');
const ServiceCategorySection = require('../../models/ServiceCategorySection');
const {
  buildSectionMap,
  listSections,
  toPublicSection,
  withSectionLabels,
} = require('../../services/categorySectionsService');

function slugSectionKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\u0900-\u097f]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Get browse section definitions (public — active only)
 * Admin: ?includeInactive=true
 */
exports.getCategorySections = async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const rows = await listSections({includeInactive});
    const data = rows.map(toPublicSection);
    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create browse section (admin only)
 */
exports.createCategorySection = async (req, res, next) => {
  try {
    const key =
      slugSectionKey(req.body.key || req.body._id) ||
      slugSectionKey(req.body.labelEn);
    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Section key is required',
      });
    }
    const labelEn = String(req.body.labelEn || '').trim();
    const labelHi = String(req.body.labelHi || '').trim();
    if (!labelEn || !labelHi) {
      return res.status(400).json({
        success: false,
        error: 'labelEn and labelHi are required',
      });
    }

    const existing = await ServiceCategorySection.findById(key).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Section “${key}” already exists`,
      });
    }

    const now = new Date();
    const doc = await ServiceCategorySection.create({
      _id: key,
      labelEn,
      labelHi,
      order:
        typeof req.body.order === 'number'
          ? req.body.order
          : Number(req.body.order) || 100,
      isActive: req.body.isActive !== false,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({
      success: true,
      data: toPublicSection(doc.toObject()),
      message: 'Section created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update browse section (admin only)
 */
exports.updateCategorySection = async (req, res, next) => {
  try {
    const {sectionKey} = req.params;
    const $set = {updatedAt: new Date()};
    if (req.body.labelEn != null) $set.labelEn = String(req.body.labelEn).trim();
    if (req.body.labelHi != null) $set.labelHi = String(req.body.labelHi).trim();
    if (req.body.order != null) {
      $set.order =
        typeof req.body.order === 'number'
          ? req.body.order
          : Number(req.body.order) || 0;
    }
    if (req.body.isActive != null) $set.isActive = Boolean(req.body.isActive);

    if ($set.labelEn === '') {
      return res.status(400).json({success: false, error: 'labelEn is required'});
    }
    if ($set.labelHi === '') {
      return res.status(400).json({success: false, error: 'labelHi is required'});
    }

    const doc = await ServiceCategorySection.findByIdAndUpdate(
      sectionKey,
      {$set},
      {new: true},
    ).lean();

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Section not found',
      });
    }

    res.json({
      success: true,
      data: toPublicSection(doc),
      message: 'Section updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete browse section (admin only). Blocks deleting `other` or sections in use.
 */
exports.deleteCategorySection = async (req, res, next) => {
  try {
    const {sectionKey} = req.params;
    if (sectionKey === 'other') {
      return res.status(400).json({
        success: false,
        error: 'The “other” section cannot be deleted',
      });
    }

    const inUse = await ServiceCategory.countDocuments({sectionKey});
    if (inUse > 0) {
      return res.status(400).json({
        success: false,
        error: `Section is used by ${inUse} categor${inUse === 1 ? 'y' : 'ies'}. Reassign them first.`,
      });
    }

    const result = await ServiceCategorySection.findByIdAndDelete(sectionKey);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Section not found',
      });
    }

    res.json({
      success: true,
      message: 'Section deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all service categories (public)
 * Query params:
 * - includeInactive: if 'true', returns all categories (for admin)
 */
exports.getCategories = async (req, res, next) => {
  try {
    const {includeInactive} = req.query;
    const filter = includeInactive === 'true' ? {} : {isActive: true};

    const [categories, sectionMap] = await Promise.all([
      ServiceCategory.find(filter).sort({order: 1, name: 1}).lean(),
      buildSectionMap({includeInactive: true}),
    ]);

    const data = categories.map((c) => withSectionLabels(c, sectionMap));

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single category (public)
 */
exports.getCategoryById = async (req, res, next) => {
  try {
    const {categoryId} = req.params;
    const [category, sectionMap] = await Promise.all([
      ServiceCategory.findById(categoryId).lean(),
      buildSectionMap({includeInactive: true}),
    ]);

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found',
      });
    }

    res.json({
      success: true,
      data: withSectionLabels(category, sectionMap),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create category (admin only)
 */
exports.createCategory = async (req, res, next) => {
  try {
    const categoryData = {
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!categoryData._id) {
      categoryData._id = new (require('mongodb').ObjectId)().toString();
    }

    const category = new ServiceCategory(categoryData);
    await category.save();

    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update category (admin only)
 */
exports.updateCategory = async (req, res, next) => {
  try {
    const {categoryId} = req.params;
    const updateData = {
      ...req.body,
      updatedAt: new Date(),
    };

    const category = await ServiceCategory.findByIdAndUpdate(
      categoryId,
      {$set: updateData},
      {new: true},
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found',
      });
    }

    res.json({
      success: true,
      data: category,
      message: 'Category updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete category (admin only)
 */
exports.deleteCategory = async (req, res, next) => {
  try {
    const {categoryId} = req.params;
    const result = await ServiceCategory.findByIdAndDelete(categoryId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Category not found',
      });
    }

    res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
