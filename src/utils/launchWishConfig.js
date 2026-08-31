/**
 * CustomerWeb launch tribute — event name + personal-wish icon.
 * Event name is NOT white-label branding (Homora etc.). Default is Akanso.
 */

const DEFAULT_EVENT_NAME = 'Akanso';
const DEFAULT_WISH_ICON = 'celebration';
const DEFAULT_GREETING = 'Happy Holi';
const GUEST_FAMILY_NAME = 'Akanso Family';

const LAUNCH_WISH_ICONS = Object.freeze([
  'celebration',
  'favorite',
  'auto_awesome',
  'volunteer_activism',
  'local_florist',
  'spa',
]);

const LAUNCH_GREETING_PRESETS = Object.freeze([
  'Happy Holi',
  'Happy Diwali',
  'Happy New Year',
  'Happy Independence Day',
  'Merry Christmas',
]);

function isLegacyWebsiteLaunchCopy(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[.…]+$/g, '');
  if (!value) return false;
  return (
    value === 'launch website' ||
    value === 'website launch' ||
    value === 'website launched' ||
    value === 'launching akanso' ||
    value.includes('website launch') ||
    value.includes('launch website') ||
    value.includes('launching akanso') ||
    value.includes('वेबसाइट लॉन्च') ||
    value.includes('लॉन्च हो')
  );
}

function normalizeEventName(raw) {
  const value = String(raw || '')
    .trim()
    .slice(0, 80);
  if (!value || isLegacyWebsiteLaunchCopy(value)) return DEFAULT_EVENT_NAME;
  return value;
}

function normalizeWishIcon(raw) {
  const value = String(raw || '').trim();
  return LAUNCH_WISH_ICONS.includes(value) ? value : DEFAULT_WISH_ICON;
}

function normalizeGreeting(raw) {
  const value = String(raw || '')
    .trim()
    .slice(0, 80);
  if (!value || isLegacyWebsiteLaunchCopy(value)) return DEFAULT_GREETING;
  return value;
}

function normalizeCta(raw, greeting) {
  const fallback = normalizeGreeting(greeting);
  const value = String(raw || '')
    .trim()
    .slice(0, 80);
  if (!value || isLegacyWebsiteLaunchCopy(value)) return fallback;
  return value;
}

const CLOSE_MODES = Object.freeze({
  GLOBAL: 'GLOBAL',
  PER_PERSON: 'PER_PERSON',
});

const DEFAULT_COUNTDOWN_SECONDS = 10;
const MIN_COUNTDOWN_SECONDS = 0;
const MAX_COUNTDOWN_SECONDS = 30;

function normalizeCountdownSeconds(raw) {
  const value = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(value)) return DEFAULT_COUNTDOWN_SECONDS;
  return Math.min(
    MAX_COUNTDOWN_SECONDS,
    Math.max(MIN_COUNTDOWN_SECONDS, value),
  );
}

const ANIMATION_MODES = Object.freeze({
  AUTO: 'AUTO',
  CRACKERS: 'CRACKERS',
  DIYAS: 'DIYAS',
  JETS: 'JETS',
  HOLI: 'HOLI',
  SNOW: 'SNOW',
  SPARKLE: 'SPARKLE',
  NONE: 'NONE',
});

const ANIMATION_FX = Object.freeze({
  crackers: 'crackers',
  diyas: 'diyas',
  jets: 'jets',
  holi: 'holi',
  snow: 'snow',
  sparkle: 'sparkle',
  none: 'none',
});

function normalizeAnimationMode(raw) {
  const value = String(raw || '')
    .trim()
    .toUpperCase();
  return Object.prototype.hasOwnProperty.call(ANIMATION_MODES, value)
    ? value
    : ANIMATION_MODES.AUTO;
}

function resolveLaunchAnimation(mode, greeting) {
  const normalized = normalizeAnimationMode(mode);
  if (normalized !== ANIMATION_MODES.AUTO) {
    return ANIMATION_FX[normalized.toLowerCase()] || ANIMATION_FX.crackers;
  }
  const text = String(greeting || '').toLowerCase();
  if (
    text.includes('diwali') ||
    text.includes('deepavali') ||
    text.includes('दीपावली') ||
    text.includes('दिवाली')
  ) {
    return ANIMATION_FX.diyas;
  }
  if (
    text.includes('independence') ||
    text.includes('republic') ||
    text.includes('स्वतंत्रता') ||
    text.includes('गणतंत्र')
  ) {
    return ANIMATION_FX.jets;
  }
  if (text.includes('holi') || text.includes('होली')) {
    return ANIMATION_FX.holi;
  }
  if (text.includes('christmas') || text.includes('क्रिसमस')) {
    return ANIMATION_FX.snow;
  }
  if (text.includes('new year') || text.includes('नव वर्ष')) {
    return ANIMATION_FX.sparkle;
  }
  return ANIMATION_FX.crackers;
}

function normalizeCloseMode(raw) {
  const value = String(raw || '')
    .trim()
    .toUpperCase();
  return value === CLOSE_MODES.PER_PERSON
    ? CLOSE_MODES.PER_PERSON
    : CLOSE_MODES.GLOBAL;
}

module.exports = {
  DEFAULT_EVENT_NAME,
  DEFAULT_WISH_ICON,
  DEFAULT_GREETING,
  DEFAULT_COUNTDOWN_SECONDS,
  MIN_COUNTDOWN_SECONDS,
  MAX_COUNTDOWN_SECONDS,
  GUEST_FAMILY_NAME,
  LAUNCH_WISH_ICONS,
  LAUNCH_GREETING_PRESETS,
  CLOSE_MODES,
  ANIMATION_MODES,
  ANIMATION_FX,
  normalizeEventName,
  normalizeWishIcon,
  normalizeGreeting,
  normalizeCta,
  isLegacyWebsiteLaunchCopy,
  normalizeCloseMode,
  normalizeCountdownSeconds,
  normalizeAnimationMode,
  resolveLaunchAnimation,
};
