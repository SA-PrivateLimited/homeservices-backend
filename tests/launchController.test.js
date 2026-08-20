/**
 * Launch controller helpers — public payload + state normalization.
 */

const {describe, test} = require('node:test');
const assert = require('node:assert/strict');
const {
  LAUNCH_STATES,
  publicLaunchPayload,
} = require('../src/controllers/shared/launchController');

describe('publicLaunchPayload', () => {
  test('defaults missing doc to NORMAL with empty tribute fields', () => {
    assert.deepEqual(publicLaunchPayload(null), {
      state: LAUNCH_STATES.NORMAL,
      name: '',
      message: '',
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
});
