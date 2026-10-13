import { defineConfig, devices } from '@playwright/test';

// Existing database-backed end-to-end coverage stays opt-in. Its helpers may
// create and clean up data in the configured developer/test database.
export default defineConfig({
  testDir: './tests',
  testMatch: ['*.spec.js'],
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
