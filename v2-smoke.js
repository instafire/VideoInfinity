const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

const APP_URL = 'http://127.0.0.1:3200';

async function run() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
    const page = await context.newPage();
    const errors = [];

    const track = (pg) => {
        pg.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        pg.on('pageerror', (error) => {
            errors.push(error.message);
        });
    };

    track(page);

    try {
        await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForSelector('text=VideoStudio V2');
        await page.getByRole('button', { name: /Default Project/i }).click();
        await page.waitForSelector('text=Story Timeline');

        const insertButtons = page.locator('.asset-card .chip-btn-active').filter({ hasText: 'Insert' });
        const insertCount = await insertButtons.count();
        assert.ok(insertCount > 0, 'Expected at least one scene clip in the V2 media bin.');
        await insertButtons.first().click();
        await page.waitForSelector('.story-block');

        await page.evaluate(() => {
            const app = window.__v2App;
            const clips = app.sceneLibrary.slice(0, 2);
            app.draft.timeline.sequence = clips.map((clip) => ({
                id: crypto.randomUUID(),
                clipId: clip.unique_id,
                label: clip.name,
                trimInMs: 0,
                trimOutMs: Math.max(3000, Math.round((clip.duration || 3) * 1000)),
                chapterName: clip.chapter_name || '',
                color: '#ff9b53'
            }));
            app.selection = { kind: 'sequence', id: app.draft.timeline.sequence[0].id, parentId: '' };
            app.draft.timeline.interactions = [{
                id: crypto.randomUUID(),
                sequenceItemId: app.draft.timeline.sequence[0].id,
                prompt: 'Pick the next clip',
                triggerMs: 500,
                behaviorType: 'menu',
                timeoutMs: 0,
                timeoutOptionId: '',
                options: [{
                    id: crypto.randomUUID(),
                    label: 'Go forward',
                    targetClipId: clips[1]?.unique_id || '',
                    rejoinMode: 'end',
                    rejoinSequenceItemId: '',
                    color: '#ff9b53',
                    presentation: 'card',
                    previewImage: '',
                    hotspotAsset: '',
                    hotspot: { x: 14, y: 18, width: 24, height: 18 },
                    conditions: { requiredFlag: '', setFlag: '' }
                }]
            }];
        });

        const previewPopup = page.waitForEvent('popup');
        await page.getByRole('button', { name: /^Preview$/i }).click();
        const preview = await previewPopup;
        track(preview);
        await preview.waitForLoadState('networkidle');
        await preview.getByRole('button', { name: /Start Preview/i }).click();
        await preview.waitForSelector('text=Pick the next clip', { timeout: 10000 });
        await preview.getByText('Go forward').click();
        await preview.waitForTimeout(1200);

        const previewText = await preview.locator('body').innerText();
        assert.ok(previewText.includes('Branch clip'), 'Expected preview to enter a branch clip.');

        await page.getByRole('button', { name: /Build Export/i }).click();
        await page.waitForTimeout(3000);
        const exportLinkCount = await page.locator('a.ghost-btn').count();
        assert.ok(exportLinkCount > 0, 'Expected at least one V2 export link after build.');

        if (errors.length) {
            throw new Error(`Console errors detected:\n${errors.join('\n')}`);
        }

        console.log('V2 smoke test passed.');
    } finally {
        await browser.close();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
