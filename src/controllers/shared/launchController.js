/**
 * CustomerWeb controlled launch — status + completion.
 * Super Admin configures LAUNCH; public client may only complete LAUNCH → NORMAL.
 */

const SystemConfig = require('../../models/SystemConfig');
const {createHttpError} = require('../../utils/assetValidation');
const {ensureConfig} = require('../../utils/superAdmin');

const LAUNCH_STATES = Object.freeze({
  NORMAL: 'NORMAL',
  LAUNCH: 'LAUNCH',
});

function publicLaunchPayload(doc) {
  const state =
    doc?.websiteLaunchState === LAUNCH_STATES.LAUNCH
      ? LAUNCH_STATES.LAUNCH
      : LAUNCH_STATES.NORMAL;
  return {
    state,
    name: String(doc?.websiteLaunchName || '').trim(),
    message: String(doc?.websiteLaunchMessage || '').trim(),
  };
}

/**
 * GET /api/launch — public
 */
exports.getLaunchStatus = async (req, res, next) => {
  try {
    const doc = await SystemConfig.findById('global').lean();
    res.json({
      success: true,
      data: publicLaunchPayload(doc),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/launch/complete — public, idempotent LAUNCH → NORMAL only
 * Does not accept client-supplied state.
 */
exports.completeLaunch = async (req, res, next) => {
  try {
    const existing = await SystemConfig.findById('global').lean();
    const current =
      existing?.websiteLaunchState === LAUNCH_STATES.LAUNCH
        ? LAUNCH_STATES.LAUNCH
        : LAUNCH_STATES.NORMAL;

    if (current === LAUNCH_STATES.NORMAL) {
      return res.json({
        success: true,
        data: {
          state: LAUNCH_STATES.NORMAL,
          name: String(existing?.websiteLaunchName || '').trim(),
          message: String(existing?.websiteLaunchMessage || '').trim(),
        },
        message: 'Website already launched',
      });
    }

    const updated = await SystemConfig.findOneAndUpdate(
      {_id: 'global', websiteLaunchState: LAUNCH_STATES.LAUNCH},
      {
        $set: {
          websiteLaunchState: LAUNCH_STATES.NORMAL,
          websiteLaunchCompletedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: 'launch-complete',
        },
      },
      {new: true},
    );

    // Race: another request already completed
    if (!updated) {
      const latest = await SystemConfig.findById('global').lean();
      return res.json({
        success: true,
        data: publicLaunchPayload(latest),
        message: 'Website already launched',
      });
    }

    res.json({
      success: true,
      data: publicLaunchPayload(updated),
      message: 'Website launched',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/launch — Super Admin only: set state / name / message
 * Body: { state?: 'LAUNCH'|'NORMAL', name?: string, message?: string }
 */
exports.updateLaunchConfig = async (req, res, next) => {
  try {
    const body = req.body || {};
    const updates = {updatedAt: new Date(), updatedBy: req.user?.uid || null};

    if (body.state !== undefined) {
      const state = String(body.state || '')
        .trim()
        .toUpperCase();
      if (state !== LAUNCH_STATES.LAUNCH && state !== LAUNCH_STATES.NORMAL) {
        throw createHttpError(
          400,
          'state must be LAUNCH or NORMAL',
          'Bad Request',
        );
      }
      updates.websiteLaunchState = state;
      if (state === LAUNCH_STATES.LAUNCH) {
        updates.websiteLaunchCompletedAt = null;
      }
    }

    if (body.name !== undefined) {
      updates.websiteLaunchName = String(body.name || '')
        .trim()
        .slice(0, 200);
    }
    if (body.message !== undefined) {
      updates.websiteLaunchMessage = String(body.message || '')
        .trim()
        .slice(0, 2000);
    }

    if (
      updates.websiteLaunchState === undefined &&
      updates.websiteLaunchName === undefined &&
      updates.websiteLaunchMessage === undefined
    ) {
      throw createHttpError(
        400,
        'Provide state, name, and/or message',
        'Bad Request',
      );
    }

    await ensureConfig();
    const updated = await SystemConfig.findByIdAndUpdate(
      'global',
      {$set: updates},
      {new: true},
    );

    res.json({
      success: true,
      data: publicLaunchPayload(updated),
      message: 'Launch configuration updated',
    });
  } catch (error) {
    next(error);
  }
};

exports.LAUNCH_STATES = LAUNCH_STATES;
exports.publicLaunchPayload = publicLaunchPayload;
