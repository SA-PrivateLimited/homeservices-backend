/**
 * Admin — area provider demand (customers requesting services not available nearby)
 */

const AreaProviderDemand = require('../../models/AreaProviderDemand');
const ADMIN_LIST_SORT = require('../../utils/adminListSort');

exports.listAreaProviderDemands = async (req, res, next) => {
  try {
    const {status = 'open', limit = 50, offset = 0} = req.query;
    const query = {};
    if (status && status !== 'all') {
      query.status = String(status);
    }

    const [rows, total] = await Promise.all([
      AreaProviderDemand.find(query)
        .sort(ADMIN_LIST_SORT)
        .limit(Math.min(parseInt(limit, 10) || 50, 200))
        .skip(parseInt(offset, 10) || 0)
        .lean(),
      AreaProviderDemand.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: rows,
      count: rows.length,
      total,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateAreaProviderDemand = async (req, res, next) => {
  try {
    const {id} = req.params;
    const updates = {};
    if (req.body.status) updates.status = String(req.body.status);
    if (req.body.adminNotes !== undefined) {
      updates.adminNotes = String(req.body.adminNotes || '');
    }

    const doc = await AreaProviderDemand.findByIdAndUpdate(
      id,
      {$set: updates},
      {new: true},
    ).lean();

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Demand not found',
        message: 'Demand not found',
      });
    }

    res.json({success: true, data: doc});
  } catch (error) {
    next(error);
  }
};
