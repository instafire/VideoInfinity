const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const axios = require('axios');
const { chromium } = require('@playwright/test');

async function getFreePort() {
    return new Promise((resolve, reject) => {
        const listener = net.createServer();
        listener.once('error', reject);
        listener.listen(0, '127.0.0.1', () => {
            const { port } = listener.address();
            listener.close((error) => error ? reject(error) : resolve(port));
        });
    });
}

async function waitForServer(baseUrl, server, readOutput, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            throw new Error(`Server exited with code ${server.exitCode}:\n${readOutput()}`);
        }
        try {
            const response = await axios.get(`${baseUrl}/api/projects`, { timeout: 1000 });
            if (response.status === 200) return response.data;
        } catch (error) {
            if (error.code !== 'ECONNREFUSED' && error.code !== 'ECONNRESET' && error.code !== 'ETIMEDOUT') {
                throw error;
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Server did not start within ${timeoutMs}ms:\n${readOutput()}`);
}

async function run() {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-infinity-e2e-'));
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let server;
    let browser;
    let generatedExportPath;
    let serverOutput = '';
    const pageErrors = [];

    try {
        server = spawn('node', [path.join(__dirname, 'server.js')], {
            cwd: workDir,
            env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
        server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

        const projects = await waitForServer(baseUrl, server, () => serverOutput);
        assert.ok(projects.some((project) => project.title === 'Default Project'));

        const response = await axios.get(baseUrl);
        assert.equal(response.headers['x-content-type-options'], 'nosniff');
        assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');

        const invalidColor = await axios.post(`${baseUrl}/api/project/settings`, {
            id: projects[0].id,
            color: '</style><script>alert(1)</script>'
        }, { validateStatus: () => true });
        assert.equal(invalidColor.status, 400, 'unsafe theme colors must be rejected');

        const publishTitle = `$&</title><script>alert(91)</script> ${Date.now()}`;
        const exportName = publishTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        generatedExportPath = path.join(__dirname, 'public', 'exports', exportName);
        try {
            await fs.access(generatedExportPath);
            throw new Error('refusing to overwrite an existing generated export');
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        const publishResponse = await axios.post(`${baseUrl}/api/publish`, {
            projectId: projects[0].id,
            title: publishTitle,
            sequence: [{ id: `$'</script><script>alert(92)</script>` }]
        });
        assert.equal(publishResponse.status, 200);
        const exportedPlayer = await axios.get(`${baseUrl}${publishResponse.data.url}`);
        assert.ok(exportedPlayer.data.includes('&lt;/title&gt;&lt;script&gt;alert(91)&lt;/script&gt;'));
        assert.ok(!exportedPlayer.data.includes('</title><script>alert(91)</script>'));
        assert.ok(!exportedPlayer.data.includes('</script><script>alert(92)</script>'));
        assert.ok(exportedPlayer.data.includes('\\u003c/script\\u003e\\u003cscript\\u003ealert(92)\\u003c/script\\u003e'));

        browser = await chromium.launch({ headless: true });
        const exportPage = await browser.newPage();
        const exportDialogs = [];
        exportPage.on('dialog', async (dialog) => {
            exportDialogs.push(dialog.message());
            await dialog.dismiss();
        });
        await exportPage.goto(`${baseUrl}${publishResponse.data.url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        assert.deepEqual(exportDialogs, [], 'published HTML must not execute hostile title or playlist scripts');
        await exportPage.close();

        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        page.on('pageerror', (error) => pageErrors.push(error.message));

        await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.getByText('Project Library', { exact: true }).waitFor();
        await page.locator('.grid .glass-panel').filter({ hasText: 'Default Project' }).first().click();
        await page.getByText('Import Media', { exact: true }).waitFor();

        await page.getByRole('button', { name: /Editor/ }).click();
        await page.getByText('Source', { exact: true }).waitFor();
        await page.getByRole('button', { name: /Library/ }).click();
        await page.getByText('All Clips', { exact: true }).waitFor();
        await page.getByRole('button', { name: /Events/ }).click();
        await page.getByText('Logic Options (Triggers at End)', { exact: true }).waitFor();
        await page.getByRole('button', { name: /Stats/ }).click();
        await page.getByText('Project Analytics', { exact: true }).waitFor();
        await page.getByRole('button', { name: /Publish/ }).click();
        await page.getByText('Final Build', { exact: true }).waitFor();

        assert.deepEqual(pageErrors, [], `browser runtime errors: ${pageErrors.join('\n')}`);
        console.log('Classic UI and export smoke tests passed: navigation, safe generated HTML, security headers, and unsafe-theme rejection.');
    } finally {
        if (browser) await browser.close();
        if (server && server.exitCode === null) {
            server.kill('SIGTERM');
            await Promise.race([
                new Promise((resolve) => server.once('exit', resolve)),
                new Promise((resolve) => setTimeout(resolve, 5000))
            ]);
            if (server.exitCode === null) server.kill('SIGKILL');
        }
        await fs.rm(workDir, { recursive: true, force: true });
        if (generatedExportPath) await fs.rm(generatedExportPath, { recursive: true, force: true });
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
