export const BRAND = {
  name: 'VYRO',
  tagline: 'Everything your business needs.',
  logo: { light: '/brand/logo.svg', dark: '/brand/logo-dark.svg' },
  colors: {
    primary: 'oklch(0.55 0.18 250)',
    primaryFg: 'oklch(0.98 0 0)',
    background: 'oklch(0.99 0 0)',
    foreground: 'oklch(0.18 0 0)',
    muted: 'oklch(0.96 0 0)',
    mutedFg: 'oklch(0.45 0 0)',
    border: 'oklch(0.9 0 0)',
    accent: 'oklch(0.94 0.04 250)',
    danger: 'oklch(0.55 0.22 27)',
    success: 'oklch(0.6 0.15 145)',
  },
} as const;
