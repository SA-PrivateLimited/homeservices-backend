/**
 * Admin settings — Partner verification mode (AUTO vs ADMIN approval).
 */

const SystemConfig = require('../../models/SystemConfig');
const {
  MODES,
  normalizePartnerVerificationMode,
  getPartnerVerificationMode,
  invalidatePartnerVerificationPolicyCache,
} = require('../../services/partnerVerificationPolicyService');
const {createHttpError} = require('../../utils/assetValidation');

function publicSettings(mode) {
  return {
    partnerVerificationMode: mode,
    modes: MODES,
  };
}

exports.getPartnerVerificationSettings = async (req, res, next) => {
  try {
    const mode = await getPartnerVerificationMode();
    res.json({
      success: true,
      data: publicSettings(mode),
    });
  } catch (error) {
    next(error);
  }
};

exports.updatePartnerVerificationSettings = async (req, res, next) => {
  try {
    const raw = String(req.body?.partnerVerificationMode || '').trim();
    if (!raw) {
      throw createHttpError(
        400,
        'partnerVerificationMode is required',
        'Bad Request',
      );
    }
    const nextMode = normalizePartnerVerificationMode(raw);
    if (!MODES.includes(nextMode)) {
      throw createHttpError(
        400,
        `partnerVerificationMode must be one of: ${MODES.join(', ')}`,
        'Bad Request',
      );
    }

    const current = await getPartnerVerificationMode();
    if (current === nextMode) {
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
          partnerVerificationMode: nextMode,
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

    invalidatePartnerVerificationPolicyCache();
    const mode = await getPartnerVerificationMode();

    res.json({
      success: true,
      data: publicSettings(mode),
      message: 'Partner verification policy updated',
    });
  } catch (error) {
    next(error);
  }
};
