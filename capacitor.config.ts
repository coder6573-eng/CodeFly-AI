import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.codefly.app',
  appName: 'CodeFly AI',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    // Route gateway calls through the native HTTP stack so free keyless
    // endpoints are not blocked by WebView CORS rules.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
