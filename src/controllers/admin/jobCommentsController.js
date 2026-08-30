/**
 * Admin settings — enable/disable job-card chat (comments).
 */

const SystemConfig = require('../../models/SystemConfig');
const {
  normalizeAllowJobCardComments,
  isJobCardCommentsEnabled,
  invalidateJobCardCommentsPolicyCache,
} = require('../../services/jobCardCommentsPolicyService');
const {createHttpError} = require('../../utils/assetValidation');

function publicSettings(enabled) {
  return {
    allowJobCardComments: enabled,
  };
}

exports.getJobCommentsSettings = async (req, res, next) => {
  try {
    const enabled = await isJobCardCommentsEnabled();
    res.json({
      success: true,
      data: publicSettings(enabled),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateJobCommentsSettings = async (req, res, next) => {
  try {
    const raw = req.body?.allowJobCardComments;
    if (raw === undefined || raw === null) {
      throw createHttpError(
        400,
        'allowJobCardComments is required (boolean)',
        'Bad Request',
      );
    }
    const nextEnabled = normalizeAllowJobCardComments(raw);

    const current = await isJobCardCommentsEnabled();
    if (current === nextEnabled) {
      return res.json({
        success: true,
        data: publicSettings(current),
        message: 'No change',
      });
    }

    const updated = await SystemConfig.findByIdAndUpdate(
      'global',
      {
        $set: {
          allowJobCardComments: nextEnabled,
          updatedAt: new Date(),
          updatedBy: req.user?.uid || null,
        },
      },
      {new: true},
    );
    if (!updated) {
      throw createHttpError(
        500,
        'System configuration is missing',
        'Config Error',
      );
    }

    invalidateJobCardCommentsPolicyCache();
    const enabled = await isJobCardCommentsEnabled();

    res.json({
      success: true,
      data: publicSettings(enabled),
      message: nextEnabled
        ? 'Job chat is now enabled for customers and partners'
        : 'Job chat is now disabled for customers and partners',
    });
  } catch (error) {
    next(error);
  }
};
