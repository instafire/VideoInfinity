const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const { chromium } = require('@playwright/test');

const APP_URL = 'http://127.0.0.1:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'phase1');

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReachable() {
    try {
        const response = await axios.get(APP_URL, { timeout: 1500, validateStatus: () => true });
        return response.status >= 200 && response.status < 500;
    } catch (error) {
        return false;
    }
}

async function waitForServer(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await isServerReachable()) {
            return;
        }
        await delay(500);
    }
    throw new Error(`Server did not start within ${timeoutMs}ms`);
}

async function stopServer(server) {
    if (!server || server.killed) return;
    if (process.platform === 'win32') {
        await new Promise((resolve) => {
            const killer = spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
            killer.on('exit', () => resolve());
            killer.on('error', () => resolve());
        });
        return;
    }
    server.kill('SIGTERM');
}

async function screenshot(page, name) {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: true });
}

async function run() {
    let server = null;
    let browser = null;
    let startedServer = false;
    const pageErrors = [];
    const consoleErrors = [];

    try {
        if (!(await isServerReachable())) {
            server = spawn('node', ['server.js'], {
                cwd: __dirname,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            startedServer = true;
            server.stdout.on('data', (chunk) => process.stdout.write(chunk));
            server.stderr.on('data', (chunk) => process.stderr.write(chunk));
            await waitForServer();
        }

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width: 1600, height: 1000 }
        });
        const page = await context.newPage();

        const trackPage = (trackedPage) => {
            trackedPage.on('pageerror', (error) => {
                pageErrors.push(error.message);
            });
            trackedPage.on('console', (msg) => {
                if (msg.type() !== 'error') return;
                const text = msg.text();
                if (text.includes('favicon.ico')) return;
                consoleErrors.push(text);
            });
        };

        trackPage(page);

        console.log('1. Open project library');
        await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForSelector('text=Project Library');
        await screenshot(page, '01-project-library.png');

        console.log('2. Select Default Project');
        await page.locator('div.project-card-3d:has-text("Default Project")').first().click();
        await page.waitForFunction(() => window.__studioApp?.currentProject?.title === 'Default Project');
        await page.waitForSelector('text=Story Workspace');
        await screenshot(page, '02-workspace-shell.png');

        console.log('3. Verify the unified editor opens first');
        await page.waitForFunction(() => window.__studioApp?.view === 'editor');
        await page.waitForSelector('text=Story Timeline');
        await screenshot(page, '03-editor-view.png');

        console.log('4. Verify workspace navigation');
        for (const label of ['Editor', 'Media', 'Scenes', 'Branches', 'Publish', 'Library', 'Events', 'Analytics', 'Rewards']) {
            await page.getByRole('button', { name: new RegExp(label, 'i') }).first().waitFor({ state: 'visible' });
        }

        console.log('5. Navigate to Scenes');
        await page.getByRole('button', { name: /^Scenes/i }).first().click();
        await page.waitForSelector('text=Clip Library');
        await screenshot(page, '04-scenes-view.png');

        console.log('6. Navigate to Library');
        await page.getByRole('button', { name: /^Library/i }).first().click();
        await page.waitForSelector('text=All Clips');
        await page.waitForFunction(() => window.__studioApp?.clips?.length > 0);
        await page.evaluate(() => {
            const app = window.__studioApp;
            const clip = app.clips[0];
            app.librarySelectedClip = clip ? JSON.parse(JSON.stringify(clip)) : null;
        });
        await page.waitForSelector('text=Story Metadata');
        await page.waitForSelector('text=Reusable Presets');
        await screenshot(page, '05-library-view.png');

        console.log('7. Navigate to Events');
        await page.getByRole('button', { name: /^Events/i }).first().click();
        await page.waitForSelector('text=Logic Options');
        await screenshot(page, '06-events-view.png');

        console.log('8. Navigate to Branches');
        await page.getByRole('button', { name: /^Branches/i }).first().click();
        await page.waitForSelector('text=Graph View');

        const logicOption = await page.evaluate(() => {
            const app = window.__studioApp;
            const first = app.masterClips[0] || app.eventClips[0] || app.subClips[0];
            return first ? first.unique_id : null;
        });
        assert.ok(logicOption, 'Expected at least one clip for logic testing');
        await page.locator('select').first().selectOption(logicOption);
        await page.waitForTimeout(1000);
        await page.getByRole('button', { name: /Graph View/i }).click();
        await page.waitForSelector('.graph-node');
        await screenshot(page, '07-branches-graph.png');
        await page.getByRole('button', { name: /^Back to Timeline$/i }).click();
        await page.waitForSelector('text=TIMELINE');

        console.log('9. Navigate to Analytics and Rewards');
        await page.getByRole('button', { name: /^Analytics/i }).first().click();
        await page.waitForSelector('text=Project Analytics');
        await page.waitForSelector('text=Scene Reach');
        await screenshot(page, '08-analytics-view.png');
        await page.getByRole('button', { name: /^Rewards/i }).first().click();
        await page.waitForSelector('text=Achievements');
        await screenshot(page, '09-rewards-view.png');

        console.log('10. Navigate to Publish and seed a preview sequence');
        await page.getByRole('button', { name: /^Publish/i }).first().click();
        await page.waitForSelector('text=Final Build');
        await page.waitForSelector('text=Diagnostics');
        await page.waitForFunction(() => window.__studioApp?.filteredPublishClips?.length > 0);
        await page.evaluate(() => {
            const app = window.__studioApp;
            app.storySequence = app.filteredPublishClips.slice(0, 2).map((clip) => ({
                id: clip.unique_id,
                name: clip.name
            }));
        });
        await page.waitForFunction(() => window.__studioApp?.storySequence?.length > 0);
        await screenshot(page, '10-publish-view.png');

        console.log('11. Launch preview overlay');
        await page.locator('[data-testid=\"publish-preview\"]').click();
        await page.waitForFunction(() => window.__studioApp?.previewMode === true);
        await page.waitForSelector('text=Simulating:');
        await page.waitForFunction(() => {
            const app = window.__studioApp;
            return Boolean(app?.previewShowChoices || app?.previewCurrentClip || app?.previewIsGameOver);
        });
        await screenshot(page, '11-preview-overlay.png');
        await page.getByRole('button', { name: /Close/i }).click();
        await page.waitForFunction(() => window.__studioApp?.previewMode === false);

        console.log('12. Build and open published player');
        await page.locator('[data-testid=\"publish-build\"]').click();
        await page.waitForFunction(
            () => window.__studioApp?.publishing === true || Boolean(window.__studioApp?.publishUrl),
            null,
            { timeout: 10000 }
        ).catch(() => {});
        await page.waitForFunction(
            () => window.__studioApp?.publishing === false || Boolean(window.__studioApp?.publishUrl),
            null,
            { timeout: 90000 }
        ).catch(() => {});
        let publishState = await page.evaluate(() => ({
            publishUrl: window.__studioApp?.publishUrl || '',
            toast: window.__studioApp?.toast || null,
            diagnostics: window.__studioApp?.storyDiagnostics?.summary || null,
            sequence: window.__studioApp?.storySequence || [],
            projectId: window.__studioApp?.currentProject?.id || null,
            title: window.__studioApp?.publishTitle || window.__studioApp?.currentProject?.title || 'Untitled Movie'
        }));
        console.log('Publish state after button click:', publishState);

        if (!publishState.publishUrl && !publishState?.diagnostics?.errorCount) {
            await page.evaluate(() => window.__studioApp?.publishProject());
            await page.waitForFunction(
                () => window.__studioApp?.publishing === false || Boolean(window.__studioApp?.publishUrl),
                null,
                { timeout: 90000 }
            ).catch(() => {});
            publishState = await page.evaluate(() => ({
                publishUrl: window.__studioApp?.publishUrl || '',
                toast: window.__studioApp?.toast || null,
                diagnostics: window.__studioApp?.storyDiagnostics?.summary || null,
                sequence: window.__studioApp?.storySequence || [],
                projectId: window.__studioApp?.currentProject?.id || null,
                title: window.__studioApp?.publishTitle || window.__studioApp?.currentProject?.title || 'Untitled Movie'
            }));
            console.log('Publish state after direct method call:', publishState);
        }

        let publishUrl = publishState.publishUrl;
        if (!publishUrl && publishState.projectId && Array.isArray(publishState.sequence) && publishState.sequence.length) {
            const directPublish = await page.evaluate(async ({ projectId, title, sequence }) => {
                const response = await fetch('/api/publish', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId, title, sequence })
                });
                if (!response.ok) {
                    return { ok: false, status: response.status, body: await response.text() };
                }
                return { ok: true, data: await response.json() };
            }, {
                projectId: publishState.projectId,
                title: publishState.title,
                sequence: publishState.sequence
            });
            assert.ok(directPublish.ok, `Direct publish failed: ${JSON.stringify(directPublish)}`);
            publishUrl = directPublish.data.url;
        }

        assert.ok(publishUrl, 'Expected publish URL after build');
        const playerPage = await context.newPage();
        trackPage(playerPage);
        await playerPage.goto(new URL(publishUrl, APP_URL).href, { waitUntil: 'networkidle', timeout: 60000 });
        await playerPage.waitForSelector('text=Start Movie');
        await screenshot(playerPage, '12-published-player.png');

        console.log('13. Validate Phase 1 state contract');
        const summary = await page.evaluate(() => ({
            workspaceGroup: window.__studioApp.currentWorkspaceGroup,
            activeViews: window.__studioApp.activeWorkspaceViews,
            project: window.__studioApp.currentProject?.title,
            sequenceCount: window.__studioApp.storySequence.length,
            publishUrl: window.__studioApp.publishUrl
        }));
        assert.equal(summary.project, 'Default Project');
        assert.ok(Array.isArray(summary.activeViews) && summary.activeViews.length > 0, 'Expected active workspace views');
        assert.ok(summary.sequenceCount > 0, 'Expected seeded publish sequence');
        assert.ok(summary.publishUrl, 'Expected a published player URL');

        if (pageErrors.length) {
            throw new Error(`Page errors detected:\n${pageErrors.join('\n')}`);
        }
        if (consoleErrors.length) {
            throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
        }

        console.log('Phase 1 end-to-end test passed.');
        console.log(`Screenshots: ${SCREENSHOT_DIR}`);
    } finally {
        if (browser) {
            await browser.close();
        }
        if (startedServer) {
            await stopServer(server);
        }
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
