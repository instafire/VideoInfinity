const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const errors = [];

  // Capture console errors
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      errors.push(`ERROR: ${text}`);
    } else if (text.includes('Invalid') || text.includes('error') || text.includes('Error')) {
      errors.push(`CONSOLE: ${text}`);
    }
  });

  page.on('pageerror', error => {
    errors.push(`PAGE ERROR: ${error.message}`);
  });

  try {
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Get the HTML structure - find all navigation elements
    console.log('\n=== NAVIGATION ELEMENTS ===');
    const navItems = await page.evaluate(() => {
      const items = [];
      // Look for nav elements
      document.querySelectorAll('nav a, nav button, .nav a, .nav button, [class*="nav"] a, [class*="sidebar"] a, [class*="sidebar"] button').forEach(el => {
        items.push({ tag: el.tagName, text: el.textContent.trim(), class: el.className });
      });
      // Also check for links anywhere
      document.querySelectorAll('a, button').forEach(el => {
        const text = el.textContent.trim();
        if (text && !items.find(i => i.text === text)) {
          items.push({ tag: el.tagName, text: text, class: el.className });
        }
      });
      return items.slice(0, 30); // Limit to 30
    });
    console.log(JSON.stringify(navItems, null, 2));

    // Check current URL
    console.log('\n=== CURRENT URL ===');
    console.log(page.url());

    // Check page content
    console.log('\n=== PAGE CONTENT ===');
    const bodyContent = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log(bodyContent);

    // Check for Vue router or SPA navigation
    console.log('\n=== Checking for SPA structure ===');
    const hasVueApp = await page.evaluate(() => {
      return !!document.querySelector('#app, [id="app"], .vue-app');
    });
    console.log(`Vue app container: ${hasVueApp}`);

  } catch (e) {
    errors.push(`TEST ERROR: ${e.message}`);
  }

  console.log('\n=== ERRORS ===');
  if (errors.length === 0) {
    console.log('No errors found!');
  } else {
    errors.forEach(e => console.log(`  - ${e}`));
  }

  await browser.close();
})();
