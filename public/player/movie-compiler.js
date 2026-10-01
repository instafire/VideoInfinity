/*!
 * Video Infinity - movie compiler
 *
 * Turns a saved timeline (what the studio edits) into a playable movie (what the player
 * runs) and checks the story for problems. The same code runs in the studio preview, in the
 * server's export and in the tests, so the preview always behaves like the exported movie.
 *
 * Timeline (v2):
 *   items:        [{ id, clipId, in, out }]                    main track, back to back;
 *                                                               in/out trim the clip (seconds, out=null -> clip end)
 *   choicePoints: [{ id, itemId, at, prompt, timeout, mode, allowSkip, defaultOptionId,
 *                    options: [{ id, label, clipId|null, color,
 *                                then: { type: continue|jump|end, targetId, ending },
 *                                setFlags: [], requires: { flag, is }|null, whenLocked: hide|lock }] }]
 *   markers:      [{ id, itemId, at, type: chapter|jump|end, label, targetId, condition, ending }]
 *   overlays:     [{ id, itemId, at, duration, text, position }]
 *   settings:     { allowSeek, showChapters, rememberProgress }
 * `at` is a time inside the item's clip (media time), so anchors stay on the same frame when
 * the clip is trimmed and move with the clip when clips are reordered.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MovieCompiler = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var MIN_CLIP = 0.1;
    var LIMITS = { items: 500, choicePoints: 300, options: 6, markers: 300, overlays: 300, flags: 8 };
    var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
    var HEX_RE = /^#[0-9a-f]{6}$/i;
    var MARKER_TYPES = ['chapter', 'jump', 'end'];
    var POSITIONS = ['top', 'center', 'lower', 'bottom'];

    function num(value, fallback) {
        var n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function round3(value) {
        return Math.round(value * 1000) / 1000;
    }

    function text(value, max) {
        return typeof value === 'string' ? value.trim().slice(0, max) : '';
    }

    function fmt(seconds) {
        seconds = Math.max(0, Number(seconds) || 0);
        var m = Math.floor(seconds / 60);
        var s = seconds - m * 60;
        return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
    }

    function displayName(clip) {
        return clip ? String(clip.name || 'Untitled').replace(/^FULL:\s*/, '') : 'Missing clip';
    }

    function randomId() {
        return 'id' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }

    function normalizeFlag(name) {
        return String(name === null || name === undefined ? '' : name)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_-]/g, '')
            .slice(0, 40);
    }

    function normalizeFlags(list) {
        var source = Array.isArray(list) ? list : (typeof list === 'string' ? list.split(',') : []);
        var out = [];
        source.forEach(function (item) {
            var flag = normalizeFlag(item);
            if (flag && out.indexOf(flag) === -1 && out.length < LIMITS.flags) out.push(flag);
        });
        return out;
    }

    function normalizeCondition(condition) {
        if (!condition || typeof condition !== 'object') return null;
        var flag = normalizeFlag(condition.flag);
        return flag ? { flag: flag, is: condition.is !== false } : null;
    }

    function normalizeThen(then) {
        var type = then && (then.type === 'jump' || then.type === 'end') ? then.type : 'continue';
        return {
            type: type,
            targetId: type === 'jump' && typeof then.targetId === 'string' && then.targetId ? then.targetId : null,
            ending: type === 'end' ? text(then.ending, 80) : ''
        };
    }

    function lookupFrom(source) {
        if (!source) return function () { return null; };
        if (typeof source === 'function') return source;
        if (typeof source.get === 'function') return function (id) { return source.get(id) || null; };
        if (Array.isArray(source)) {
            var map = new Map(source.map(function (c) { return [c.unique_id, c]; }));
            return function (id) { return map.get(id) || null; };
        }
        return function (id) { return Object.prototype.hasOwnProperty.call(source, id) ? source[id] : null; };
    }

    // ------------------------------------------------------------------ timeline shape

    // Upgrades any saved timeline (v1 or v2) to the v2 shape. References are not validated.
    function upgradeTimeline(raw) {
        var t = raw && typeof raw === 'object' ? raw : {};
        var atOf = function (o) { return o.at !== undefined ? num(o.at, 0) : num(o.offset, 0); }; // v1 used offset (in was always 0)
        var settings = t.settings && typeof t.settings === 'object' ? t.settings : {};
        return {
            version: 2,
            settings: {
                allowSeek: settings.allowSeek !== false,
                showChapters: settings.showChapters !== false,
                rememberProgress: settings.rememberProgress !== false
            },
            items: (Array.isArray(t.items) ? t.items : []).filter(Boolean).map(function (item) {
                return {
                    id: String(item.id || ''),
                    clipId: item.clipId,
                    in: Math.max(0, num(item.in, 0)),
                    out: item.out === null || item.out === undefined ? null : num(item.out, null)
                };
            }),
            choicePoints: (Array.isArray(t.choicePoints) ? t.choicePoints : []).filter(Boolean).map(function (p) {
                return {
                    id: String(p.id || ''),
                    itemId: p.itemId,
                    at: atOf(p),
                    prompt: typeof p.prompt === 'string' ? p.prompt : '',
                    timeout: Math.max(0, num(p.timeout, 0)),
                    mode: p.mode === 'play' ? 'play' : 'pause',
                    allowSkip: p.allowSkip !== false,
                    defaultOptionId: p.defaultOptionId || null,
                    options: (Array.isArray(p.options) ? p.options : []).filter(Boolean).map(function (o) {
                        return {
                            id: String(o.id || ''),
                            label: typeof o.label === 'string' ? o.label : '',
                            clipId: o.clipId || null,
                            color: HEX_RE.test(o.color || '') ? o.color : '#ffffff',
                            then: normalizeThen(o.then),
                            setFlags: normalizeFlags(o.setFlags),
                            requires: normalizeCondition(o.requires),
                            whenLocked: o.whenLocked === 'lock' ? 'lock' : 'hide'
                        };
                    })
                };
            }),
            markers: (Array.isArray(t.markers) ? t.markers : []).filter(Boolean).map(function (m) {
                var type = MARKER_TYPES.indexOf(m.type) !== -1 ? m.type : 'chapter';
                return {
                    id: String(m.id || ''),
                    itemId: m.itemId,
                    at: num(m.at, 0),
                    type: type,
                    label: typeof m.label === 'string' ? m.label : '',
                    targetId: type === 'jump' && typeof m.targetId === 'string' && m.targetId ? m.targetId : null,
                    condition: type === 'chapter' ? null : normalizeCondition(m.condition),
                    ending: type === 'end' && typeof m.ending === 'string' ? m.ending : ''
                };
            }),
            overlays: (Array.isArray(t.overlays) ? t.overlays : []).filter(Boolean).map(function (o) {
                return {
                    id: String(o.id || ''),
                    itemId: o.itemId,
                    at: num(o.at, 0),
                    duration: num(o.duration, 3),
                    text: typeof o.text === 'string' ? o.text : '',
                    position: POSITIONS.indexOf(o.position) !== -1 ? o.position : 'lower'
                };
            })
        };
    }

    // Validates a timeline coming from the client: unknown clips/items are dropped, numbers are
    // clamped, strings trimmed and ids made unique. `getClip(id)` returns { duration } or null.
    function sanitizeTimeline(raw, getClip) {
        var lookup = lookupFrom(getClip);
        var t = upgradeTimeline(raw);
        var used = new Set();
        var cleanId = function (value) {
            var id = typeof value === 'string' && ID_RE.test(value) && !used.has(value) ? value : null;
            while (!id || used.has(id)) id = randomId();
            used.add(id);
            return id;
        };
        var clipDuration = function (clipId) {
            var clip = lookup(clipId);
            return clip ? Math.max(MIN_CLIP, num(clip.duration, 0)) : 0;
        };

        var items = [];
        var itemClip = new Map();
        t.items.slice(0, LIMITS.items).forEach(function (item) {
            if (typeof item.clipId !== 'string' || !lookup(item.clipId)) return;
            var dur = clipDuration(item.clipId);
            var inPoint = clamp(item.in, 0, Math.max(0, dur - MIN_CLIP));
            var out = item.out === null || item.out >= dur - 0.0005 ? null : clamp(item.out, inPoint + MIN_CLIP, dur);
            var id = cleanId(item.id);
            items.push({ id: id, clipId: item.clipId, in: round3(inPoint), out: out === null ? null : round3(out) });
            itemClip.set(id, item.clipId);
        });

        var anchorAt = function (itemId, at) {
            return round3(clamp(num(at, 0), 0, clipDuration(itemClip.get(itemId))));
        };

        var markers = [];
        t.markers.slice(0, LIMITS.markers).forEach(function (m) {
            if (!itemClip.has(m.itemId)) return;
            markers.push({
                id: cleanId(m.id),
                itemId: m.itemId,
                at: anchorAt(m.itemId, m.at),
                type: m.type,
                label: text(m.label, 60),
                targetId: m.type === 'jump' && m.targetId && ID_RE.test(m.targetId) ? m.targetId : null,
                condition: m.condition,
                ending: m.type === 'end' ? text(m.ending, 80) : ''
            });
        });

        var choicePoints = [];
        t.choicePoints.slice(0, LIMITS.choicePoints).forEach(function (p) {
            if (!itemClip.has(p.itemId)) return;
            var optionIds = new Set();
            var options = p.options.slice(0, LIMITS.options).map(function (o) {
                var id = cleanId(o.id);
                optionIds.add(id);
                var then = o.then;
                return {
                    id: id,
                    label: text(o.label, 80),
                    clipId: typeof o.clipId === 'string' && lookup(o.clipId) ? o.clipId : null,
                    color: o.color,
                    then: {
                        type: then.type,
                        targetId: then.type === 'jump' && then.targetId && ID_RE.test(then.targetId) ? then.targetId : null,
                        ending: then.type === 'end' ? text(then.ending, 80) : ''
                    },
                    setFlags: o.setFlags,
                    requires: o.requires,
                    whenLocked: o.whenLocked
                };
            });
            choicePoints.push({
                id: cleanId(p.id),
                itemId: p.itemId,
                at: anchorAt(p.itemId, p.at),
                prompt: text(p.prompt, 160),
                timeout: round3(clamp(p.timeout, 0, 120)),
                mode: p.mode,
                allowSkip: p.allowSkip,
                defaultOptionId: optionIds.has(p.defaultOptionId) ? p.defaultOptionId : null,
                options: options
            });
        });

        var overlays = [];
        t.overlays.slice(0, LIMITS.overlays).forEach(function (o) {
            if (!itemClip.has(o.itemId)) return;
            overlays.push({
                id: cleanId(o.id),
                itemId: o.itemId,
                at: anchorAt(o.itemId, o.at),
                duration: round3(clamp(o.duration, 0.5, 600)),
                text: typeof o.text === 'string' ? o.text.replace(/\r/g, '').slice(0, 300) : '',
                position: o.position
            });
        });

        return { version: 2, settings: t.settings, items: items, choicePoints: choicePoints, markers: markers, overlays: overlays };
    }

    // ------------------------------------------------------------------ captions

    var ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

    // Parses SRT or WebVTT text into [{ start, end, text }] (seconds), sorted by start.
    function parseCaptions(input) {
        var source = String(input || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        var timeRe = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
        var toSeconds = function (h, m, s, ms) {
            return (h ? parseInt(h, 10) : 0) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt((ms + '00').slice(0, 3), 10) / 1000;
        };
        var cues = [];
        source.split(/\n{2,}/).forEach(function (block) {
            var lines = block.split('\n');
            var index = -1;
            for (var i = 0; i < lines.length; i++) {
                if (timeRe.test(lines[i])) { index = i; break; }
            }
            if (index === -1) return; // WEBVTT header, NOTE, STYLE, REGION blocks
            var m = timeRe.exec(lines[index]);
            var start = toSeconds(m[1], m[2], m[3], m[4]);
            var end = toSeconds(m[5], m[6], m[7], m[8]);
            var body = lines.slice(index + 1).join('\n')
                .replace(/<[^>]*>/g, '')
                .replace(/\{\\[^}]*\}/g, '')
                .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, function (entity) { return ENTITIES[entity]; })
                .trim();
            if (body && end > start) cues.push({ start: round3(start), end: round3(end), text: body.slice(0, 500) });
        });
        cues.sort(function (a, b) { return a.start - b.start; });
        return cues.slice(0, 5000);
    }

    // ------------------------------------------------------------------ story analysis

    function choiceCanContinue(point) {
        if (point.allowSkip) return true;
        if (point.timeout > 0) {
            if (!point.defaultOptionId) return true;
            var def = point.options.filter(function (o) { return o.id === point.defaultOptionId; })[0];
            if (!def || def.then.type === 'continue' || def.requires) return true;
        }
        if (point.options.some(function (o) { return o.then.type === 'continue'; })) return true;
        // If every option depends on a flag, they might all be unavailable -> the choice is skipped
        return point.options.every(function (o) { return o.requires; });
    }

    // Follows every possible path through the movie. Flags are treated as "could be either", so
    // results describe what is *possibly* reachable. Jumps land with choices at the target
    // active and markers at the target inactive (exactly like the player).
    function analyzeStory(total, points, markers) {
        var actions = markers.filter(function (m) { return m.type !== 'chapter'; });
        var result = { intervals: [], endings: new Set(), forced: new Map(), entries: 0, capped: false };
        if (!(total > 0)) return result;
        var queue = [0];
        var seen = new Set();
        var steps = 0;
        while (queue.length) {
            if (++steps > 4000) { result.capped = true; break; }
            var t = queue.shift();
            var key = t.toFixed(3);
            if (seen.has(key)) continue;
            seen.add(key);
            var ci = 0;
            while (ci < points.length && points[ci].time < t - 1e-4) ci++;
            var mi = 0;
            while (mi < actions.length && actions[mi].time <= t + 1e-4) mi++;
            var stop = total;
            var open = true;
            var hadExit = false;
            while (open) {
                var cp = points[ci];
                var mk = actions[mi];
                if (!cp && !mk) break;
                if (cp && (!mk || cp.time <= mk.time + 1e-6)) {
                    hadExit = true;
                    cp.options.forEach(function (o) {
                        if (o.then.type === 'jump' && o.then.targetTime !== null) queue.push(o.then.targetTime);
                        else if (o.then.type === 'end') result.endings.add(o.id);
                    });
                    if (!choiceCanContinue(cp)) { stop = cp.time; open = false; }
                    ci++;
                } else {
                    if (mk.type === 'jump') {
                        queue.push(mk.targetTime);
                        if (!mk.condition) {
                            stop = mk.time;
                            open = false;
                            if (!hadExit) result.forced.set(key, { to: mk.targetTime.toFixed(3), marker: mk });
                        } else {
                            hadExit = true;
                        }
                    } else {
                        result.endings.add(mk.id);
                        if (!mk.condition) { stop = mk.time; open = false; } else hadExit = true;
                    }
                    mi++;
                }
            }
            if (open) result.endings.add('__end__');
            result.intervals.push([t, stop]);
        }
        result.entries = seen.size;
        return result;
    }

    function mergeIntervals(intervals) {
        var sorted = intervals.slice().sort(function (a, b) { return a[0] - b[0]; });
        var merged = [];
        sorted.forEach(function (iv) {
            var last = merged[merged.length - 1];
            if (last && iv[0] <= last[1] + 0.05) last[1] = Math.max(last[1], iv[1]);
            else merged.push([iv[0], iv[1]]);
        });
        return merged;
    }

    // ------------------------------------------------------------------ compile

    /**
     * compileMovie({ timeline, clips, captions, quantizeFps, resolveMain, resolveOption })
     *   clips:   Map / array / object / function -> { unique_id, name, filepath, thumbnail, duration }
     *   captions: Map / object clipId -> cues (optional)
     *   quantizeFps: round clip lengths to whole frames (the export does this so times match the render)
     * Returns { movie, entries, anchors, issues, stats }.
     */
    function compileMovie(input) {
        input = input || {};
        var timeline = upgradeTimeline(input.timeline);
        var getClip = lookupFrom(input.clips);
        var getCaptions = lookupFrom(input.captions);
        var fps = Number(input.quantizeFps) || 0;
        var resolveMain = input.resolveMain || function (clip) { return clip.filepath; };
        var resolveOption = input.resolveOption || function (clip) { return { src: clip.filepath, poster: clip.thumbnail || '' }; };
        var issues = [];
        var issue = function (severity, code, message, target) {
            issues.push({ severity: severity, code: code, message: message, target: target || null });
        };
        var captionsFor = function (clipId) {
            var cues = getCaptions(clipId);
            return Array.isArray(cues) ? cues : [];
        };

        // 1) main track
        var entries = [];
        var cursor = 0;
        timeline.items.forEach(function (item) {
            var clip = getClip(item.clipId);
            if (!clip) return;
            var clipDur = Math.max(MIN_CLIP, num(clip.duration, 0));
            var inPoint = clamp(num(item.in, 0), 0, Math.max(0, clipDur - MIN_CLIP));
            var out = item.out === null || item.out === undefined ? clipDur : clamp(num(item.out, clipDur), inPoint + MIN_CLIP, clipDur);
            var duration = out - inPoint;
            if (fps) duration = Math.max(1, Math.round(duration * fps)) / fps;
            entries.push({
                itemId: item.id, clipId: item.clipId, clip: clip,
                in: inPoint, out: out, duration: duration,
                start: cursor, end: cursor + duration,
                trimmed: inPoint > 0.0005 || out < clipDur - 0.0005
            });
            cursor += duration;
        });
        var total = cursor;
        var byItem = new Map(entries.map(function (e) { return [e.itemId, e]; }));
        if (!entries.length) issue('error', 'empty', 'Add at least one clip to the main movie track.');

        var anchors = {};
        var place = function (id, itemId, at) {
            var entry = byItem.get(itemId);
            if (!entry) return null;
            var local = num(at, 0) - entry.in;
            var inRange = local >= -0.001 && local <= entry.out - entry.in + 0.001;
            var placed = { time: entry.start + clamp(local, 0, entry.duration), inRange: inRange, itemId: itemId, entry: entry };
            anchors[id] = { time: placed.time, inRange: inRange, itemId: itemId };
            return placed;
        };

        // 2) markers
        var markerList = [];
        timeline.markers.forEach(function (m) {
            var placed = place(m.id, m.itemId, m.at);
            if (!placed) return;
            var name = text(m.label, 60) || (m.type === 'chapter' ? 'Chapter' : m.type === 'jump' ? 'Jump' : 'Ending');
            if (!placed.inRange) {
                issue('warning', 'marker-trimmed', 'Marker "' + name + '" is in a part of its clip that was trimmed away, so it is ignored.', { type: 'marker', id: m.id });
                return;
            }
            markerList.push({ id: m.id, type: m.type, label: name, time: placed.time, targetId: m.targetId, condition: m.condition, ending: text(m.ending, 80) });
        });
        var markerById = new Map(markerList.map(function (m) { return [m.id, m]; }));
        var markers = [];
        markerList.forEach(function (m) {
            var out = { id: m.id, type: m.type, label: m.label, time: round3(m.time), targetId: null, targetTime: null, condition: m.condition, ending: '' };
            if (m.type === 'jump') {
                var target = markerById.get(m.targetId);
                if (!target || target.id === m.id) {
                    issue('error', 'jump-target', 'Jump marker "' + m.label + '" at ' + fmt(m.time) + (target ? ' jumps to itself.' : ' has no target marker.'), { type: 'marker', id: m.id });
                    return;
                }
                out.targetId = target.id;
                out.targetTime = round3(target.time);
            } else if (m.type === 'end') {
                out.ending = m.ending || m.label || 'The End';
            }
            markers.push(out);
        });
        markers.sort(function (a, b) { return a.time - b.time; });

        // 3) choice points
        var points = [];
        timeline.choicePoints.forEach(function (p) {
            var placed = place(p.id, p.itemId, p.at);
            if (!placed) return;
            var where = 'Choice at ' + fmt(placed.time);
            var target = { type: 'choice', id: p.id };
            if (!placed.inRange) {
                issue('warning', 'choice-trimmed', where + ' is in a part of its clip that was trimmed away, so it is ignored.', target);
                return;
            }
            var options = [];
            p.options.forEach(function (o, i) {
                var name = '"' + (o.label || 'Option ' + (i + 1)) + '"';
                var clip = o.clipId ? getClip(o.clipId) : null;
                if (o.clipId && !clip) issue('warning', 'option-clip-missing', where + ': ' + name + ' uses a clip that was deleted.', target);
                var then = { type: o.then.type, targetId: null, targetTime: null, ending: '' };
                if (o.then.type === 'jump') {
                    var jumpTarget = markerById.get(o.then.targetId);
                    if (!jumpTarget) {
                        issue('error', 'option-jump-target', where + ': ' + name + ' jumps to a marker that does not exist.', target);
                        then.type = 'continue';
                    } else {
                        then.targetId = jumpTarget.id;
                        then.targetTime = round3(jumpTarget.time);
                    }
                } else if (o.then.type === 'end') {
                    then.ending = o.then.ending || o.label || 'The End';
                }
                if (!clip && then.type === 'continue') {
                    // No clip and no jump/end: the option just resumes the movie. That's a valid
                    // "keep watching" choice, so keep it (the player shows it without a preview).
                }
                var media = clip ? resolveOption(clip) : null;
                options.push({
                    id: o.id,
                    label: o.label || (clip ? displayName(clip) : (then.type === 'end' ? 'End' : 'Option ' + (i + 1))),
                    color: o.color,
                    clip: clip ? {
                        clipId: o.clipId,
                        src: media.src,
                        poster: media.poster || '',
                        duration: round3(num(clip.duration, 0)),
                        captions: captionsFor(o.clipId)
                    } : null,
                    then: then,
                    setFlags: o.setFlags.slice(),
                    requires: o.requires,
                    whenLocked: o.whenLocked
                });
            });
            if (!options.length) {
                issue('warning', 'choice-empty', where + ' has no usable options, so it is skipped.', target);
                return;
            }
            var timeout = clamp(num(p.timeout, 0), 0, 120);
            if (p.mode === 'play' && !(timeout > 0)) {
                issue('info', 'play-needs-timer', where + ' can only keep playing while viewers decide if it has a timer, so it pauses.', target);
            }
            points.push({
                id: p.id,
                time: round3(placed.time),
                prompt: text(p.prompt, 160),
                timeout: timeout,
                mode: p.mode === 'play' && timeout > 0 ? 'play' : 'pause',
                allowSkip: p.allowSkip !== false,
                defaultOptionId: options.some(function (o) { return o.id === p.defaultOptionId; }) ? p.defaultOptionId : null,
                options: options
            });
        });
        points.sort(function (a, b) { return a.time - b.time; });

        // 4) titles
        var overlays = [];
        timeline.overlays.forEach(function (o) {
            var placed = place(o.id, o.itemId, o.at);
            if (!placed) return;
            var body = String(o.text || '').trim();
            if (!placed.inRange) {
                issue('warning', 'title-trimmed', 'Title "' + (body.slice(0, 30) || 'Untitled') + '" is in a part of its clip that was trimmed away.', { type: 'overlay', id: o.id });
                return;
            }
            if (!body) {
                issue('info', 'title-empty', 'A title at ' + fmt(placed.time) + ' has no text.', { type: 'overlay', id: o.id });
                return;
            }
            var end = Math.min(total, placed.time + clamp(num(o.duration, 3), 0.5, 600));
            if (end - placed.time < 0.05) return;
            overlays.push({ id: o.id, text: body.slice(0, 300), position: o.position, start: round3(placed.time), end: round3(end) });
        });
        overlays.sort(function (a, b) { return a.start - b.start; });

        // 5) captions of the main track, mapped through trims
        var captions = [];
        entries.forEach(function (entry) {
            captionsFor(entry.clipId).forEach(function (cue) {
                var from = Math.max(num(cue.start, 0), entry.in);
                var to = Math.min(num(cue.end, 0), entry.out);
                if (to - from < 0.05) return;
                var start = entry.start + (from - entry.in);
                var end = Math.min(entry.end, entry.start + (to - entry.in));
                if (end - start >= 0.05) captions.push({ start: round3(start), end: round3(end), text: String(cue.text || '') });
            });
        });
        captions.sort(function (a, b) { return a.start - b.start; });

        // 6) story check
        var analysis = analyzeStory(total, points, markers);
        var reachable = mergeIntervals(analysis.intervals);
        var gapStart = 0;
        var gaps = [];
        reachable.forEach(function (iv) {
            if (iv[0] - gapStart > 0.3) gaps.push([gapStart, iv[0]]);
            gapStart = Math.max(gapStart, iv[1]);
        });
        if (total - gapStart > 0.3) gaps.push([gapStart, total]);
        gaps.forEach(function (gap) {
            var touched = entries.filter(function (e) { return e.end > gap[0] + 0.01 && e.start < gap[1] - 0.01; });
            issue('warning', 'unreachable',
                fmt(gap[0]) + '\u2013' + fmt(gap[1]) + ' can never be watched (' + touched.map(function (e) { return displayName(e.clip); }).join(', ') +
                '). Add a choice option or a jump marker that leads there, or remove it.',
                touched.length ? { type: 'item', id: touched[0].itemId } : null);
        });

        // loops that no choice or condition can break
        var reported = new Set();
        analysis.forced.forEach(function (edge, startKey) {
            var path = [startKey];
            var current = edge;
            var steps = 0;
            while (current && steps++ < 500) {
                if (path.indexOf(current.to) !== -1) {
                    var loopKey = path.slice(path.indexOf(current.to)).sort().join('|');
                    if (!reported.has(loopKey)) {
                        reported.add(loopKey);
                        issue('error', 'loop', 'Jump marker "' + current.marker.label + '" at ' + fmt(current.marker.time) +
                            ' creates a loop with no choice to get out of it. Viewers would be stuck forever.', { type: 'marker', id: current.marker.id });
                    }
                    break;
                }
                path.push(current.to);
                current = analysis.forced.get(current.to);
            }
        });

        // endings
        var endings = [];
        markers.forEach(function (m) {
            if (m.type === 'end') endings.push({ id: m.id, label: m.ending, reachable: analysis.endings.has(m.id), source: 'marker' });
        });
        points.forEach(function (p) {
            p.options.forEach(function (o) {
                if (o.then.type === 'end') endings.push({ id: o.id, label: o.then.ending, reachable: analysis.endings.has(o.id), source: 'option' });
            });
        });
        if (analysis.endings.has('__end__')) endings.push({ id: '__end__', label: 'The End', reachable: true, source: 'end' });
        if (entries.length && !endings.some(function (e) { return e.reachable; }) && !analysis.capped) {
            issue('error', 'no-ending', 'No path ever reaches an ending, so the movie can never finish.');
        }
        endings.forEach(function (e) {
            if (!e.reachable) issue('warning', 'ending-unreachable', 'The ending "' + e.label + '" can never be reached.', { type: e.source === 'marker' ? 'marker' : 'choice', id: e.id });
        });

        // flags
        var flagsSet = new Set();
        points.forEach(function (p) { p.options.forEach(function (o) { o.setFlags.forEach(function (f) { flagsSet.add(f); }); }); });
        points.forEach(function (p) {
            p.options.forEach(function (o) {
                if (o.requires && o.requires.is && !flagsSet.has(o.requires.flag)) {
                    issue('warning', 'flag-never-set', 'Choice at ' + fmt(p.time) + ': "' + o.label + '" needs "' + o.requires.flag +
                        '", but no option ever sets it, so it is always ' + (o.whenLocked === 'lock' ? 'locked' : 'hidden') + '.', { type: 'choice', id: p.id });
                }
            });
        });
        markers.forEach(function (m) {
            if (m.condition && m.condition.is && !flagsSet.has(m.condition.flag)) {
                issue('warning', 'flag-never-set', 'Marker "' + m.label + '" only applies when "' + m.condition.flag + '" is set, but no option ever sets it.', { type: 'marker', id: m.id });
            }
        });

        var stats = {
            duration: total,
            clips: entries.length,
            choices: points.length,
            options: points.reduce(function (sum, p) { return sum + p.options.length; }, 0),
            chapters: markers.filter(function (m) { return m.type === 'chapter'; }).length,
            jumps: markers.filter(function (m) { return m.type === 'jump'; }).length,
            endings: endings.filter(function (e) { return e.reachable; }).length,
            flags: Array.from(flagsSet).sort(),
            reachable: reachable.map(function (iv) { return [round3(iv[0]), round3(iv[1])]; })
        };

        var movie = {
            version: 2,
            duration: total,
            settings: {
                allowSeek: timeline.settings.allowSeek,
                showChapters: timeline.settings.showChapters,
                rememberProgress: timeline.settings.rememberProgress
            },
            segments: entries.map(function (e) {
                return { id: e.itemId, clipId: e.clipId, src: resolveMain(e.clip, e), mediaStart: e.in, duration: e.duration, label: displayName(e.clip) };
            }),
            markers: markers,
            choicePoints: points,
            overlays: overlays,
            captions: captions,
            endings: endings
        };

        var order = { error: 0, warning: 1, info: 2 };
        issues.sort(function (a, b) { return order[a.severity] - order[b.severity]; });
        return { movie: movie, entries: entries, anchors: anchors, issues: issues, stats: stats };
    }

    return {
        version: 2,
        LIMITS: LIMITS,
        upgradeTimeline: upgradeTimeline,
        sanitizeTimeline: sanitizeTimeline,
        compileMovie: compileMovie,
        parseCaptions: parseCaptions,
        normalizeFlag: normalizeFlag,
        normalizeFlags: normalizeFlags,
        displayName: displayName,
        formatTime: fmt
    };
});
