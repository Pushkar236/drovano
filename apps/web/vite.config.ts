import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same-origin API in development: cookies stay first-party
    // (production runs behind one domain; see apps/api README).
    proxy: {
      '/api': 'http://localhost:3000',
      '/realtime': {
        target: 'ws://localhost:3001',
        ws: true,
        rewrite: () => '/',
      },
    },
  },
});
