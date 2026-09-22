const { chromium } = require('@playwright/test');
const path = require('path');

async function runUITest() {
  console.log('Starting UI Test...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const screenshotsDir = path.join(__dirname, 'screenshots');
  const fs = require('fs');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    // Step 1: Navigate to http://localhost:3000
    console.log('1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Take screenshot of initial view (Projects)
    await page.screenshot({ path: path.join(screenshotsDir, '01-projects-view.png') });
    console.log('   Screenshot saved: 01-projects-view.png');

    // Step 2: Click on Default Project to select it - need to click the card element, not just the text
    console.log('2. Clicking on Default Project...');

    // The project cards are divs with @click="selectProject(p)"
    // Let's find the project card div containing the text "Default Project"
    const defaultProjectCard = page.locator('div.project-card-3d:has-text("Default Project")').first();
    await defaultProjectCard.click();
    await page.waitForTimeout(3000);

    // Check the current URL and view
    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);

    await page.screenshot({ path: path.join(screenshotsDir, '02-default-project-selected.png') });
    console.log('   Screenshot saved: 02-default-project-selected.png');

    // Now try to find the navigation buttons - they should be visible when currentProject is set
    console.log('   Looking for navigation buttons...');

    // Wait a bit and check if nav buttons appeared
    await page.waitForTimeout(1000);

    // Check for Import button
    const importButton = page.locator('button:has-text("Import")').first();
    const importVisible = await importButton.isVisible().catch(() => false);
    console.log(`   Import button visible: ${importVisible}`);

    if (importVisible) {
      // Step 3: Navigate to Import view
      console.log('3. Navigating to Import view...');
      await importButton.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '03-import-view.png') });
      console.log('   Screenshot saved: 03-import-view.png');

      // Step 4: Navigate to Edit view
      console.log('4. Navigating to Edit view...');
      const editButton = page.locator('button:has-text("Edit")').first();
      await editButton.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '04-edit-view.png') });
      console.log('   Screenshot saved: 04-edit-view.png');

      // Step 5: Navigate to Library view
      console.log('5. Navigating to Library view...');
      const libraryButton = page.locator('button:has-text("Library")').first();
      await libraryButton.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '05-library-view.png') });
      console.log('   Screenshot saved: 05-library-view.png');

      // Step 6: Navigate to Event view (⚡Event)
      console.log('6. Navigating to Event view...');
      const eventButton = page.locator('button:has-text("Event")').first();
      await eventButton.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '06-event-view.png') });
      console.log('   Screenshot saved: 06-event-view.png');

      // Step 7: Navigate to Logic view
      console.log('7. Navigating to Logic view...');
      const logicButton = page.locator('button:has-text("Logic")').first();
      await logicButton.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '07-logic-view.png') });
      console.log('   Screenshot saved: 07-logic-view.png');

      // Step 8: Navigate to Stats view
      console.log('8. Navigating to Stats view...');
      const statsButton = page.locator('button:has-text("Stats")').first();
      await statsButton.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '08-stats-view.png') });
      console.log('   Screenshot saved: 08-stats-view.png');

      // Step 9: Navigate to Publish view
      console.log('9. Navigating to Publish view...');
      const publishButton = page.locator('button:has-text("Publish")').first();
      await publishButton.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '09-publish-view.png') });
      console.log('   Screenshot saved: 09-publish-view.png');

    } else {
      console.log('   ERROR: Navigation buttons not visible after clicking project!');
      console.log('   This suggests selectProject() did not work correctly');

      // Let's debug: get the HTML of the page
      const html = await page.content();
      console.log('   Page contains projects view:', html.includes('view === \'projects\''));
      console.log('   Page contains upload view:', html.includes('view === \'upload\''));

      // Get all buttons on the page
      const allButtons = await page.locator('button').all();
      console.log(`   Found ${allButtons.length} buttons`);
      for (const btn of allButtons.slice(0, 10)) {
        const text = await btn.textContent().catch(() => '');
        if (text.trim()) console.log(`   Button: "${text.trim()}"`);
      }
    }

    console.log('\nUI Test completed!');
    console.log(`Screenshots saved to: ${screenshotsDir}`);

  } catch (error) {
    console.error('Error during UI test:', error.message);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-screenshot.png') });
  } finally {
    await browser.close();
  }
}

runUITest().catch(console.error);
