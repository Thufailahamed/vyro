import type { Config } from 'tailwindcss';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{ts,tsx}'),
    path.join(__dirname, '../../packages/ui/src/**/*.{ts,tsx}'),
  ],
  theme: {
    extend: {
      colors: {
        // Legacy brand-* aliases — keep old pages visually intact until redesigned
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        bg: '#f8fafc',
        fg: '#0f172a',
        muted: '#64748b',
        // Ink palette (Cinematic Tech neutral)
        ink: {
          1: '#0A0B10',
          2: '#1B1D26',
          3: '#5A606E',
          4: '#8B91A0',
          5: '#C9CED8',
          6: '#E8EAEF',
          7: '#F4F5F8',
        },
        // Paper palette (light grounds)
        paper: '#FFFFFF',
        pearl: '#F8F9FB',
        line: '#E8EAEF',
        'line-soft': '#F0F2F6',
        // Cyan (primary accent)
        cyan: {
          DEFAULT: '#5EE2FF',
          deep: '#0AAFCF',
          glow: '#A8F0FF',
        },
        // Midnight (dark sections)
        midnight: {
          1: '#06070B',
          2: '#0A0B10',
          3: '#12141C',
        },
        // Vivid accents (sparingly)
        mint: '#1FB28A',
        amber: '#E0A458',
        rose: '#E5526A',
        violet: '#9C7CF4',
      },
      fontFamily: {
        sans: ['"Geist"', '"Geist Fallback"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Geist Mono"', '"Geist Mono Fallback"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Display scale
        'display-xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '600' }],
        'display-lg': ['3.5rem', { lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '600' }],
        'display-md': ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '600' }],
        'display-sm': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '600' }],
        // Heading scale
        'h1': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'h2': ['1.25rem', { lineHeight: '1.35', fontWeight: '600' }],
        'h3': ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
        // Body
        'body-lg': ['1.0625rem', { lineHeight: '1.55', fontWeight: '400' }],
        'body': ['0.9375rem', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.45', fontWeight: '400' }],
        'caption': ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.02em', fontWeight: '500' }],
        'overline': ['0.6875rem', { lineHeight: '1.3', letterSpacing: '0.12em', fontWeight: '600', textTransform: 'uppercase' as const }],
      },
      borderRadius: {
        'xs': '4px',
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
      },
      boxShadow: {
        '1': '0 1px 2px 0 rgba(10, 11, 16, 0.04)',
        '2': '0 2px 4px 0 rgba(10, 11, 16, 0.05), 0 1px 2px 0 rgba(10, 11, 16, 0.03)',
        '3': '0 4px 12px -2px rgba(10, 11, 16, 0.06), 0 2px 6px -1px rgba(10, 11, 16, 0.04)',
        '4': '0 10px 24px -4px rgba(10, 11, 16, 0.08), 0 4px 10px -2px rgba(10, 11, 16, 0.05)',
        '5': '0 24px 48px -12px rgba(10, 11, 16, 0.14), 0 8px 20px -4px rgba(10, 11, 16, 0.08)',
        'glow': '0 0 0 4px rgba(94, 226, 255, 0.18)',
        'inner-line': 'inset 0 -1px 0 0 rgba(10, 11, 16, 0.06)',
        'pop': '0 0 0 1px rgba(10, 11, 16, 0.06), 0 8px 24px -6px rgba(10, 11, 16, 0.12)',
      },
      transitionDuration: {
        '140': '140ms',
        '200': '200ms',
        '320': '320ms',
        '480': '480ms',
      },
      transitionTimingFunction: {
        'cinematic': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        'fade-in': 'fade-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
