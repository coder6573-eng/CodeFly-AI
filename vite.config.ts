import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * base: './' keeps asset paths relative so one build works in Electron (file://)
 * and Capacitor (https://localhost).
 *
 * Dev proxies exist because the free gateways do not all send CORS headers.
 * Desktop builds proxy through the Electron main process; Android requests go
 * out directly and surface a clear error if a provider refuses the origin.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/gw/kilo': {
        target: 'https://ai-gateway.kilo.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/gw\/kilo/, '/api/v1'),
      },
      '/gw/llm7': {
        target: 'https://api.llm7.io',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/gw\/llm7/, '/v1'),
      },
      '/gw/pollinations': {
        target: 'https://text.pollinations.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/gw\/pollinations/, '/openai'),
      },
      '/gw/ovh': {
        target: 'https://oai.endpoints.kepler.ai.cloud.ovh.net',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/gw\/ovh/, '/v1'),
      },
      '/gw/freeai': {
        target: 'https://api.free.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/gw\/freeai/, '/v1'),
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
});
