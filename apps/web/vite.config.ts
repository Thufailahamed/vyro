import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          config: path.join(__dirname, 'tailwind.config.ts'),
        }),
        autoprefixer(),
      ],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});


