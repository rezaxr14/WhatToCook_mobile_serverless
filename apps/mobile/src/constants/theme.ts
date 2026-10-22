/**
 * Design tokens for the mobile app.
 *
 * The palette mirrors the web app (orange brand, sage accent, warm neutrals) so
 * the two clients feel like one product. Screens should read from these tokens
 * instead of hard-coding colors or spacing.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1c1917',
    textSecondary: '#57534e',
    textMuted: '#a8a29e',
    background: '#fafaf9',
    backgroundElement: '#ffffff',
    backgroundSelected: '#ffedd5',
    card: '#ffffff',
    cardElevated: '#ffffff',
    border: '#e7e5e4',
    borderStrong: '#d6d3d1',
    brand: '#f97316',
    brandDark: '#ea580c',
    brandSoft: '#ffedd5',
    brandContrast: '#1c1917',
    accent: '#14b8a6',
    accentSoft: '#ccfbf1',
    success: '#10b981',
    successSoft: '#d1fae5',
    warning: '#f59e0b',
    warningSoft: '#fef3c7',
    danger: '#ef4444',
    dangerSoft: '#fee2e2',
    overlay: 'rgba(28, 25, 23, 0.45)',
    skeleton: '#e7e5e4',
  },
  dark: {
    text: '#fafaf9',
    textSecondary: '#d6d3d1',
    textMuted: '#78716c',
    background: '#0c0a09',
    backgroundElement: '#1c1917',
    backgroundSelected: '#431407',
    card: '#1c1917',
    cardElevated: '#292524',
    border: '#292524',
    borderStrong: '#44403c',
    brand: '#fb923c',
    brandDark: '#f97316',
    brandSoft: '#431407',
    brandContrast: '#1c1917',
    accent: '#2dd4bf',
    accentSoft: '#134e4a',
    success: '#34d399',
    successSoft: '#064e3b',
    warning: '#fbbf24',
    warningSoft: '#451a03',
    danger: '#f87171',
    dangerSoft: '#450a0a',
    overlay: 'rgba(0, 0, 0, 0.6)',
    skeleton: '#292524',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Theme = (typeof Colors)['light'] | (typeof Colors)['dark'];

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
  eight: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 21,
  xxl: 28,
  display: 34,
} as const;

export const Shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
    },
    android: { elevation: 2 },
    default: {},
  }),
  floating: Platform.select({
    ios: {
      shadowColor: '#f97316',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
    },
    android: { elevation: 6 },
    default: {},
  }),
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
