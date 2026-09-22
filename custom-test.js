const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function runCustomTest() {
  console.log('Starting Custom E2E Test...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    // Step 1: Navigate to http://localhost:3000
    console.log('1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Take screenshot of Projects view
    await page.screenshot({ path: path.join(screenshotsDir, '01-projects-view.png') });
    console.log('   Screenshot saved: 01-projects-view.png');

    // Step 2: Click on Default Project to select it
    console.log('2. Clicking on Default Project...');
    const defaultProjectCard = page.locator('div.project-card-3d:has-text("Default Project")').first();
    await defaultProjectCard.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(screenshotsDir, '02-default-project-selected.png') });
    console.log('   Screenshot saved: 02-default-project-selected.png');

    // Step 3: Navigate to Logic view
    console.log('3. Navigating to Logic view...');
    const logicButton = page.locator('button:has-text("Logic")').first();
    await logicButton.click();
    await page.waitForTimeout(2000);

    // Take screenshot of Logic view (to see new choice options)
    await page.screenshot({ path: path.join(screenshotsDir, '03-logic-view.png') });
    console.log('   Screenshot saved: 03-logic-view.png');

    // Step 4: Navigate to Achievements view (🏆 button)
    console.log('4. Navigating to Achievements view...');

    // Look for the trophy/achievements button - it may have an emoji or text
    // Try finding by emoji or by text containing "Achievement" or "Trophy"
    const achievementsButton = page.locator('button:has-text("🏆"), button:has-text("Achievements"), button:has-text("Trophy")').first();

    // Also try finding by aria-label or title
    const achievementsButtonAlt = page.locator('button[aria-label*="Achievement"], button[title*="Achievement"]').first();

    // Try to click on the trophy button - it might have a span with the emoji
    try {
      await achievementsButton.click();
    } catch {
      try {
        await achievementsButtonAlt.click();
      } catch {
        // Try finding by the emoji span inside button
        const trophySpan = page.locator('span:has-text("🏆")').first();
        await trophySpan.click();
      }
    }

    await page.waitForTimeout(2000);

    // Take screenshot of Achievements view
    await page.screenshot({ path: path.join(screenshotsDir, '04-achievements-view.png') });
    console.log('   Screenshot saved: 04-achievements-view.png');

    // Step 5: Navigate to Publish view
    console.log('5. Navigating to Publish view...');
    const publishButton = page.locator('button:has-text("Publish")').first();
    await publishButton.click();
    await page.waitForTimeout(2000);

    // Take screenshot of Publish view
    await page.screenshot({ path: path.join(screenshotsDir, '05-publish-view.png') });
    console.log('   Screenshot saved: 05-publish-view.png');

    console.log('\n=== Custom E2E Test completed! ===');
    console.log(`Screenshots saved to: ${screenshotsDir}`);

  } catch (error) {
    console.error('Error during custom test:', error.message);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-screenshot.png') });
  } finally {
    await browser.close();
  }
}

runCustomTest().catch(console.error);
