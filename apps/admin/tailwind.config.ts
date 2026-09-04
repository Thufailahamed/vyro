import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { brand: { 50: '#f0f9ff', 600: '#0284c7', 700: '#0369a1' } } } },
} satisfies Config;
