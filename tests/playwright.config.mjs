import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 12000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: './report', open: 'never' }]
  ],
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:8765',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    actionTimeout: 12000,
    navigationTimeout: 20000
  },
  projects: [
    {
      name: 'android-320',
      use: { viewport: { width: 320, height: 680 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    },
    {
      name: 'android-360',
      use: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    },
    {
      name: 'android-393',
      use: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    }
  ]
});
