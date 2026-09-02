const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_EVENT_NAME,
  DEFAULT_WISH_ICON,
  normalizeEventName,
  normalizeWishIcon,
} = require('../src/utils/launchWishConfig');

test('empty event name becomes Akanso, not a white-label brand', () => {
  assert.equal(normalizeEventName(''), DEFAULT_EVENT_NAME);
  assert.equal(normalizeEventName('   '), 'Akanso');
  assert.equal(normalizeEventName('Akanso'), 'Akanso');
});

test('unknown wish icon falls back to celebration', () => {
  assert.equal(normalizeWishIcon(''), DEFAULT_WISH_ICON);
  assert.equal(normalizeWishIcon('foo-bar'), DEFAULT_WISH_ICON);
  assert.equal(normalizeWishIcon('favorite'), 'favorite');
  assert.equal(normalizeWishIcon('local_fire_department'), 'local_fire_department');
});

test('logo accent url must be http(s) or empty', () => {
  const {normalizeLogoAccentUrl} = require('../src/utils/launchWishConfig');
  assert.equal(normalizeLogoAccentUrl(''), '');
  assert.equal(normalizeLogoAccentUrl('not-a-url'), '');
  assert.equal(
    normalizeLogoAccentUrl('https://assets.akanso.in/services/pwa/diya.png'),
    'https://assets.akanso.in/services/pwa/diya.png',
  );
});

test('legacy website-launch copy is not shown to customers', () => {
  const {
    normalizeGreeting,
    normalizeCta,
    normalizeEventName,
    DEFAULT_GREETING,
    DEFAULT_EVENT_NAME,
  } = require('../src/utils/launchWishConfig');
  assert.equal(normalizeGreeting('Launch Website'), DEFAULT_GREETING);
  assert.equal(normalizeGreeting('वेबसाइट लॉन्च करें'), DEFAULT_GREETING);
  assert.equal(normalizeCta('Launch Website', 'Happy Diwali'), 'Happy Diwali');
  assert.equal(normalizeCta('', 'Happy Diwali'), 'Happy Diwali');
  assert.equal(normalizeEventName('Website launch'), DEFAULT_EVENT_NAME);
});

test('countdown seconds stay between 0 and 30, default 10', () => {
  const {
    normalizeCountdownSeconds,
    DEFAULT_COUNTDOWN_SECONDS,
  } = require('../src/utils/launchWishConfig');
  assert.equal(normalizeCountdownSeconds(undefined), DEFAULT_COUNTDOWN_SECONDS);
  assert.equal(normalizeCountdownSeconds(''), DEFAULT_COUNTDOWN_SECONDS);
  assert.equal(normalizeCountdownSeconds(5), 5);
  assert.equal(normalizeCountdownSeconds(0), 0);
  assert.equal(normalizeCountdownSeconds(99), 30);
  assert.equal(normalizeCountdownSeconds(-3), 0);
});

test('animation auto uses diyas for Diwali and sparkle otherwise', () => {
  const {
    resolveLaunchAnimation,
    normalizeAnimationMode,
    ANIMATION_MODES,
  } = require('../src/utils/launchWishConfig');
  assert.equal(normalizeAnimationMode(''), ANIMATION_MODES.AUTO);
  assert.equal(resolveLaunchAnimation('AUTO', 'Happy Diwali'), 'diyas');
  assert.equal(resolveLaunchAnimation('AUTO', 'Happy Holi'), 'sparkle');
  assert.equal(
    resolveLaunchAnimation('AUTO', 'Happy Independence Day'),
    'sparkle',
  );
  assert.equal(resolveLaunchAnimation('AUTO', 'Merry Christmas'), 'sparkle');
  assert.equal(resolveLaunchAnimation('JETS', 'Happy Holi'), 'sparkle');
  assert.equal(resolveLaunchAnimation('CRACKERS', 'Happy Holi'), 'crackers');
  assert.equal(resolveLaunchAnimation('DIYAS', 'Happy Holi'), 'diyas');
  assert.equal(resolveLaunchAnimation('NONE', 'Happy Diwali'), 'none');
});

test('greeting timer expiry is based on timerEndsAt', () => {
  const {
    normalizeTimerEndsAt,
    isGreetingTimerExpired,
  } = require('../src/utils/launchWishConfig');
  assert.equal(normalizeTimerEndsAt(''), null);
  assert.equal(normalizeTimerEndsAt('not-a-date'), null);
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(typeof normalizeTimerEndsAt(future), 'string');
  assert.equal(isGreetingTimerExpired(future), false);
  assert.equal(isGreetingTimerExpired(past), true);
  assert.equal(isGreetingTimerExpired(null), false);
});

test('logo doodle is independent of greeting launch state', () => {
  const {isDoodleActive, normalizeDoodleEnabled} = require('../src/utils/launchWishConfig');
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(normalizeDoodleEnabled(true), true);
  assert.equal(normalizeDoodleEnabled('false'), false);
  assert.equal(isDoodleActive(true, future), true);
  assert.equal(isDoodleActive(false, future), false);
  assert.equal(isDoodleActive(true, past), false);
  assert.equal(isDoodleActive(true, null), false);
});

test('close mode defaults to PER_PERSON', () => {
  const {normalizeCloseMode, CLOSE_MODES} = require('../src/utils/launchWishConfig');
  assert.equal(normalizeCloseMode(''), CLOSE_MODES.PER_PERSON);
  assert.equal(normalizeCloseMode('GLOBAL'), CLOSE_MODES.GLOBAL);
  assert.equal(normalizeCloseMode('PER_PERSON'), CLOSE_MODES.PER_PERSON);
});
