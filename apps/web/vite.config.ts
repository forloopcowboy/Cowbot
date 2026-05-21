import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // In prod, SuperTokens lives on auth.invest.example.com so the SPA
        // route `/auth` and the API base path `/auth/*` don't collide. In dev
        // they share an origin, so let browser page loads fall through to the
        // SPA (React Router renders <Auth/>); XHR calls still get proxied.
        bypass(req) {
          if (
            req.method === 'GET' &&
            req.headers.accept?.includes('text/html')
          ) {
            return req.url;
          }
        },
      },
    },
  },
});
