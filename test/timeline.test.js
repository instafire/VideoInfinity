/*
 * End-to-end API test for the Timeline Studio (no browser needed).
 *
 *   npm test
 *
 * Starts the server on a random port with a throwaway database, generates test videos with
 * the bundled FFmpeg, then: uploads -> cuts a clip -> saves a timeline with a choice point ->
 * renders the movie -> checks the exported files -> cleans up.
 */
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FFMPEG = require('ffmpeg-static');
const FFPROBE = require('ffprobe-static').path;
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vi-test-'));
const DB_FILE = path.join(TMP, 'test.sqlite');

const results = [];
function step(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { results.push(['PASS', name]); console.log(`  \u2713 ${name}`); })
        .catch((err) => { results.push(['FAIL', name, err]); console.log(`  \u2717 ${name}\n    ${err.stack || err}`); throw err; });
}

function makeVideo(file, { seconds, size, color, freq }) {
    const args = ['-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=${seconds}`];
    if (freq) args.push('-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:duration=${seconds}`);
    args.push('-vf', `drawbox=c=${color}@0.5:t=fill`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast');
    if (freq) args.push('-c:a', 'aac', '-shortest');
    args.push(file);
    execFileSync(FFMPEG, args);
    return file;
}

function probeDuration(file) {
    return Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}

async function api(method, url, body) {
    const res = await fetch(BASE + url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
}

async function upload(file, projectId, type = 'video/mp4') {
    const form = new FormData();
    form.append('projectId', String(projectId));
    form.append('file', new Blob([fs.readFileSync(file)], { type }), path.basename(file));
    const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
    return { status: res.status, data: await res.json().catch(() => null) };
}

async function waitForServer(timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`${BASE}/api/projects`);
            if (res.ok) return;
        } catch (e) { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error('Server did not start');
}

async function main() {
    console.log(`Timeline Studio API test (port ${PORT})`);
    const server = spawn(process.execPath, ['server_new.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(PORT), DB_FILE },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverLog = '';
    server.stdout.on('data', (d) => { serverLog += d; });
    server.stderr.on('data', (d) => { serverLog += d; });

    const created = { videoIds: [], exports: [], thumbnails: [] };
    let projectId;
    try {
        await waitForServer();

        const intro = makeVideo(path.join(TMP, 'intro.mp4'), { seconds: 4, size: '1280x720', color: 'blue', freq: 220 });
        const ending = makeVideo(path.join(TMP, 'ending.mp4'), { seconds: 3, size: '1280x720', color: 'green', freq: 330 });
        const option = makeVideo(path.join(TMP, 'option.mp4'), { seconds: 2, size: '640x480', color: 'red' }); // no audio track
        const fake = path.join(TMP, 'not-a-video.mp4');
        fs.writeFileSync(fake, 'this is not a video file');

        await step('create project', async () => {
            const res = await api('POST', '/api/projects', { title: 'API test' });
            assert.equal(res.status, 200);
            projectId = res.data.projectId;
            assert.ok(projectId > 0);
        });

        const uploaded = {};
        await step('upload standard FFmpeg MP4s (ftyp box size 0x20)', async () => {
            const header = fs.readFileSync(intro).subarray(0, 8).toString('hex');
            assert.notEqual(header, '0000001866747970', 'fixture should not use the old hard-coded header');
            for (const [key, file] of Object.entries({ intro, ending, option })) {
                const res = await upload(file, projectId);
                assert.equal(res.status, 200, JSON.stringify(res.data));
                assert.equal(res.data.success, true);
                assert.ok(res.data.clipId && res.data.videoId, 'upload returns ids');
                uploaded[key] = res.data;
                created.videoIds.push(res.data.videoId);
                if (res.data.thumbnail) created.thumbnails.push(res.data.thumbnail);
            }
        });

        await step('reject files that are not really videos', async () => {
            const res = await upload(fake, projectId);
            assert.equal(res.status, 400);
            assert.match(res.data.error, /valid video/);
        });

        let cutClipId;
        await step('cut a clip (1s to 3s)', async () => {
            const res = await api('POST', '/api/clip', {
                projectId, sourceId: uploaded.intro.videoId, start: 1, end: 3, name: 'Intro cut'
            });
            assert.equal(res.status, 200, JSON.stringify(res.data));
            cutClipId = res.data.clipId;
            const story = await api('GET', `/api/story?projectId=${projectId}`);
            const clip = story.data.clips.find((c) => c.unique_id === cutClipId);
            assert.ok(clip, 'clip saved');
            assert.equal(clip.duration, 2);
            if (clip.thumbnail) created.thumbnails.push(clip.thumbnail);
        });

        await step('reject a clip whose OUT is before IN', async () => {
            const res = await api('POST', '/api/clip', { projectId, sourceId: uploaded.intro.videoId, start: 3, end: 2, name: 'bad' });
            assert.equal(res.status, 400);
        });

        await step('save + load a timeline (sanitized)', async () => {
            const timeline = {
                items: [
                    { id: 'item-1', clipId: cutClipId },
                    { id: 'item-2', clipId: uploaded.ending.clipId },
                    { id: 'item-x', clipId: '00000000-0000-4000-8000-000000000000' } // unknown clip -> dropped
                ],
                choicePoints: [{
                    id: 'cp-1', itemId: 'item-1', offset: 1, prompt: 'Which way?', timeout: 0, allowSkip: true,
                    options: [
                        { id: 'opt-1', label: 'Go left', clipId: uploaded.option.clipId, color: '#ffcc00' },
                        { id: 'opt-2', label: 'Not ready yet', clipId: null, color: 'red' }
                    ]
                }, { id: 'cp-orphan', itemId: 'item-x', offset: 0, options: [] }]
            };
            const save = await api('POST', '/api/timeline', { projectId, timeline });
            assert.equal(save.status, 200, JSON.stringify(save.data));
            const load = await api('GET', `/api/timeline?projectId=${projectId}`);
            const tl = load.data.timeline;
            assert.deepEqual(tl.items.map((i) => i.id), ['item-1', 'item-2']);
            assert.equal(tl.choicePoints.length, 1);
            assert.equal(tl.choicePoints[0].options[1].clipId, null);
            assert.equal(tl.choicePoints[0].options[1].color, '#ffffff', 'invalid colours are replaced');
        });

        let job;
        await step('render the movie', async () => {
            const res = await api('POST', '/api/timeline/render', { projectId, title: 'API Test Movie', resolution: '480p' });
            assert.equal(res.status, 200, JSON.stringify(res.data));
            job = res.data.job;
            const start = Date.now();
            while (Date.now() - start < 120000) {
                const poll = await api('GET', `/api/render_jobs/${job.id}`);
                job = poll.data.job;
                if (job.status === 'done' || job.status === 'error') break;
                await new Promise((r) => setTimeout(r, 500));
            }
            assert.equal(job.status, 'done', job.error || 'render did not finish');
            created.exports.push(job.exportName);
        });

        await step('exported movie is stitched with the choice at the right time', async () => {
            const dir = path.join(ROOT, 'public', 'exports', job.exportName);
            const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'movie.json'), 'utf8'));
            assert.equal(manifest.title, 'API Test Movie');
            assert.equal(manifest.height, 480);
            assert.ok(Math.abs(manifest.duration - 5) < 0.05, `duration ${manifest.duration}`);
            assert.equal(manifest.segments.length, 1, 'main track is a single stitched file');
            assert.equal(manifest.choicePoints.length, 1);
            assert.ok(Math.abs(manifest.choicePoints[0].time - 1) < 0.05);
            assert.equal(manifest.choicePoints[0].options.length, 2, 'the continue option with no clip is kept (it resumes the movie)');
            const main = path.join(dir, manifest.segments[0].src);
            const opt = path.join(dir, manifest.choicePoints[0].options[0].clip.src);
            assert.ok(Math.abs(probeDuration(main) - 5) < 0.1, 'main.mp4 is 2s + 3s');
            assert.ok(Math.abs(probeDuration(opt) - 2) < 0.1, 'option clip encoded');
            const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
            assert.ok(html.includes('InteractivePlayer'), 'player is inlined');
            assert.ok(!/unpkg\.com|cdn\.tailwindcss/.test(html), 'export has no CDN dependencies');
        });

        await step('render refuses an empty timeline', async () => {
            const other = await api('POST', '/api/projects', { title: 'Empty' });
            const res = await api('POST', '/api/timeline/render', { projectId: other.data.projectId, title: 'x' });
            assert.equal(res.status, 400);
        });
    } finally {
        for (const name of created.exports) await api('POST', '/api/delete_export', { name }).catch(() => {});
        for (const id of created.videoIds) await api('POST', '/api/delete_video', { id }).catch(() => {});
        for (const thumb of created.thumbnails) fs.rmSync(path.join(ROOT, 'public', thumb.replace(/^\/+/, '')), { force: true });
        server.kill();
        fs.rmSync(TMP, { recursive: true, force: true });
    }

    const failed = results.filter((r) => r[0] === 'FAIL');
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    if (failed.length) {
        console.log('\nServer log:\n' + serverLog.split('\n').slice(-30).join('\n'));
        process.exit(1);
    }
}

main().catch(() => process.exit(1));
