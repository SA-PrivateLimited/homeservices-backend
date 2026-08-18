/**
 * Seed palettes — mirrors AdminWeb themeConfig.ts clients.
 */

const HOMESERVICES = {
  primary: '#176B87',
  primaryDark: '#0F4C5C',
  secondary: '#2A9D8F',
  secondaryDark: '#217A70',
  background: '#F6F9FB',
  surface: '#FFFFFF',
  text: '#172B36',
  textSecondary: '#61737D',
  border: '#D9E3E8',
  error: '#D64545',
  success: '#2E8B57',
  warning: '#D98E04',
  sidebar: '#102A43',
  sidebarText: '#FFFFFF',
  sidebarMuted: '#A8BAC5',
  marketingBg: '#EAF6F5',
  marketingBgElevated: '#123B4A',
  marketingText: '#FFFFFF',
  marketingTextMuted: '#6A7F88',
  white: '#FFFFFF',
  black: '#000000',
};

const FACEBOOK = {
  primary: '#4F46A5',
  primaryDark: '#37327F',
  secondary: '#7C5CFC',
  secondaryDark: '#6244D8',
  background: '#F7F7FC',
  surface: '#FFFFFF',
  text: '#20213A',
  textSecondary: '#686A80',
  border: '#E1E1EC',
  error: '#D64545',
  success: '#2E8B57',
  warning: '#C98505',
  sidebar: '#252344',
  sidebarText: '#FFFFFF',
  sidebarMuted: '#B5B3CC',
  marketingBg: '#F0EEFF',
  marketingBgElevated: '#312B63',
  marketingText: '#FFFFFF',
  marketingTextMuted: '#77749A',
  white: '#FFFFFF',
  black: '#000000',
};

const GOOGLE = {
  primary: '#2563A6',
  primaryDark: '#1D4F85',
  secondary: '#2F8F83',
  secondaryDark: '#247268',
  background: '#F5F9FA',
  surface: '#FFFFFF',
  text: '#18252B',
  textSecondary: '#63747A',
  border: '#DCE5E8',
  error: '#D64545',
  success: '#2F8F55',
  warning: '#C88712',
  sidebar: '#193442',
  sidebarText: '#FFFFFF',
  sidebarMuted: '#A8BBC2',
  marketingBg: '#EAF5F4',
  marketingBgElevated: '#214B58',
  marketingText: '#FFFFFF',
  marketingTextMuted: '#6C858D',
  white: '#FFFFFF',
  black: '#000000',
};

const DEFAULT_CLIENTS = [
  {_id: 'homeservices', name: 'Home Services', themeColors: HOMESERVICES},
  {_id: 'facebook', name: 'Facebook', themeColors: FACEBOOK},
  {_id: 'google', name: 'Google', themeColors: GOOGLE},
];

const DEFAULT_ACTIVE_CLIENT_ID = 'homeservices';
const THEME_COLOR_KEYS = Object.keys(HOMESERVICES);

function isValidHex(value) {
  return typeof value === 'string' && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value.trim());
}

function validateThemeColors(themeColors) {
  if (!themeColors || typeof themeColors !== 'object') {
    return 'themeColors object is required';
  }
  for (const key of THEME_COLOR_KEYS) {
    if (!isValidHex(themeColors[key])) {
      return `themeColors.${key} must be a valid hex color`;
    }
  }
  return null;
}

function normalizeThemeColors(themeColors) {
  const out = {};
  for (const key of THEME_COLOR_KEYS) {
    out[key] = String(themeColors[key]).trim();
  }
  return out;
}

module.exports = {
  DEFAULT_CLIENTS,
  DEFAULT_ACTIVE_CLIENT_ID,
  THEME_COLOR_KEYS,
  HOMESERVICES,
  validateThemeColors,
  normalizeThemeColors,
};
