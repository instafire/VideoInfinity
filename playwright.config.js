import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'test-ui.js',
  use: {
    headless: true,
  },
});
