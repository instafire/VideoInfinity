/*
 * Unit tests for the shared movie compiler (public/player/movie-compiler.js).
 *   node test/compiler.test.js
 */
const assert = require('node:assert/strict');
const C = require('../public/player/movie-compiler.js');

const clips = new Map([
    ['A', { unique_id: 'A', name: 'FULL: intro.mp4', filepath: '/videos/a.mp4', thumbnail: '/t/a.jpg', duration: 10 }],
    ['B', { unique_id: 'B', name: 'Path B', filepath: '/clips/b.mp4', thumbnail: '/t/b.jpg', duration: 6 }],
    ['O', { unique_id: 'O', name: 'Door', filepath: '/clips/o.mp4', thumbnail: '/t/o.jpg', duration: 3 }]
]);
const issueCodes = (result) => result.issues.map((i) => i.code);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('upgrades v1 timelines (offset -> at, default actions)', () => {
    const t = C.upgradeTimeline({
        items: [{ id: 'i1', clipId: 'A' }],
        choicePoints: [{ id: 'c1', itemId: 'i1', offset: 4, options: [{ id: 'o1', label: 'Go', clipId: 'O' }] }]
    });
    assert.equal(t.version, 2);
    assert.equal(t.items[0].in, 0);
    assert.equal(t.items[0].out, null);
    assert.equal(t.choicePoints[0].at, 4);
    assert.deepEqual(t.choicePoints[0].options[0].then, { type: 'continue', targetId: null, ending: '' });
    assert.deepEqual(t.settings, { allowSeek: true, showChapters: true, rememberProgress: true });
});

test('sanitizer drops unknown clips, clamps trims and normalizes flags', () => {
    const t = C.sanitizeTimeline({
        items: [
            { id: 'i1', clipId: 'A', in: -3, out: 99 },
            { id: 'i1', clipId: 'B', in: 2, out: 2.01 },
            { id: 'gone', clipId: 'missing' }
        ],
        markers: [{ id: 'm1', itemId: 'gone', at: 1, type: 'chapter' }],
        choicePoints: [{
            id: 'c1', itemId: 'i1', at: 50, timeout: 500,
            options: [{ id: 'o1', label: '  Take key  ', clipId: 'nope', setFlags: ['Has Key', 'has key', '$$'], requires: { flag: ' Door Open ' }, color: 'red' }]
        }]
    }, clips);
    assert.equal(t.items.length, 2);
    assert.equal(t.items[0].in, 0);
    assert.equal(t.items[0].out, null, 'out at the clip end is stored as null');
    assert.notEqual(t.items[1].id, 'i1', 'duplicate ids are replaced');
    assert.ok(t.items[1].out >= t.items[1].in + 0.1, 'minimum clip length enforced');
    assert.equal(t.markers.length, 0, 'markers on unknown items are dropped');
    const p = t.choicePoints[0];
    assert.equal(p.at, 10, 'anchor clamped to the clip length');
    assert.equal(p.timeout, 120);
    assert.equal(p.options[0].label, 'Take key');
    assert.equal(p.options[0].clipId, null);
    assert.deepEqual(p.options[0].setFlags, ['has_key']);
    assert.deepEqual(p.options[0].requires, { flag: 'door_open', is: true });
    assert.equal(p.options[0].color, '#ffffff');
});

test('trims map to segment media offsets and global anchor times', () => {
    const r = C.compileMovie({
        clips,
        timeline: {
            items: [{ id: 'i1', clipId: 'A', in: 2, out: 8 }, { id: 'i2', clipId: 'B' }],
            choicePoints: [
                { id: 'c1', itemId: 'i1', at: 5, options: [{ id: 'o1', clipId: 'O' }] },
                { id: 'c2', itemId: 'i1', at: 9, options: [{ id: 'o2', clipId: 'O' }] }
            ],
            markers: [{ id: 'm1', itemId: 'i2', at: 1, type: 'chapter', label: 'B' }]
        }
    });
    const { movie } = r;
    assert.equal(movie.duration, 12);
    assert.deepEqual(movie.segments.map((s) => [s.src, s.mediaStart, s.duration]), [['/videos/a.mp4', 2, 6], ['/clips/b.mp4', 0, 6]]);
    assert.equal(movie.choicePoints.length, 1, 'the choice in the trimmed-away part is ignored');
    assert.equal(movie.choicePoints[0].time, 3);
    assert.ok(issueCodes(r).includes('choice-trimmed'));
    assert.equal(movie.markers[0].time, 7);
    assert.equal(r.anchors.c2.inRange, false);
});

test('jump and end actions resolve to marker times; broken jumps are reported', () => {
    const r = C.compileMovie({
        clips,
        timeline: {
            items: [{ id: 'i1', clipId: 'A' }, { id: 'i2', clipId: 'B' }],
            markers: [
                { id: 'pathB', itemId: 'i2', at: 0, type: 'chapter', label: 'Path B' },
                { id: 'bad', itemId: 'i1', at: 9, type: 'jump', targetId: 'nowhere' }
            ],
            choicePoints: [{
                id: 'c1', itemId: 'i1', at: 4, allowSkip: false,
                options: [
                    { id: 'toB', label: 'Go to B', then: { type: 'jump', targetId: 'pathB' } },
                    { id: 'die', label: 'Give up', clipId: 'O', then: { type: 'end', ending: 'Bad ending' } },
                    { id: 'broken', label: 'Broken', then: { type: 'jump', targetId: 'missing' } }
                ]
            }]
        }
    });
    const options = r.movie.choicePoints[0].options;
    assert.deepEqual(options.map((o) => o.id), ['toB', 'die', 'broken'], 'a continue option with no clip is kept (it just resumes)');
    assert.equal(options[0].then.targetTime, 10);
    assert.equal(options[0].clip, null);
    assert.equal(options[1].then.ending, 'Bad ending');
    assert.ok(issueCodes(r).includes('jump-target'));
    assert.ok(issueCodes(r).includes('option-jump-target'));
    assert.equal(r.movie.markers.length, 1, 'the broken jump marker is dropped');
});

test('story check finds unreachable parts and reachable endings', () => {
    // Intro (0-10) -> choice: jump to Path B (16-22) or end. Path A (10-16) is never reached.
    const r = C.compileMovie({
        clips,
        timeline: {
            items: [{ id: 'intro', clipId: 'A' }, { id: 'a', clipId: 'B' }, { id: 'b', clipId: 'B' }],
            markers: [
                { id: 'mA', itemId: 'a', at: 0, type: 'chapter', label: 'Path A' },
                { id: 'mB', itemId: 'b', at: 0, type: 'chapter', label: 'Path B' },
                { id: 'secret', itemId: 'a', at: 5, type: 'end', ending: 'Secret ending' }
            ],
            choicePoints: [{
                id: 'c1', itemId: 'intro', at: 9, allowSkip: false,
                options: [
                    { id: 'goB', label: 'B', then: { type: 'jump', targetId: 'mB' } },
                    { id: 'quit', label: 'Quit', then: { type: 'end', ending: 'Quit' } }
                ]
            }]
        }
    });
    const unreachable = r.issues.filter((i) => i.code === 'unreachable');
    assert.equal(unreachable.length, 1);
    assert.match(unreachable[0].message, /0:09\.0.0:16\.0/);
    const reachable = r.movie.endings.filter((e) => e.reachable).map((e) => e.label).sort();
    assert.deepEqual(reachable, ['Quit', 'The End']);
    assert.ok(r.movie.endings.some((e) => e.label === 'Secret ending' && !e.reachable));
    assert.ok(issueCodes(r).includes('ending-unreachable'));
    assert.equal(r.stats.endings, 2);
});

test('loops without a way out are errors; conditional loops are not', () => {
    const base = {
        items: [{ id: 'i1', clipId: 'A' }],
        markers: [
            { id: 'top', itemId: 'i1', at: 2, type: 'chapter', label: 'Top' },
            { id: 'back', itemId: 'i1', at: 6, type: 'jump', targetId: 'top', label: 'Back' }
        ]
    };
    const stuck = C.compileMovie({ clips, timeline: base });
    assert.ok(issueCodes(stuck).includes('loop'));
    assert.ok(issueCodes(stuck).includes('no-ending'));

    const conditional = JSON.parse(JSON.stringify(base));
    conditional.markers[1].condition = { flag: 'again', is: true };
    const ok = C.compileMovie({ clips, timeline: conditional });
    assert.ok(!issueCodes(ok).includes('loop'));
    assert.ok(!issueCodes(ok).includes('no-ending'));
    assert.ok(issueCodes(ok).includes('flag-never-set'));

    const withChoice = JSON.parse(JSON.stringify(base));
    withChoice.choicePoints = [{ id: 'c', itemId: 'i1', at: 4, options: [{ id: 'o', clipId: 'O', then: { type: 'end' } }] }];
    assert.ok(!issueCodes(C.compileMovie({ clips, timeline: withChoice })).includes('loop'));
});

test('captions are parsed (SRT and WebVTT) and follow trims', () => {
    const srt = C.parseCaptions('1\r\n00:00:01,000 --> 00:00:02,500\r\nHello <i>there</i>\r\n\r\n2\r\n00:00:06,000 --> 00:00:09,000\r\nTom &amp; Jerry\r\n');
    assert.deepEqual(srt, [{ start: 1, end: 2.5, text: 'Hello there' }, { start: 6, end: 9, text: 'Tom & Jerry' }]);
    const vtt = C.parseCaptions('WEBVTT\n\nNOTE skip me\n\n00:01.200 --> 00:03.000 align:center\nShort form\n');
    assert.deepEqual(vtt, [{ start: 1.2, end: 3, text: 'Short form' }]);
    assert.deepEqual(C.parseCaptions('not captions'), []);

    const r = C.compileMovie({
        clips,
        captions: { A: srt },
        timeline: { items: [{ id: 'i1', clipId: 'A', in: 2, out: 8 }] }
    });
    // cue 1 (1-2.5) -> 0-0.5 ; cue 2 (6-9) clipped to 6-8 -> 4-6
    assert.deepEqual(r.movie.captions, [{ start: 0, end: 0.5, text: 'Hello there' }, { start: 4, end: 6, text: 'Tom & Jerry' }]);
});

test('frame quantization keeps event times aligned with rendered segments', () => {
    const r = C.compileMovie({
        clips: new Map([['X', { unique_id: 'X', name: 'x', duration: 3.3333 }], ['Y', { unique_id: 'Y', name: 'y', duration: 2.01 }]]),
        quantizeFps: 30,
        timeline: {
            items: [{ id: 'i1', clipId: 'X' }, { id: 'i2', clipId: 'Y' }],
            markers: [{ id: 'm', itemId: 'i2', at: 0, type: 'chapter' }]
        }
    });
    assert.equal(r.movie.segments[0].duration, 100 / 30);
    assert.equal(r.movie.markers[0].time, Math.round((100 / 30) * 1000) / 1000);
    assert.equal(Math.round(r.movie.duration * 30), 160);
});

test('titles are clamped to the movie and empty ones reported', () => {
    const r = C.compileMovie({
        clips,
        timeline: {
            items: [{ id: 'i1', clipId: 'B' }],
            overlays: [
                { id: 't1', itemId: 'i1', at: 4, duration: 10, text: 'Three days later', position: 'top' },
                { id: 't2', itemId: 'i1', at: 1, duration: 2, text: '   ' }
            ]
        }
    });
    assert.deepEqual(r.movie.overlays, [{ id: 't1', text: 'Three days later', position: 'top', start: 4, end: 6 }]);
    assert.ok(issueCodes(r).includes('title-empty'));
});

let failed = 0;
for (const [name, fn] of tests) {
    try {
        fn();
        console.log(`  \u2713 ${name}`);
    } catch (err) {
        failed += 1;
        console.log(`  \u2717 ${name}\n    ${err.stack}`);
    }
}
console.log(`\n${tests.length - failed}/${tests.length} compiler tests passed`);
process.exit(failed ? 1 : 0);
