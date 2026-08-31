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
  assert.equal(normalizeWishIcon('homora'), DEFAULT_WISH_ICON);
  assert.equal(normalizeWishIcon('favorite'), 'favorite');
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

test('animation auto uses diyas for Diwali and crackers otherwise', () => {
  const {
    resolveLaunchAnimation,
    normalizeAnimationMode,
    ANIMATION_MODES,
  } = require('../src/utils/launchWishConfig');
  assert.equal(normalizeAnimationMode(''), ANIMATION_MODES.AUTO);
  assert.equal(resolveLaunchAnimation('AUTO', 'Happy Diwali'), 'diyas');
  assert.equal(resolveLaunchAnimation('AUTO', 'Happy Holi'), 'holi');
  assert.equal(
    resolveLaunchAnimation('AUTO', 'Happy Independence Day'),
    'jets',
  );
  assert.equal(resolveLaunchAnimation('AUTO', 'Merry Christmas'), 'snow');
  assert.equal(resolveLaunchAnimation('JETS', 'Happy Holi'), 'jets');
  assert.equal(resolveLaunchAnimation('DIYAS', 'Happy Holi'), 'diyas');
  assert.equal(resolveLaunchAnimation('NONE', 'Happy Diwali'), 'none');
});

test('close mode defaults to GLOBAL', () => {
  const {normalizeCloseMode, CLOSE_MODES} = require('../src/utils/launchWishConfig');
  assert.equal(normalizeCloseMode(''), CLOSE_MODES.GLOBAL);
  assert.equal(normalizeCloseMode('PER_PERSON'), CLOSE_MODES.PER_PERSON);
});
