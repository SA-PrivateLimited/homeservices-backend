/**
 * Admin settings — allow offline providers to receive/accept open requests.
 */

const SystemConfig = require('../../models/SystemConfig');
const {
  normalizeAllowOfflineProviderOpenRequests,
  isOfflineOpenRequestsEnabled,
  invalidateProviderOpenRequestPolicyCache,
} = require('../../services/providerOpenRequestPolicyService');
const {createHttpError} = require('../../utils/assetValidation');

function publicSettings(enabled) {
  return {
    allowOfflineProviderOpenRequests: enabled,
  };
}

exports.getProviderOpenRequestSettings = async (req, res, next) => {
  try {
    const enabled = await isOfflineOpenRequestsEnabled();
    res.json({
      success: true,
      data: publicSettings(enabled),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateProviderOpenRequestSettings = async (req, res, next) => {
  try {
    const raw = req.body?.allowOfflineProviderOpenRequests;
    if (raw === undefined || raw === null) {
      throw createHttpError(
        400,
        'allowOfflineProviderOpenRequests is required (boolean)',
        'Bad Request',
      );
    }
    const nextEnabled = normalizeAllowOfflineProviderOpenRequests(raw);

    const current = await isOfflineOpenRequestsEnabled();
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
          allowOfflineProviderOpenRequests: nextEnabled,
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

    invalidateProviderOpenRequestPolicyCache();
    const enabled = await isOfflineOpenRequestsEnabled();

    res.json({
      success: true,
      data: publicSettings(enabled),
      message: nextEnabled
        ? 'Offline partners can now receive open requests'
        : 'Open requests require partners to be online',
    });
  } catch (error) {
    next(error);
  }
};
