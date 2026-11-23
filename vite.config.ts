import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev-only gateway proxies.
 *
 * Browser builds call the gateways directly (the providers allow CORS). In
 * `vite dev` the same calls are routed through these proxies so localhost
 * origin quirks never get in the way. Routes are matched by the `devBaseUrl`
 * values in src/agent/routes.ts; the prefix is replaced with the gateway's
 * real API base path.
 */
const gateway = (target: string, prefix: string, basePath: string): ProxyOptions => ({
  target,
  changeOrigin: true,
  secure: true,
  rewrite: (path) => path.replace(new RegExp('^' + prefix), basePath),
});

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/gw/kilo': gateway('https://ai-gateway.kilo.ai', '/gw/kilo', '/api/v1'),
      '/gw/llm7': gateway('https://api.llm7.io', '/gw/llm7', '/v1'),
      '/gw/pollinations': gateway('https://text.pollinations.ai', '/gw/pollinations', '/openai'),
      '/gw/ovh': gateway('https://oai.endpoints.kepler.ai.cloud.ovh.net', '/gw/ovh', '/v1'),
      '/gw/freeai': gateway('https://api.free.ai', '/gw/freeai', '/v1'),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('@codemirror/lang-') ||
            id.includes('@lezer/html') ||
            id.includes('@lezer/css') ||
            id.includes('@lezer/javascript')
          ) {
            return 'editor-langs';
          }
          if (id.includes('@codemirror') || id.includes('@uiw') || id.includes('@lezer')) {
            return 'editor';
          }
          if (id.includes('react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
