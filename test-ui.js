const { expect, test } = require('@playwright/test');

const views = [
    ['/media', '.media-library', 'Media Library'],
    ['/scenes', '.scene-editor', 'Scenes'],
    ['/timeline', '.timeline-view', 'Timeline'],
    ['/branches', '.branch-editor', 'Branches'],
    ['/events', '.event-editor', 'Events'],
    ['/preview', '.preview-view', 'Preview'],
    ['/analytics', '.analytics-view', 'Analytics'],
    ['/publish', '.publish-view', 'Publish']
];

test('modular studio loads its project and every sidebar view', async ({ page, request, baseURL }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const apiResponse = await request.get('/api/projects');
    expect(apiResponse.status()).toBe(200);
    const projects = await apiResponse.json();
    expect(projects.some((project) => project.title === 'Default Project')).toBe(true);

    const response = await page.goto(baseURL, { waitUntil: 'networkidle' });
    expect(response.status()).toBe(200);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    await expect(page.locator('.app-layout')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.project-info .project-name')).toContainText('Default Project');
    await expect(page.locator('.nav-item')).toHaveCount(9);

    for (const [route, selector, label] of views) {
        await page.locator(`a[href="#${route}"]`).click();
        await expect(page.locator(selector), `${label} view should render`).toBeVisible();
    }

    expect(pageErrors).toEqual([]);
});
