import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'top.babylink.app',
  appName: 'BabyLink',
  webDir: 'dist',
  server: {
    url: 'https://babylink.top',
    cleartext: false
  },
  android: {
    allowMixedContent: false
  }
};

export default config;