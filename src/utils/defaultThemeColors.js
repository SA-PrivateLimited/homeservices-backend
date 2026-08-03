/**
 * Seed palettes — mirrors AdminWeb themeConfig.ts clients.
 */

const HOMESERVICES = {
  primary: '#3182CE',
  primaryDark: '#2C5282',
  secondary: '#38B2AC',
  secondaryDark: '#2C7A7B',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  text: '#1A202C',
  textSecondary: '#718096',
  border: '#E2E8F0',
  error: '#E53E3E',
  success: '#38A169',
  warning: '#DD6B20',
  sidebar: '#1A202C',
  sidebarText: '#EDF2F7',
  sidebarMuted: '#A0AEC0',
  marketingBg: '#0F1C2E',
  marketingBgElevated: '#17263B',
  marketingText: '#F7FAFC',
  marketingTextMuted: '#A0AEC0',
  white: '#FFFFFF',
  black: '#000000',
};

const FACEBOOK = {
  primary: '#E91E8C',
  primaryDark: '#C2185B',
  secondary: '#F48FB1',
  secondaryDark: '#EC407A',
  background: '#FFF5F8',
  surface: '#FFFFFF',
  text: '#2D1420',
  textSecondary: '#8D6B7A',
  border: '#F5D0DC',
  error: '#E53935',
  success: '#43A047',
  warning: '#FB8C00',
  sidebar: '#4A1528',
  sidebarText: '#FFE8F0',
  sidebarMuted: '#D4A0B4',
  marketingBg: '#3D1022',
  marketingBgElevated: '#5C1A35',
  marketingText: '#FFFFFF',
  marketingTextMuted: '#E8B4C8',
  white: '#FFFFFF',
  black: '#000000',
};

const GOOGLE = {
  primary: '#1A73E8',
  primaryDark: '#174EA6',
  secondary: '#34A853',
  secondaryDark: '#188038',
  background: '#F8F9FA',
  surface: '#FFFFFF',
  text: '#202124',
  textSecondary: '#5F6368',
  border: '#DADCE0',
  error: '#D93025',
  success: '#188038',
  warning: '#F9AB00',
  sidebar: '#202124',
  sidebarText: '#FFFFFF',
  sidebarMuted: '#9AA0A6',
  marketingBg: '#202124',
  marketingBgElevated: '#3C4043',
  marketingText: '#FFFFFF',
  marketingTextMuted: '#9AA0A6',
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
