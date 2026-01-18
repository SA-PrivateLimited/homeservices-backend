/**
 * Service Categories Controller (Shared)
 * Handles service category operations
 */

const ServiceCategory = require('../../models/ServiceCategory');

/**
 * Get all service categories (public)
 */
exports.getCategories = async (req, res, next) => {
  try {
    const categories = await ServiceCategory.find({enabled: true})
      .sort({name: 1})
      .lean();

    res.json({
      success: true,
      data: categories,
      count: categories.length,
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
    const category = await ServiceCategory.findById(categoryId);

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found',
      });
    }

    res.json({
      success: true,
      data: category,
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

    // Generate ID if not provided
    if (!categoryData._id) {
      categoryData._id = require('mongodb').ObjectId().toString();
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
