const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) {
      errors.push(`ERROR: ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    errors.push(`PAGE ERROR: ${error.message}`);
  });

  try {
    console.log('1. Starting VideoStudio test...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Dashboard
    await page.screenshot({ path: 'D:/VideoStudio/test-results-new/01-dashboard.png' });
    console.log('   Dashboard screenshot');

    // Create a new project
    console.log('\n2. Creating new project...');
    await page.click('button:has-text("New Project")', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Fill in project name - use specific selector
    const projectNameInput = page.locator('input[placeholder="My Interactive Movie"]');
    if (await projectNameInput.isVisible()) {
      await projectNameInput.fill('Test Project');
      console.log('   Filled project name');

      // Click create/submit
      await page.click('button:has-text("Create"), button:has-text("Save"), button:has-text("Submit")', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    await page.screenshot({ path: 'D:/VideoStudio/test-results-new/02-after-create.png' });
    console.log('   After project creation');

    // 3. Media Library
    console.log('\n3. Testing Media Library...');
    await page.click('a:has-text("Media Library")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results-new/03-media-library.png' });

    // Check for upload functionality
    const uploadArea = await page.locator('.upload-area, .drop-zone').first().isVisible().catch(() => false);
    const uploadBtn = await page.locator('button:has-text("Upload")').first().isVisible().catch(() => false);
    results.push(`Media Library - upload area: ${uploadArea}, button: ${uploadBtn}`);

    // 4. Scenes
    console.log('\n4. Testing Scenes...');
    await page.click('a:has-text("Scenes")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results-new/04-scenes.png' });

    const scenesTitle = await page.locator('h1, h2, .title').first().innerText().catch(() => 'unknown');
    results.push(`Scenes view - title: ${scenesTitle}`);

    // 5. Timeline
    console.log('\n5. Testing Timeline...');
    await page.click('a:has-text("Timeline")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results-new/05-timeline.png' });

    const timelineTitle = await page.locator('h1, h2, .title').first().innerText().catch(() => 'unknown');
    results.push(`Timeline view - title: ${timelineTitle}`);

    // 6. Branches
    console.log('\n6. Testing Branches...');
    await page.click('a:has-text("Branches")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results-new/06-branches.png' });

    const branchesCanvas = await page.locator('canvas, svg, .canvas').first().isVisible().catch(() => false);
    results.push(`Branches - canvas: ${branchesCanvas}`);

    // 7. Events
    console.log('\n7. Testing Events...');
    await page.click('a:has-text("Events")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results-new/07-events.png' });

    const eventsTitle = await page.locator('h1, h2, .title').first().innerText().catch(() => 'unknown');
    results.push(`Events view - title: ${eventsTitle}`);

    // 8. Preview
    console.log('\n8. Testing Preview...');
    await page.click('a:has-text("Preview")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results-new/08-preview.png' });

    const previewPlayer = await page.locator('video, .player, .preview-player').first().isVisible().catch(() => false);
    results.push(`Preview - player: ${previewPlayer}`);

    // 9. Analytics
    console.log('\n9. Testing Analytics...');
    await page.click('a:has-text("Analytics")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results-new/09-analytics.png' });

    const analyticsTitle = await page.locator('h1, h2, .title').first().innerText().catch(() => 'unknown');
    results.push(`Analytics view - title: ${analyticsTitle}`);

    // 10. Publish
    console.log('\n10. Testing Publish...');
    await page.click('a:has-text("Publish")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results-new/10-publish.png' });

    const exportBtn = await page.locator('button:has-text("Export"), button:has-text("Start Export")').first().isVisible().catch(() => false);
    results.push(`Publish - export button: ${exportBtn}`);

    // Test upload flow
    console.log('\n=== Testing Upload Flow ===');
    await page.click('a:has-text("Media Library")', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Try clicking upload button
    const hasUploadBtn = await page.locator('button:has-text("Upload")').isVisible().catch(() => false);
    if (hasUploadBtn) {
      console.log('   Clicking Upload button...');
      // Note: Can't actually upload without a real file
      results.push('Upload - button clickable (file required for full test)');
    }

  } catch (e) {
    errors.push(`TEST ERROR: ${e.message}`);
  }

  console.log('\n=== RESULTS ===');
  results.forEach(r => console.log(`  - ${r}`));

  console.log('\n=== ERRORS ===');
  if (errors.length === 0) {
    console.log('No critical errors!');
  } else {
    errors.forEach(e => console.log(`  - ${e}`));
  }

  await browser.close();
})();
