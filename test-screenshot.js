const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Navigate and wait
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({ path: 'test-screenshot.png', fullPage: true });
  console.log('Screenshot saved to test-screenshot.png');

  // Check for visible elements
  const appLayout = await page.locator('.app-layout').count();
  const sidebar = await page.locator('.sidebar').count();
  const topbar = await page.locator('.topbar').count();
  const dashboard = await page.locator('.dashboard').count();

  console.log('App layout:', appLayout);
  console.log('Sidebar:', sidebar);
  console.log('Topbar:', topbar);
  console.log('Dashboard:', dashboard);

  // Get visible text
  const bodyText = await page.locator('body').innerText();
  console.log('\nPage content preview:');
  console.log(bodyText.substring(0, 500));

  await browser.close();
})();
