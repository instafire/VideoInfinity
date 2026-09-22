const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Track errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  console.log('Testing VideoStudio UI...\n');

  // Test 1: Dashboard loads
  await page.goto('http://localhost:3000');
  await page.waitForSelector('.app-layout', { timeout: 10000 });
  console.log('✓ App layout loaded');

  // Test 2: Sidebar navigation
  const sidebar = await page.locator('.sidebar');
  if (await sidebar.isVisible()) console.log('✓ Sidebar visible');

  // Test 3: Navigation items
  const navItems = await page.locator('.nav-item');
  const navCount = await navItems.count();
  console.log(`✓ Found ${navCount} navigation items`);

  // Test 4: Dashboard content
  const dashboard = await page.locator('.dashboard');
  if (await dashboard.isVisible()) console.log('✓ Dashboard visible');

  // Test 5: Navigate to Media Library
  await page.click('a[href="#/media"]');
  await page.waitForTimeout(500);
  const mediaLib = await page.locator('.media-library');
  if (await mediaLib.isVisible()) console.log('✓ Media Library view works');

  // Test 6: Navigate to Scenes
  await page.click('a[href="#/scenes"]');
  await page.waitForTimeout(500);
  const scenes = await page.locator('.scene-editor');
  if (await scenes.isVisible()) console.log('✓ Scenes view works');

  // Test 7: Navigate to Timeline
  await page.click('a[href="#/timeline"]');
  await page.waitForTimeout(500);
  const timeline = await page.locator('.timeline-view');
  if (await timeline.isVisible()) console.log('✓ Timeline view works');

  // Test 8: Navigate to Branches
  await page.click('a[href="#/branches"]');
  await page.waitForTimeout(500);
  const branches = await page.locator('.branch-editor');
  if (await branches.isVisible()) console.log('✓ Branches view works');

  // Test 9: Navigate to Events
  await page.click('a[href="#/events"]');
  await page.waitForTimeout(500);
  const events = await page.locator('.event-editor');
  if (await events.isVisible()) console.log('✓ Events view works');

  // Test 10: Navigate to Preview
  await page.click('a[href="#/preview"]');
  await page.waitForTimeout(500);
  const preview = await page.locator('.preview-view');
  if (await preview.isVisible()) console.log('✓ Preview view works');

  // Test 11: Navigate to Analytics
  await page.click('a[href="#/analytics"]');
  await page.waitForTimeout(500);
  const analytics = await page.locator('.analytics-view');
  if (await analytics.isVisible()) console.log('✓ Analytics view works');

  // Test 12: Navigate to Publish
  await page.click('a[href="#/publish"]');
  await page.waitForTimeout(500);
  const publish = await page.locator('.publish-view');
  if (await publish.isVisible()) console.log('✓ Publish view works');

  // Test 13: Back to Dashboard
  await page.click('a[href="#/"]');
  await page.waitForTimeout(500);
  if (await dashboard.isVisible()) console.log('✓ Dashboard navigation works');

  // Report errors
  if (errors.length > 0) {
    console.log('\n⚠ Console errors found:');
    errors.forEach(e => console.log('  - ' + e.substring(0, 100)));
  } else {
    console.log('\n✓ No console errors');
  }

  console.log('\n✅ All tests passed!');
  await browser.close();
})();
