const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: '.',
    testMatch: 'test-ui.js',
    timeout: 30000,
    reporter: 'line',
    use: {
        baseURL: process.env.APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`,
        browserName: 'chromium',
        viewport: { width: 1600, height: 1100 },
        trace: 'retain-on-failure'
    }
});
