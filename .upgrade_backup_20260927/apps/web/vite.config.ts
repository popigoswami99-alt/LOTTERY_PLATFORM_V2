import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Point straight at the workspace source so game rules and payout maths
      // are literally the same module the server settles with.
      '@lp/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Bind to the LAN, not just localhost, so a phone on the same Wi-Fi can
    // reach it. /api and /socket.io are proxied server-side to the API, so
    // the browser's perceived origin stays same-origin regardless of which
    // host:port the page was loaded from — no CORS setup needed for this.
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
});
