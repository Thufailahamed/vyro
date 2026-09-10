// vite.config.ts
import { defineConfig } from "file:///Users/thufailahamed/Downloads/project-5/node_modules/.pnpm/vite@5.4.21_@types+node@26.4.1/node_modules/vite/dist/node/index.js";
import react from "file:///Users/thufailahamed/Downloads/project-5/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@26.4.1_/node_modules/@vitejs/plugin-react/dist/index.js";
import tsconfigPaths from "file:///Users/thufailahamed/Downloads/project-5/node_modules/.pnpm/vite-tsconfig-paths@5.1.4_typescript@5.9.3_vite@5.4.21_@types+node@26.4.1_/node_modules/vite-tsconfig-paths/dist/index.js";
import tailwindcss from "file:///Users/thufailahamed/Downloads/project-5/node_modules/.pnpm/tailwindcss@3.4.19_tsx@4.23.13/node_modules/tailwindcss/lib/index.js";
import autoprefixer from "file:///Users/thufailahamed/Downloads/project-5/node_modules/.pnpm/autoprefixer@10.5.5_postcss@8.5.28/node_modules/autoprefixer/lib/autoprefixer.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
var __vite_injected_original_import_meta_url = "file:///Users/thufailahamed/Downloads/project-5/apps/web/vite.config.ts";
var __dirname = path.dirname(fileURLToPath(__vite_injected_original_import_meta_url));
var vite_config_default = defineConfig({
  plugins: [react(), tsconfigPaths()],
  define: {
    __VYRO_VERSION__: JSON.stringify(process.env.VITE_VERSION ?? "dev")
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          config: path.join(__dirname, "tailwind.config.ts")
        }),
        autoprefixer()
      ]
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        // Point at a local `wrangler dev` with VITE_API_PROXY=http://127.0.0.1:8787
        target: process.env.VITE_API_PROXY ?? "https://vyro-api.thufailahamed627.workers.dev",
        changeOrigin: true,
        secure: true,
        // Rewrite Set-Cookie so the browser stores the session on `localhost`
        // (otherwise prod cookies are scoped to vyro-api...workers.dev and never
        // ride back through this proxy).
        cookieDomainRewrite: {
          "vyro-api.thufailahamed627.workers.dev": "localhost"
        },
        ...{ cookieSecureRewrite: false }
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          router: ["react-router-dom"],
          query: ["@tanstack/react-query"]
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvdGh1ZmFpbGFoYW1lZC9Eb3dubG9hZHMvcHJvamVjdC01L2FwcHMvd2ViXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvdGh1ZmFpbGFoYW1lZC9Eb3dubG9hZHMvcHJvamVjdC01L2FwcHMvd2ViL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy90aHVmYWlsYWhhbWVkL0Rvd25sb2Fkcy9wcm9qZWN0LTUvYXBwcy93ZWIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgdHNjb25maWdQYXRocyBmcm9tICd2aXRlLXRzY29uZmlnLXBhdGhzJztcbmltcG9ydCB0YWlsd2luZGNzcyBmcm9tICd0YWlsd2luZGNzcyc7XG5pbXBvcnQgYXV0b3ByZWZpeGVyIGZyb20gJ2F1dG9wcmVmaXhlcic7XG5pbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gJ25vZGU6dXJsJztcblxuY29uc3QgX19kaXJuYW1lID0gcGF0aC5kaXJuYW1lKGZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKSk7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpLCB0c2NvbmZpZ1BhdGhzKCldLFxuICBkZWZpbmU6IHtcbiAgICBfX1ZZUk9fVkVSU0lPTl9fOiBKU09OLnN0cmluZ2lmeShwcm9jZXNzLmVudi5WSVRFX1ZFUlNJT04gPz8gJ2RldicpLFxuICB9LFxuICBjc3M6IHtcbiAgICBwb3N0Y3NzOiB7XG4gICAgICBwbHVnaW5zOiBbXG4gICAgICAgIHRhaWx3aW5kY3NzKHtcbiAgICAgICAgICBjb25maWc6IHBhdGguam9pbihfX2Rpcm5hbWUsICd0YWlsd2luZC5jb25maWcudHMnKSxcbiAgICAgICAgfSksXG4gICAgICAgIGF1dG9wcmVmaXhlcigpLFxuICAgICAgXSxcbiAgICB9LFxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTczLFxuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6IHtcbiAgICAgICAgLy8gUG9pbnQgYXQgYSBsb2NhbCBgd3JhbmdsZXIgZGV2YCB3aXRoIFZJVEVfQVBJX1BST1hZPWh0dHA6Ly8xMjcuMC4wLjE6ODc4N1xuICAgICAgICB0YXJnZXQ6IHByb2Nlc3MuZW52LlZJVEVfQVBJX1BST1hZID8/ICdodHRwczovL3Z5cm8tYXBpLnRodWZhaWxhaGFtZWQ2Mjcud29ya2Vycy5kZXYnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIHNlY3VyZTogdHJ1ZSxcbiAgICAgICAgLy8gUmV3cml0ZSBTZXQtQ29va2llIHNvIHRoZSBicm93c2VyIHN0b3JlcyB0aGUgc2Vzc2lvbiBvbiBgbG9jYWxob3N0YFxuICAgICAgICAvLyAob3RoZXJ3aXNlIHByb2QgY29va2llcyBhcmUgc2NvcGVkIHRvIHZ5cm8tYXBpLi4ud29ya2Vycy5kZXYgYW5kIG5ldmVyXG4gICAgICAgIC8vIHJpZGUgYmFjayB0aHJvdWdoIHRoaXMgcHJveHkpLlxuICAgICAgICBjb29raWVEb21haW5SZXdyaXRlOiB7XG4gICAgICAgICAgJ3Z5cm8tYXBpLnRodWZhaWxhaGFtZWQ2Mjcud29ya2Vycy5kZXYnOiAnbG9jYWxob3N0JyxcbiAgICAgICAgfSxcbiAgICAgICAgLi4uKHsgY29va2llU2VjdXJlUmV3cml0ZTogZmFsc2UgfSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiksXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiA2MDAsXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIG1hbnVhbENodW5rczoge1xuICAgICAgICAgIHJlYWN0OiBbJ3JlYWN0JywgJ3JlYWN0LWRvbSddLFxuICAgICAgICAgIHJvdXRlcjogWydyZWFjdC1yb3V0ZXItZG9tJ10sXG4gICAgICAgICAgcXVlcnk6IFsnQHRhbnN0YWNrL3JlYWN0LXF1ZXJ5J10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTtcblxuXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXFVLFNBQVMsb0JBQW9CO0FBQ2xXLE9BQU8sV0FBVztBQUNsQixPQUFPLG1CQUFtQjtBQUMxQixPQUFPLGlCQUFpQjtBQUN4QixPQUFPLGtCQUFrQjtBQUN6QixPQUFPLFVBQVU7QUFDakIsU0FBUyxxQkFBcUI7QUFONEssSUFBTSwyQ0FBMkM7QUFRM1AsSUFBTSxZQUFZLEtBQUssUUFBUSxjQUFjLHdDQUFlLENBQUM7QUFFN0QsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sR0FBRyxjQUFjLENBQUM7QUFBQSxFQUNsQyxRQUFRO0FBQUEsSUFDTixrQkFBa0IsS0FBSyxVQUFVLFFBQVEsSUFBSSxnQkFBZ0IsS0FBSztBQUFBLEVBQ3BFO0FBQUEsRUFDQSxLQUFLO0FBQUEsSUFDSCxTQUFTO0FBQUEsTUFDUCxTQUFTO0FBQUEsUUFDUCxZQUFZO0FBQUEsVUFDVixRQUFRLEtBQUssS0FBSyxXQUFXLG9CQUFvQjtBQUFBLFFBQ25ELENBQUM7QUFBQSxRQUNELGFBQWE7QUFBQSxNQUNmO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQTtBQUFBLFFBRU4sUUFBUSxRQUFRLElBQUksa0JBQWtCO0FBQUEsUUFDdEMsY0FBYztBQUFBLFFBQ2QsUUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBSVIscUJBQXFCO0FBQUEsVUFDbkIseUNBQXlDO0FBQUEsUUFDM0M7QUFBQSxRQUNBLEdBQUksRUFBRSxxQkFBcUIsTUFBTTtBQUFBLE1BQ25DO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLHVCQUF1QjtBQUFBLElBQ3ZCLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQSxRQUNOLGNBQWM7QUFBQSxVQUNaLE9BQU8sQ0FBQyxTQUFTLFdBQVc7QUFBQSxVQUM1QixRQUFRLENBQUMsa0JBQWtCO0FBQUEsVUFDM0IsT0FBTyxDQUFDLHVCQUF1QjtBQUFBLFFBQ2pDO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
