/**
 * Admin contact-privacy settings — global provider phone visibility policy.
 */

const SystemConfig = require('../../models/SystemConfig');
const ContactPolicyAudit = require('../../models/ContactPolicyAudit');
const {
  PROVIDER_CONTACT_POLICIES,
  POLICY_SET,
} = require('../../utils/providerContactPolicy');
const {
  getContactSettings,
  invalidateContactSettingsCache,
} = require('../../services/contactPolicyService');
const {createHttpError} = require('../../utils/assetValidation');

function publicSettings(settings) {
  return {
    providerContactPolicy: settings.providerContactPolicy,
    serviceOverrides: settings.serviceOverrides || {},
    policies: Object.values(PROVIDER_CONTACT_POLICIES),
  };
}

exports.getContactPrivacySettings = async (req, res, next) => {
  try {
    const settings = await getContactSettings();
    res.json({
      success: true,
      data: publicSettings(settings),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateContactPrivacySettings = async (req, res, next) => {
  try {
    const raw = String(req.body?.providerContactPolicy || '').trim();
    if (!raw) {
      throw createHttpError(400, 'providerContactPolicy is required', 'Bad Request');
    }
    const nextPolicy = raw.toUpperCase().replace(/[\s-]+/g, '_');
    if (!POLICY_SET.has(nextPolicy)) {
      throw createHttpError(
        400,
        `providerContactPolicy must be one of: ${Object.values(PROVIDER_CONTACT_POLICIES).join(', ')}`,
        'Bad Request',
      );
    }

    const current = await getContactSettings();
    const previousPolicy = current.providerContactPolicy;

    if (previousPolicy === nextPolicy) {
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
          providerContactPolicy: nextPolicy,
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

    await ContactPolicyAudit.create({
      previousPolicy,
      newPolicy: nextPolicy,
      changedBy: String(req.user?.uid || ''),
      changedAt: new Date(),
    });

    invalidateContactSettingsCache();
    const settings = await getContactSettings();

    res.json({
      success: true,
      data: publicSettings(settings),
      message: 'Provider contact policy updated',
    });
  } catch (error) {
    next(error);
  }
};

exports.listContactPrivacyAudit = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const rows = await ContactPolicyAudit.find({})
      .sort({changedAt: -1})
      .limit(limit)
      .lean();
    res.json({
      success: true,
      data: rows.map((row) => ({
        previousPolicy: row.previousPolicy,
        newPolicy: row.newPolicy,
        changedBy: row.changedBy,
        changedAt: row.changedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};
