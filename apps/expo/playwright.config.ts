import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:19006',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'bunx expo start --web -c --port 19006',
    url: 'http://localhost:19006',
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
