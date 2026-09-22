const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  const errors = [];

  // Capture console messages
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' && !text.includes('favicon')) {
      errors.push(`ERROR: ${text}`);
    }
  });

  page.on('pageerror', error => {
    errors.push(`PAGE ERROR: ${error.message}`);
  });

  try {
    console.log('1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Dashboard is default
    await page.screenshot({ path: 'D:/VideoStudio/test-results/01-dashboard.png' });
    console.log('   Dashboard screenshot saved');

    // Get project to use for testing
    const hasProjects = await page.locator('text=My Project, text=Default Project').first().isVisible().catch(() => false);
    console.log(`   Has existing projects: ${hasProjects}`);

    // Click on a project if exists, or create one
    if (hasProjects) {
      console.log('   Opening existing project...');
      await page.click('text=My Project, text=Default Project', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    // 2. Media Library
    console.log('\n2. Testing Media Library...');
    await page.click('a:has-text("Media Library")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/02-media-library.png' });

    const uploadBtn = await page.locator('button:has-text("Upload"), .upload-area, input[type="file"]').first().isVisible().catch(() => false);
    results.push(`Media Library - upload UI exists: ${uploadBtn}`);

    // 3. Scenes
    console.log('\n3. Testing Scenes...');
    await page.click('a:has-text("Scenes")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/03-scenes.png' });

    const createSceneBtn = await page.locator('button:has-text("Create Scene"), .create-scene-btn, [data-testid*="create"]').first().isVisible().catch(() => false);
    results.push(`Scenes - create button exists: ${createSceneBtn}`);

    // 4. Timeline
    console.log('\n4. Testing Timeline...');
    await page.click('a:has-text("Timeline")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/04-timeline.png' });
    results.push('Timeline - screenshot saved');

    // 5. Branches
    console.log('\n5. Testing Branches...');
    await page.click('a:has-text("Branches")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/05-branches.png' });

    const graphExists = await page.locator('canvas, svg, .branches-canvas, [class*="graph"], [class*="branch"]').first().isVisible().catch(() => false);
    results.push(`Branches - graph/canvas exists: ${graphExists}`);

    // 6. Events
    console.log('\n6. Testing Events...');
    await page.click('a:has-text("Events")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/06-events.png' });

    const createEventBtn = await page.locator('button:has-text("Create Event"), .create-event-btn').first().isVisible().catch(() => false);
    results.push(`Events - create button exists: ${createEventBtn}`);

    // 7. Preview
    console.log('\n7. Testing Preview...');
    await page.click('a:has-text("Preview")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/07-preview.png' });
    results.push('Preview - screenshot saved');

    // 8. Analytics
    console.log('\n8. Testing Analytics...');
    await page.click('a:has-text("Analytics")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/08-analytics.png' });
    results.push('Analytics - screenshot saved');

    // 9. Publish
    console.log('\n9. Testing Publish...');
    await page.click('a:has-text("Publish")', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'D:/VideoStudio/test-results/09-publish.png' });

    const exportBtn = await page.locator('button:has-text("Export"), button:has-text("Start Export")').first().isVisible().catch(() => false);
    results.push(`Publish - export button exists: ${exportBtn}`);

    // Test upload functionality
    console.log('\n=== Testing Functionality ===');

    // Go back to Media Library to test upload
    console.log('\n10. Testing Media Library upload...');
    await page.click('a:has-text("Media Library")', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Check for upload area
    const uploadArea = await page.locator('.upload-area, .drop-zone, .upload-zone').first().isVisible().catch(() => false);
    console.log(`    Upload drop zone visible: ${uploadArea}`);

    // Check for file input
    const fileInput = await page.locator('input[type="file"]').first().isVisible().catch(() => false);
    console.log(`    File input exists: ${fileInput}`);

    // Try to test upload with a small test file if exists
    const testVideoExists = await page.locator('text=.mp4, text=.avi, text=.mov, .video-item, .media-item').first().isVisible().catch(() => false);
    console.log(`    Videos in library: ${testVideoExists}`);

    // Go to Scenes to test scene creation
    console.log('\n11. Testing Scene creation...');
    await page.click('a:has-text("Scenes")', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Check for video clips in scenes
    const clipsExist = await page.locator('.clip, .scene-item, [class*="clip"]').first().isVisible().catch(() => false);
    console.log(`    Clips/scenes visible: ${clipsExist}`);

    // Check for create scene UI
    const createSceneUI = await page.locator('button:has-text("New Clip"), button:has-text("Add Clip"), .add-clip').first().isVisible().catch(() => false);
    console.log(`    Create scene UI: ${createSceneUI}`);

    // Go to Branches to test graph
    console.log('\n12. Testing Branches graph...');
    await page.click('a:has-text("Branches")', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Check for node/edge elements
    const nodesExist = await page.locator('.node, .branch-node, [class*="node"]').first().isVisible().catch(() => false);
    console.log(`    Branch nodes visible: ${nodesExist}`);

    // Check for zoom/pan controls
    const controlsExist = await page.locator('.controls, .zoom-controls, [class*="control"]').first().isVisible().catch(() => false);
    console.log(`    Graph controls: ${controlsExist}`);

    // Go to Events
    console.log('\n13. Testing Events creation...');
    await page.click('a:has-text("Events")', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Check for event list
    const eventsExist = await page.locator('.event, .event-item, [class*="event"]').first().isVisible().catch(() => false);
    console.log(`    Events visible: ${eventsExist}`);

    // Go to Publish to test export
    console.log('\n14. Testing Publish export...');
    await page.click('a:has-text("Publish")', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Check export form
    const projectNameInput = await page.locator('input[name="projectName"], input[type="text"]').first().isVisible().catch(() => false);
    console.log(`    Project name input: ${projectNameInput}`);

    const exportSettings = await page.locator('checkbox, .checkbox, .setting').first().isVisible().catch(() => false);
    console.log(`    Export settings: ${exportSettings}`);

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
