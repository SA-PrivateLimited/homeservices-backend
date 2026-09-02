/**
 * Launch controller helpers — public payload + state normalization.
 */

const {describe, test} = require('node:test');
const assert = require('node:assert/strict');
const {
  LAUNCH_STATES,
  CLOSE_MODES,
  publicLaunchPayload,
} = require('../src/controllers/shared/launchController');
const {
  DEFAULT_EVENT_NAME,
  DEFAULT_GREETING,
  DEFAULT_WISH_ICON,
  DEFAULT_COUNTDOWN_SECONDS,
  ANIMATION_MODES,
} = require('../src/utils/launchWishConfig');

const defaultPublicFields = {
  occasionActive: false,
  closeMode: CLOSE_MODES.PER_PERSON,
  waveId: 'default',
  eventName: DEFAULT_EVENT_NAME,
  greeting: DEFAULT_GREETING,
  cta: DEFAULT_GREETING,
  countdownSeconds: DEFAULT_COUNTDOWN_SECONDS,
  timerEndsAt: null,
  animationMode: ANIMATION_MODES.AUTO,
  animation: 'sparkle',
  name: '',
  message: '',
  doodleEnabled: false,
  doodleEndsAt: null,
  doodleActive: false,
  icon: DEFAULT_WISH_ICON,
  logoAccentUrl: '',
};

describe('publicLaunchPayload', () => {
  test('defaults missing doc to NORMAL with empty tribute fields', () => {
    assert.deepEqual(publicLaunchPayload(null), {
      state: LAUNCH_STATES.NORMAL,
      ...defaultPublicFields,
    });
  });

  test('maps LAUNCH state and trims tribute fields', () => {
    assert.deepEqual(
      publicLaunchPayload({
        websiteLaunchState: 'LAUNCH',
        websiteLaunchName: '  Ada  ',
        websiteLaunchMessage: ' Tribute ',
      }),
      {
        state: 'LAUNCH',
        ...defaultPublicFields,
        occasionActive: true,
        name: 'Ada',
        message: 'Tribute',
      },
    );
  });

  test('maps unknown state to NORMAL', () => {
    assert.equal(
      publicLaunchPayload({
        websiteLaunchState: 'OTHER',
        websiteLaunchName: 'X',
        websiteLaunchMessage: 'Y',
      }).state,
      'NORMAL',
    );
  });

  test('PER_PERSON launch is NORMAL for a visitor who already saw this wave', () => {
    const payload = publicLaunchPayload(
      {
        websiteLaunchState: 'LAUNCH',
        websiteLaunchWaveId: 'wave-1',
        websiteLaunchCloseMode: 'PER_PERSON',
      },
      {viewerSeen: true},
    );
    assert.equal(payload.state, LAUNCH_STATES.NORMAL);
    assert.equal(payload.waveId, 'wave-1');
  });
});
