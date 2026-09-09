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
  define: {
    __VYRO_VERSION__: JSON.stringify(process.env.VITE_VERSION ?? 'dev'),
  },
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
      '/api': {
        // Point at a local `wrangler dev` with VITE_API_PROXY=http://127.0.0.1:8787
        target: process.env.VITE_API_PROXY ?? 'https://vyro-api.thufailahamed627.workers.dev',
        changeOrigin: true,
        secure: true,
        // Rewrite Set-Cookie so the browser stores the session on `localhost`
        // (otherwise prod cookies are scoped to vyro-api...workers.dev and never
        // ride back through this proxy).
        cookieDomainRewrite: {
          'vyro-api.thufailahamed627.workers.dev': 'localhost',
        },
        ...({ cookieSecureRewrite: false } as Record<string, unknown>),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});


