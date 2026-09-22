const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  const errors = [];

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`ERROR: ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    errors.push(`PAGE ERROR: ${error.message}`);
  });

  try {
    // 1. Navigate to the page
    console.log('1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for Vue app to mount
    await page.waitForTimeout(2000);

    // Check if main content loaded
    const title = await page.title();
    console.log(`   Page title: ${title}`);

    // Take screenshot of initial load
    await page.screenshot({ path: 'D:/VideoStudio/test-results/01-home.png' });
    results.push('Home page loaded - screenshot saved');

    // Check for sidebar
    const sidebarExists = await page.locator('nav, .sidebar, [class*="sidebar"]').first().isVisible().catch(() => false);
    console.log(`   Sidebar exists: ${sidebarExists}`);

    // 2. Test Dashboard (default view)
    console.log('\n2. Testing Dashboard view...');
    await page.screenshot({ path: 'D:/VideoStudio/test-results/02-dashboard.png' });
    results.push('Dashboard - screenshot saved');

    // 3. Test Media Library
    console.log('\n3. Testing Media Library...');
    await page.click('text=Media Library, nav >> text=Media Library, [data-testid*="media"], .nav-item:has-text("Media Library")' , { timeout: 5000 }).catch(async () => {
      // Try alternative selectors
      const mediaLink = page.locator('a:has-text("Media Library"), button:has-text("Media Library"), .nav-item:has-text("Media")');
      await mediaLink.click().catch(() => {});
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/03-media-library.png' });

    // Check for upload button
    const uploadBtn = await page.locator('button:has-text("Upload"), input[type="file"]').first().isVisible().catch(() => false);
    console.log(`   Upload button/input exists: ${uploadBtn}`);
    results.push(`Media Library - upload control exists: ${uploadBtn}`);

    // 4. Test Scenes
    console.log('\n4. Testing Scenes...');
    await page.click('text=Scenes, nav >> text=Scenes', { timeout: 5000 }).catch(async () => {
      const scenesLink = page.locator('a:has-text("Scenes"), button:has-text("Scenes")');
      await scenesLink.click().catch(() => {});
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/04-scenes.png' });

    // Check for create scene controls
    const createSceneBtn = await page.locator('button:has-text("Create Scene"), [data-testid*="create-scene"]').first().isVisible().catch(() => false);
    results.push(`Scenes - create button exists: ${createSceneBtn}`);

    // 5. Test Timeline
    console.log('\n5. Testing Timeline...');
    await page.click('text=Timeline, nav >> text=Timeline', { timeout: 5000 }).catch(async () => {
      const timelineLink = page.locator('a:has-text("Timeline"), button:has-text("Timeline")');
      await timelineLink.click().catch(() => {});
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/05-timeline.png' });
    results.push('Timeline - screenshot saved');

    // 6. Test Branches
    console.log('\n6. Testing Branches...');
    await page.click('text=Branches, nav >> text=Branches', { timeout: 5000 }).catch(async () => {
      const branchesLink = page.locator('a:has-text("Branches"), button:has-text("Branches")');
      await branchesLink.click().catch(() => {});
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/06-branches.png' });

    // Check for graph/canvas
    const graphExists = await page.locator('canvas, svg, .graph, [class*="graph"]').first().isVisible().catch(() => false);
    results.push(`Branches - graph/canvas exists: ${graphExists}`);

    // 7. Test Events
    console.log('\n7. Testing Events...');
    await page.click('text=Events, nav >> text=Events', { timeout: 5000 }).catch(async () => {
      const eventsLink = page.locator('a:has-text("Events"), button:has-text("Events")');
      await eventsLink.click().catch(() => {});
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/07-events.png' });

    // Check for create event controls
    const createEventBtn = await page.locator('button:has-text("Create Event"), [data-testid*="create-event"]').first().isVisible().catch(() => false);
    results.push(`Events - create button exists: ${createEventBtn}`);

    // 8. Test Preview
    console.log('\n8. Testing Preview...');
    await page.click('text=Preview, nav >> text=Preview', { timeout: 5000 }).catch(async () => {
      const previewLink = page.locator('a:has-text("Preview"), button:has-text("Preview")');
      await previewLink.click().catch(() => {});
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/08-preview.png' });
    results.push('Preview - screenshot saved');

    // 9. Test Analytics
    console.log('\n9. Testing Analytics...');
    await page.click('text=Analytics, nav >> text=Analytics', { timeout: 5000 }).catch(async () => {
      const analyticsLink = page.locator('a:has-text("Analytics"), button:has-text("Analytics")');
      await analyticsLink.click().catch(() => {});
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/09-analytics.png' });
    results.push('Analytics - screenshot saved');

    // 10. Test Publish
    console.log('\n10. Testing Publish...');
    await page.click('text=Publish, nav >> text=Publish', { timeout: 5000 }).catch(async () => {
      const publishLink = page.locator('a:has-text("Publish"), button:has-text("Publish")');
      await publishLink.click().catch(() => {});
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/10-publish.png' });

    // Check for export/publish button
    const publishBtn = await page.locator('button:has-text("Export"), button:has-text("Publish"), [data-testid*="export"]').first().isVisible().catch(() => false);
    results.push(`Publish - export button exists: ${publishBtn}`);

  } catch (e) {
    errors.push(`TEST ERROR: ${e.message}`);
  }

  console.log('\n=== RESULTS ===');
  console.log('Screenshots saved to D:/VideoStudio/test-results/');
  console.log('\nFunctional Tests:');
  results.forEach(r => console.log(`  - ${r}`));

  console.log('\n=== ERRORS ===');
  if (errors.length === 0) {
    console.log('No critical errors found!');
  } else {
    errors.forEach(e => console.log(`  - ${e}`));
  }

  await browser.close();
})();
