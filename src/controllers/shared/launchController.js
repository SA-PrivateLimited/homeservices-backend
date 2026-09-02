/**
 * CustomerWeb greeting gate — Super Admin configures; public GET/complete.
 */

const {randomUUID} = require('crypto');
const SystemConfig = require('../../models/SystemConfig');
const User = require('../../models/User');
const {createHttpError} = require('../../utils/assetValidation');
const {ensureConfig} = require('../../utils/superAdmin');
const {
  LAUNCH_WISH_ICONS,
  LAUNCH_GREETING_PRESETS,
  CLOSE_MODES,
  normalizeEventName,
  normalizeWishIcon,
  normalizeLogoAccentUrl,
  normalizeGreeting,
  normalizeCta,
  normalizeCloseMode,
  normalizeCountdownSeconds,
  normalizeTimerEndsAt,
  isGreetingTimerExpired,
  normalizeDoodleEnabled,
  isDoodleActive,
  normalizeAnimationMode,
  resolveLaunchAnimation,
} = require('../../utils/launchWishConfig');

const LAUNCH_STATES = Object.freeze({
  NORMAL: 'NORMAL',
  LAUNCH: 'LAUNCH',
});

function publicDoodlePayload(doc) {
  return {
    doodleEnabled: normalizeDoodleEnabled(doc?.websiteLaunchDoodleEnabled),
    doodleEndsAt: normalizeTimerEndsAt(doc?.websiteLaunchDoodleEndsAt),
    doodleActive: isDoodleActive(
      doc?.websiteLaunchDoodleEnabled,
      doc?.websiteLaunchDoodleEndsAt,
    ),
    icon: normalizeWishIcon(doc?.websiteLaunchIcon),
    logoAccentUrl: normalizeLogoAccentUrl(doc?.websiteLaunchLogoAccentUrl),
  };
}

function publicLaunchPayload(doc, {viewerSeen = false} = {}) {
  const timerEndsAt = normalizeTimerEndsAt(doc?.websiteLaunchTimerEndsAt);
  const expired = isGreetingTimerExpired(timerEndsAt);
  const globalLaunch =
    doc?.websiteLaunchState === LAUNCH_STATES.LAUNCH && !expired;
  const closeMode = normalizeCloseMode(doc?.websiteLaunchCloseMode);
  const waveId = String(doc?.websiteLaunchWaveId || '').trim() || 'default';
  let state = globalLaunch ? LAUNCH_STATES.LAUNCH : LAUNCH_STATES.NORMAL;
  if (globalLaunch && closeMode === CLOSE_MODES.PER_PERSON && viewerSeen) {
    state = LAUNCH_STATES.NORMAL;
  }
  const greeting = normalizeGreeting(doc?.websiteLaunchGreeting);
  const animationMode = normalizeAnimationMode(doc?.websiteLaunchAnimation);
  return {
    state,
    occasionActive: globalLaunch,
    closeMode,
    waveId,
    eventName: normalizeEventName(doc?.websiteLaunchEventName),
    greeting,
    cta: normalizeCta(doc?.websiteLaunchCta, greeting),
    countdownSeconds: normalizeCountdownSeconds(
      doc?.websiteLaunchCountdownSeconds,
    ),
    timerEndsAt,
    animationMode,
    animation: resolveLaunchAnimation(animationMode, greeting),
    name: String(doc?.websiteLaunchName || '').trim(),
    message: String(doc?.websiteLaunchMessage || '').trim(),
    ...publicDoodlePayload(doc),
  };
}

function viewerHasSeenWave(userDoc, waveId) {
  const seen = String(userDoc?.websiteLaunchSeenWaveId || '').trim();
  return Boolean(seen && waveId && seen === waveId);
}

function isAdminAudience(req) {
  const role = req.user?.activeRole || req.user?.role;
  return role === 'admin';
}

exports.getLaunchStatus = async (req, res, next) => {
  try {
    const doc = await SystemConfig.findById('global').lean();
    const waveId = String(doc?.websiteLaunchWaveId || '').trim() || 'default';
    const viewerSeen =
      isAdminAudience(req) ? false : viewerHasSeenWave(req.userDoc, waveId);
    res.json({
      success: true,
      data: publicLaunchPayload(doc, {viewerSeen}),
    });
  } catch (error) {
    next(error);
  }
};

exports.completeLaunch = async (req, res, next) => {
  try {
    const existing = await SystemConfig.findById('global').lean();
    const closeMode = normalizeCloseMode(existing?.websiteLaunchCloseMode);
    const waveId =
      String(existing?.websiteLaunchWaveId || '').trim() || 'default';
    const current =
      existing?.websiteLaunchState === LAUNCH_STATES.LAUNCH
        ? LAUNCH_STATES.LAUNCH
        : LAUNCH_STATES.NORMAL;

    if (current === LAUNCH_STATES.NORMAL) {
      return res.json({
        success: true,
        data: publicLaunchPayload(existing, {viewerSeen: true}),
        message: 'Greeting already closed',
      });
    }

    if (closeMode === CLOSE_MODES.PER_PERSON) {
      if (req.user?.uid) {
        await User.findByIdAndUpdate(req.user.uid, {
          $set: {
            websiteLaunchSeenWaveId: waveId,
            updatedAt: new Date(),
          },
        });
      }
      return res.json({
        success: true,
        data: publicLaunchPayload(existing, {viewerSeen: true}),
        message: 'Greeting seen',
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

    if (!updated) {
      const latest = await SystemConfig.findById('global').lean();
      return res.json({
        success: true,
        data: publicLaunchPayload(latest, {viewerSeen: true}),
        message: 'Greeting already closed',
      });
    }

    res.json({
      success: true,
      data: publicLaunchPayload(updated, {viewerSeen: true}),
      message: 'Greeting closed for everyone',
    });
  } catch (error) {
    next(error);
  }
};

exports.updateLaunchConfig = async (req, res, next) => {
  try {
    const body = req.body || {};
    const updates = {updatedAt: new Date(), updatedBy: req.user?.uid || null};
    const current = await SystemConfig.findById('global').lean();

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
        if (current?.websiteLaunchState !== LAUNCH_STATES.LAUNCH) {
          updates.websiteLaunchWaveId = randomUUID();
        }
      }
    }

    if (body.closeMode !== undefined) {
      updates.websiteLaunchCloseMode = normalizeCloseMode(body.closeMode);
    }
    if (body.eventName !== undefined) {
      updates.websiteLaunchEventName = normalizeEventName(body.eventName);
    }
    if (body.greeting !== undefined) {
      updates.websiteLaunchGreeting = normalizeGreeting(body.greeting);
    }
    if (body.cta !== undefined) {
      updates.websiteLaunchCta = String(body.cta || '')
        .trim()
        .slice(0, 80);
    }
    if (body.countdownSeconds !== undefined) {
      updates.websiteLaunchCountdownSeconds = normalizeCountdownSeconds(
        body.countdownSeconds,
      );
    }
    if (body.timerEndsAt !== undefined) {
      updates.websiteLaunchTimerEndsAt = normalizeTimerEndsAt(body.timerEndsAt);
    }
    if (body.animationMode !== undefined) {
      updates.websiteLaunchAnimation = normalizeAnimationMode(
        body.animationMode,
      );
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
      updates.websiteLaunchCloseMode === undefined &&
      updates.websiteLaunchEventName === undefined &&
      updates.websiteLaunchGreeting === undefined &&
      updates.websiteLaunchCta === undefined &&
      updates.websiteLaunchCountdownSeconds === undefined &&
      updates.websiteLaunchTimerEndsAt === undefined &&
      updates.websiteLaunchAnimation === undefined &&
      updates.websiteLaunchName === undefined &&
      updates.websiteLaunchMessage === undefined
    ) {
      throw createHttpError(
        400,
        'Provide state, closeMode, eventName, greeting, cta, timerEndsAt, animationMode, name, and/or message',
        'Bad Request',
      );
    }

    const willBeLaunch =
      updates.websiteLaunchState === LAUNCH_STATES.LAUNCH ||
      (updates.websiteLaunchState === undefined &&
        current?.websiteLaunchState === LAUNCH_STATES.LAUNCH);
    const contentChanged =
      updates.websiteLaunchGreeting !== undefined ||
      updates.websiteLaunchCta !== undefined ||
      updates.websiteLaunchEventName !== undefined ||
      updates.websiteLaunchMessage !== undefined ||
      updates.websiteLaunchName !== undefined ||
      updates.websiteLaunchTimerEndsAt !== undefined;
    const nextTimerIso =
      updates.websiteLaunchTimerEndsAt !== undefined
        ? normalizeTimerEndsAt(updates.websiteLaunchTimerEndsAt)
        : normalizeTimerEndsAt(current?.websiteLaunchTimerEndsAt);
    if (willBeLaunch && !nextTimerIso) {
      throw createHttpError(
        400,
        'timerEndsAt is required when the greeting is shown',
        'Bad Request',
      );
    }
    if (willBeLaunch && isGreetingTimerExpired(nextTimerIso)) {
      throw createHttpError(
        400,
        'timerEndsAt must be in the future',
        'Bad Request',
      );
    }

    if (
      willBeLaunch &&
      contentChanged &&
      updates.websiteLaunchWaveId === undefined
    ) {
      updates.websiteLaunchWaveId = randomUUID();
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
      message: 'Greeting configuration updated',
    });
  } catch (error) {
    next(error);
  }
};

exports.getDoodleConfig = async (req, res, next) => {
  try {
    const doc = await SystemConfig.findById('global').lean();
    res.json({
      success: true,
      data: publicDoodlePayload(doc),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateDoodleConfig = async (req, res, next) => {
  try {
    const body = req.body || {};
    const current = await SystemConfig.findById('global').lean();
    const updates = {updatedAt: new Date(), updatedBy: req.user?.uid || null};

    if (body.logoAccentUrl !== undefined) {
      updates.websiteLaunchLogoAccentUrl = normalizeLogoAccentUrl(
        body.logoAccentUrl,
      );
    }
    if (body.icon !== undefined) {
      updates.websiteLaunchIcon = normalizeWishIcon(body.icon);
    }
    if (body.doodleEnabled !== undefined) {
      updates.websiteLaunchDoodleEnabled = normalizeDoodleEnabled(
        body.doodleEnabled,
      );
    }
    if (body.doodleEndsAt !== undefined) {
      updates.websiteLaunchDoodleEndsAt = normalizeTimerEndsAt(
        body.doodleEndsAt,
      );
    }

    if (
      updates.websiteLaunchLogoAccentUrl === undefined &&
      updates.websiteLaunchIcon === undefined &&
      updates.websiteLaunchDoodleEnabled === undefined &&
      updates.websiteLaunchDoodleEndsAt === undefined
    ) {
      throw createHttpError(
        400,
        'Provide doodleEnabled, doodleEndsAt, icon, and/or logoAccentUrl',
        'Bad Request',
      );
    }

    const doodleWillBeOn =
      updates.websiteLaunchDoodleEnabled === true ||
      (updates.websiteLaunchDoodleEnabled === undefined &&
        normalizeDoodleEnabled(current?.websiteLaunchDoodleEnabled));
    const nextDoodleEnds =
      updates.websiteLaunchDoodleEndsAt !== undefined
        ? normalizeTimerEndsAt(updates.websiteLaunchDoodleEndsAt)
        : normalizeTimerEndsAt(current?.websiteLaunchDoodleEndsAt);
    if (doodleWillBeOn && !nextDoodleEnds) {
      throw createHttpError(
        400,
        'doodleEndsAt is required when the logo doodle is shown',
        'Bad Request',
      );
    }
    if (doodleWillBeOn && isGreetingTimerExpired(nextDoodleEnds)) {
      throw createHttpError(
        400,
        'doodleEndsAt must be in the future',
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
      data: publicDoodlePayload(updated),
      message: 'Logo doodle updated',
    });
  } catch (error) {
    next(error);
  }
};

exports.LAUNCH_STATES = LAUNCH_STATES;
exports.CLOSE_MODES = CLOSE_MODES;
exports.publicLaunchPayload = publicLaunchPayload;
exports.publicDoodlePayload = publicDoodlePayload;
exports.LAUNCH_WISH_ICONS = LAUNCH_WISH_ICONS;
exports.LAUNCH_GREETING_PRESETS = LAUNCH_GREETING_PRESETS;
