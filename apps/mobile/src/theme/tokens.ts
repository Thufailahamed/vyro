/**
 * VYRO design tokens — a 1:1 port of apps/web/tailwind.config.ts.
 *
 * The web brand is editorial and material: warm paper/bone grounds, near-black
 * ink, a single electric "volt" accent and a copper counter-accent. Keep new
 * colours inside this palette; status tones (mint/amber/rose) are the only
 * semantic additions and they are deliberately muted.
 */

export const colors = {
  ink: '#0C0E0B',
  ink2: '#1A1C18',
  ink3: '#3F433C',
  ink4: '#6E736A',
  ink5: '#A4A89E',
  ink6: '#D4D0C6',
  ink7: '#EDEAE2',

  volt: '#C6DC4A',
  voltDeep: '#7A8F22',
  voltGlow: '#D8EA7A',
  voltSoft: '#EEF4C8',

  copper: '#B87A4E',
  copperDeep: '#8C5A38',
  copperSoft: '#E8D4C4',

  paper: '#FAF7F0',
  bone: '#F2EEE4',
  pearl: '#F7F4EC',
  mist: '#E5E0D4',
  charcoal: '#1A1C18',
  void: '#080907',

  line: 'rgba(12, 14, 11, 0.12)',
  lineSoft: 'rgba(12, 14, 11, 0.07)',
  lineStrong: 'rgba(12, 14, 11, 0.22)',
  paperLine: 'rgba(250, 247, 240, 0.12)',
  paperMuted: 'rgba(250, 247, 240, 0.6)',
  paperFaint: 'rgba(250, 247, 240, 0.35)',

  mint: '#3D8B6E',
  mintSoft: '#DCEBE3',
  amber: '#C4843A',
  amberSoft: '#F3E3CC',
  rose: '#C45A4A',
  roseSoft: '#F3D9D3',

  white: '#FFFFFF',
  transparent: 'transparent',
} as const;

export type ColorName = keyof typeof colors;

/** Font family names registered in app/_layout.tsx via @expo-google-fonts. */
export const fonts = {
  display: 'Syne_800ExtraBold',
  displayBold: 'Syne_700Bold',
  displaySemi: 'Syne_600SemiBold',
  sans: 'IBMPlexSans_400Regular',
  sansMedium: 'IBMPlexSans_500Medium',
  sansSemi: 'IBMPlexSans_600SemiBold',
  sansBold: 'IBMPlexSans_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const radii = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  pill: 999,
} as const;

export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Horizontal page gutter used by every screen. */
export const GUTTER = 20;

/** Type scale mirrored from the web's fontSize extension, tuned for phones. */
export const type = {
  displayXl: { fontFamily: fonts.display, fontSize: 44, lineHeight: 44, letterSpacing: -1.8 },
  displayLg: { fontFamily: fonts.display, fontSize: 36, lineHeight: 37, letterSpacing: -1.3 },
  displayMd: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 32, letterSpacing: -0.9 },
  displaySm: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 27, letterSpacing: -0.6 },
  h1: { fontFamily: fonts.displayBold, fontSize: 21, lineHeight: 26, letterSpacing: -0.4 },
  h2: { fontFamily: fonts.displayBold, fontSize: 18, lineHeight: 23, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.sansSemi, fontSize: 16, lineHeight: 21 },
  bodyLg: { fontFamily: fonts.sans, fontSize: 16.5, lineHeight: 25 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  bodySm: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  caption: { fontFamily: fonts.sansMedium, fontSize: 11.5, lineHeight: 16, letterSpacing: 0.3 },
  overline: { fontFamily: fonts.sansSemi, fontSize: 10.5, lineHeight: 14, letterSpacing: 1.7, textTransform: 'uppercase' as const },
  metric: { fontFamily: fonts.monoMedium, fontSize: 34, lineHeight: 36, letterSpacing: -1.4 },
  metricSm: { fontFamily: fonts.monoMedium, fontSize: 22, lineHeight: 26, letterSpacing: -0.8 },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, letterSpacing: -0.2 },
  button: { fontFamily: fonts.displayBold, fontSize: 15, lineHeight: 19, letterSpacing: -0.3 },
} as const;

export type TypeVariant = keyof typeof type;

/** Soft, warm, low-contrast shadows — the web's shadow-2..5 on native. */
export const shadow = {
  none: {},
  sm: {
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  lg: {
    shadowColor: colors.ink,
    shadowOpacity: 0.2,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  volt: {
    shadowColor: colors.volt,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

export const motion = {
  fast: 140,
  base: 220,
  slow: 320,
  cinematic: 480,
} as const;

/** Semantic tones used by badges, banners and status pills. */
export type Tone = 'neutral' | 'ink' | 'volt' | 'copper' | 'success' | 'warning' | 'danger' | 'info';

export const tones: Record<Tone, { bg: string; fg: string; dot: string; border: string }> = {
  neutral: { bg: colors.mist, fg: colors.ink3, dot: colors.ink4, border: colors.line },
  ink: { bg: colors.ink, fg: colors.paper, dot: colors.volt, border: colors.ink },
  volt: { bg: colors.voltSoft, fg: colors.voltDeep, dot: colors.voltDeep, border: 'rgba(122,143,34,0.25)' },
  copper: { bg: colors.copperSoft, fg: colors.copperDeep, dot: colors.copper, border: 'rgba(184,122,78,0.3)' },
  success: { bg: colors.mintSoft, fg: colors.mint, dot: colors.mint, border: 'rgba(61,139,110,0.25)' },
  warning: { bg: colors.amberSoft, fg: '#8F5A1E', dot: colors.amber, border: 'rgba(196,132,58,0.3)' },
  danger: { bg: colors.roseSoft, fg: '#9A3B2E', dot: colors.rose, border: 'rgba(196,90,74,0.3)' },
  info: { bg: colors.pearl, fg: colors.ink3, dot: colors.copper, border: colors.line },
};

export const theme = { colors, fonts, radii, space, type, shadow, motion, tones, GUTTER };
export type Theme = typeof theme;
