/*
 * Video Infinity - Timeline Studio
 *
 * Upload videos -> cut clips -> arrange them on the main movie track -> drop choice points
 * whose options each play a clip -> preview with the real player -> export one movie.
 *
 * Timeline data model (saved per project via /api/timeline):
 *   items:        [{ id, clipId }]                       main movie, played back to back
 *   choicePoints: [{ id, itemId, offset, prompt, timeout, allowSkip, defaultOptionId,
 *                    options: [{ id, label, clipId, color }] }]
 * Choice points are anchored to a timeline item (itemId + offset) so they move with their
 * clip when clips are reordered.
 */
(function () {
    'use strict';

    var createApp = Vue.createApp;
    var nextTick = Vue.nextTick;

    var MAX_OPTIONS = 6;
    var ZOOM_MIN = 2;
    var ZOOM_MAX = 220;

    function uid() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function fmt(seconds) {
        seconds = Math.max(0, Math.round(Number(seconds) || 0));
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        return m + ':' + String(s).padStart(2, '0');
    }

    function fmtPrecise(seconds) {
        seconds = Math.max(0, Number(seconds) || 0);
        var m = Math.floor(seconds / 60);
        var s = seconds - m * 60;
        return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
    }

    function round3(value) {
        return Math.round(value * 1000) / 1000;
    }

    function api(path, options) {
        options = options || {};
        var init = { method: options.method || 'GET', headers: {} };
        if (options.body !== undefined) {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(options.body);
        }
        return fetch(path, init).then(function (res) {
            return res.json().catch(function () { return null; }).then(function (data) {
                if (!res.ok) {
                    var err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
                    err.status = res.status;
                    throw err;
                }
                return data;
            });
        });
    }

    function emptyTimeline() {
        return MovieCompiler.upgradeTimeline({});
    }

    // The timeline shape (v2: trims, markers, overlays, option actions/flags) is defined by the
    // shared compiler (public/player/movie-compiler.js), which also runs on the server.
    function normalizeTimeline(raw) {
        var t = MovieCompiler.upgradeTimeline(raw);
        // Fresh ids for anything missing one
        var seen = new Set();
        var fix = function (id) {
            var out = typeof id === 'string' && id && !seen.has(id) ? id : uid();
            seen.add(out);
            return out;
        };
        t.items.forEach(function (i) { i.id = fix(i.id); });
        t.choicePoints.forEach(function (p) { p.id = fix(p.id); p.options.forEach(function (o) { o.id = fix(o.id); }); });
        t.markers.forEach(function (m) { m.id = fix(m.id); });
        t.overlays.forEach(function (o) { o.id = fix(o.id); });
        return t;
    }

    createApp({
        data: function () {
            return {
                loading: true,
                projects: [],
                projectId: null,
                videos: [],
                clips: [],
                timeline: emptyTimeline(),
                selection: null,
                playhead: 0,
                playerState: 'empty',
                livePointId: null,
                pps: 40,
                autoFit: true,
                timelineWidth: 900,
                binTab: 'videos',
                binDrop: false,
                dragClipId: null,
                uploads: [],
                tlDrop: null,
                drag: null,
                saveState: 'saved',
                saveError: '',
                history: { past: [], future: [] },
                cutter: {
                    open: false, videoId: null, duration: 0, in: 0, out: 0, current: 0, playing: false,
                    name: '', nameTouched: false, addToTimeline: true, busy: false, error: '', selectionEnd: null
                },
                captions: {},
                settingsOpen: false,
                exporter: { open: false, title: '', resolution: 'auto', job: null, error: '', exports: [], issues: [], stats: null },
                dialog: { open: false, kind: 'text', title: '', message: '', value: '', placeholder: '', confirmLabel: 'OK', danger: false },
                toasts: []
            };
        },

        computed: {
            clipMap: function () {
                return new Map(this.clips.map(function (c) { return [c.unique_id, c]; }));
            },
            sourceClips: function () {
                var self = this;
                return this.clips.filter(function (c) { return self.isSource(c); });
            },
            cutClips: function () {
                var self = this;
                return this.clips.filter(function (c) { return !self.isSource(c); });
            },
            binItems: function () {
                return this.binTab === 'videos' ? this.sourceClips : this.cutClips;
            },
            layout: function () {
                var self = this;
                var t = 0;
                var items = [];
                this.timeline.items.forEach(function (item) {
                    var clip = self.clipMap.get(item.clipId);
                    if (!clip) return;
                    var clipDur = Math.max(0.1, Number(clip.duration) || 0);
                    var inPoint = clamp(Number(item.in) || 0, 0, Math.max(0, clipDur - 0.1));
                    var out = item.out === null || item.out === undefined ? clipDur : clamp(Number(item.out), inPoint + 0.1, clipDur);
                    var duration = out - inPoint;
                    items.push({ item: item, clip: clip, start: t, duration: duration, end: t + duration, trimmed: inPoint > 0.0005 || out < clipDur - 0.0005 });
                    t += duration;
                });
                return { items: items, total: t, byId: new Map(items.map(function (e) { return [e.item.id, e]; })) };
            },
            totalDuration: function () {
                return this.layout.total;
            },
            pointsLayout: function () {
                var self = this;
                return this.timeline.choicePoints
                    .map(function (point) {
                        var entry = self.layout.byId.get(point.itemId);
                        if (!entry) return null;
                        return { point: point, entry: entry, time: entry.start + clamp(point.at - entry.item.in, 0, entry.duration) };
                    })
                    .filter(Boolean)
                    .sort(function (a, b) { return a.time - b.time; });
            },
            markersLayout: function () {
                var self = this;
                return this.timeline.markers
                    .map(function (marker) {
                        var entry = self.layout.byId.get(marker.itemId);
                        if (!entry) return null;
                        return { marker: marker, entry: entry, time: entry.start + clamp(marker.at - entry.item.in, 0, entry.duration) };
                    })
                    .filter(Boolean)
                    .sort(function (a, b) { return a.time - b.time; });
            },
            overlaysLayout: function () {
                var self = this;
                return this.timeline.overlays
                    .map(function (overlay) {
                        var entry = self.layout.byId.get(overlay.itemId);
                        if (!entry) return null;
                        var start = entry.start + clamp(overlay.at - entry.item.in, 0, entry.duration);
                        return { overlay: overlay, entry: entry, start: start, end: Math.min(self.totalDuration, start + overlay.duration) };
                    })
                    .filter(Boolean)
                    .sort(function (a, b) { return a.start - b.start; });
            },
            selectedPoint: function () {
                if (!this.selection || this.selection.type !== 'choice') return null;
                var id = this.selection.id;
                var point = this.timeline.choicePoints.find(function (p) { return p.id === id; }) || null;
                return point && this.layout.byId.get(point.itemId) ? point : null;
            },
            selectedPointEntry: function () {
                return this.selectedPoint ? this.layout.byId.get(this.selectedPoint.itemId) : null;
            },
            selectedPointTime: function () {
                var entry = this.selectedPointEntry;
                return entry ? entry.start + clamp(this.selectedPoint.at - entry.item.in, 0, entry.duration) : 0;
            },
            selectedMarker: function () {
                if (!this.selection || this.selection.type !== 'marker') return null;
                var id = this.selection.id;
                var marker = this.timeline.markers.find(function (m) { return m.id === id; }) || null;
                return marker && this.layout.byId.get(marker.itemId) ? marker : null;
            },
            selectedMarkerTime: function () {
                var ml = this.markersLayout.find(function (x) { return x.marker === this.selectedMarker; }, this);
                return ml ? ml.time : 0;
            },
            selectedOverlay: function () {
                if (!this.selection || this.selection.type !== 'overlay') return null;
                var id = this.selection.id;
                var overlay = this.timeline.overlays.find(function (o) { return o.id === id; }) || null;
                return overlay && this.layout.byId.get(overlay.itemId) ? overlay : null;
            },
            selectedOverlayTime: function () {
                var ol = this.overlaysLayout.find(function (x) { return x.overlay === this.selectedOverlay; }, this);
                return ol ? ol.start : 0;
            },
            chapterMarkers: function () {
                return this.timeline.markers.filter(function (m) { return m.type === 'chapter'; });
            },
            selectedItemEntry: function () {
                if (!this.selection || this.selection.type !== 'item') return null;
                return this.layout.byId.get(this.selection.id) || null;
            },
            selectedItemIndex: function () {
                var entry = this.selectedItemEntry;
                return entry ? this.layout.items.indexOf(entry) : -1;
            },
            optionCount: function () {
                return this.timeline.choicePoints.reduce(function (sum, p) { return sum + p.options.length; }, 0);
            },
            exportOptionClipCount: function () {
                var ids = new Set();
                this.pointsLayout.forEach(function (pl) {
                    pl.point.options.forEach(function (o) { if (o.clipId) ids.add(o.clipId); });
                });
                return ids.size;
            },
            // Compiled movie + story check (shared compiler: same result as the export)
            compiled: function () {
                return MovieCompiler.compileMovie({ timeline: this.timeline, clips: this.clipMap, captions: this.captionsMap });
            },
            captionsMap: function () {
                var map = new Map();
                var self = this;
                Object.keys(this.captions).forEach(function (clipId) { map.set(clipId, self.captions[clipId].cues || []); });
                return map;
            },
            issues: function () {
                return this.compiled.issues;
            },
            issueSummary: function () {
                var errors = this.issues.filter(function (i) { return i.severity === 'error'; }).length;
                var warnings = this.issues.filter(function (i) { return i.severity === 'warning'; }).length;
                var parts = [];
                if (errors) parts.push(errors + ' error' + (errors === 1 ? '' : 's'));
                if (warnings) parts.push(warnings + ' warning' + (warnings === 1 ? '' : 's'));
                return parts.length ? parts.join(' and ') + ' found.' : '';
            },
            choiceButtonTitle: function () {
                return this.selectedPoint
                    ? 'Add this clip as an option of the selected choice'
                    : 'Create a choice at the playhead with this clip as an option';
            },
            saveLabel: function () {
                switch (this.saveState) {
                    case 'pending':
                    case 'saving': return 'Saving\u2026';
                    case 'error': return 'Not saved';
                    default: return 'All changes saved';
                }
            },
            contentWidth: function () {
                return Math.max(this.timelineWidth, Math.ceil(this.totalDuration * this.pps) + 130);
            },
            ticks: function () {
                var steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200];
                var pps = this.pps;
                var step = steps.find(function (s) { return s * pps >= 72; }) || 1200;
                var end = this.contentWidth / pps;
                var out = [];
                for (var t = 0; t <= end + 0.001; t += step) {
                    out.push({ t: round3(t), x: t * pps, label: step < 1 ? fmtPrecise(t) : fmt(t) });
                }
                return out;
            },
            zoomValue: function () {
                return Math.round(100 * Math.log(this.pps / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN));
            },
            mainTrackHeight: function () {
                return 66;
            },
            choiceTrackHeight: function () {
                var most = this.timeline.choicePoints.reduce(function (max, p) { return Math.max(max, p.options.length); }, 1);
                return Math.max(84, 26 + most * 27);
            },
            markerTrackHeight: function () {
                return 34;
            },
            overlayTrackHeight: function () {
                return 34;
            },
            dropMarkerX: function () {
                var drop = this.tlDrop && this.tlDrop.track === 'main' ? this.tlDrop : null;
                var index = drop ? drop.index : (this.drag && this.drag.kind === 'item' && this.drag.index !== null ? this.drag.index : null);
                if (index === null || index === undefined) return null;
                var excludeId = drop ? null : this.drag.itemId;
                var entries = this.layout.items.filter(function (e) { return e.item.id !== excludeId; });
                var t = 0;
                for (var i = 0; i < index && i < entries.length; i++) t += entries[i].duration;
                return t * this.pps;
            },
            playerData: function () {
                // The compiled movie is exactly what the export renders, so the preview matches.
                var movie = this.compiled.movie;
                return {
                    segments: movie.segments,
                    choicePoints: movie.choicePoints,
                    markers: movie.markers,
                    overlays: movie.overlays,
                    captions: movie.captions,
                    endings: movie.endings,
                    settings: movie.settings
                };
            },
            cutterVideo: function () {
                var id = this.cutter.videoId;
                return this.videos.find(function (v) { return v.id === id; }) || null;
            },
            isRendering: function () {
                var job = this.exporter.job;
                return Boolean(job && (job.status === 'queued' || job.status === 'rendering'));
            }
        },

        watch: {
            timeline: {
                deep: true,
                handler: function () {
                    if (this._suspendSave) return;
                    this.scheduleSave();
                }
            },
            playerData: function (data) {
                if (this.player) this.player.setTimeline(data);
            },
            totalDuration: function () {
                if (this.autoFit) this.$nextTick(this.fitTimeline);
            }
        },

        mounted: function () {
            var self = this;
            window.__studio = this;
            this._saveSeq = 0;
            this.player = new InteractivePlayer(this.$refs.monitor, {
                startScreen: false,
                onEvent: function (type, detail) { self.onPlayerEvent(type, detail); }
            });
            this._resizeObserver = new ResizeObserver(function () {
                if (!self.$refs.tlScroll) return;
                self.timelineWidth = self.$refs.tlScroll.clientWidth;
                if (self.autoFit) self.fitTimeline();
            });
            this._resizeObserver.observe(this.$refs.tlScroll);
            document.addEventListener('keydown', this.onKeyDown);
            window.addEventListener('beforeunload', this.onBeforeUnload);
            this.loadProjects();
        },

        methods: {
            fmt: fmt,
            fmtPrecise: fmtPrecise,

            // ---------------------------------------------------------- helpers
            isSource: function (clip) {
                return Boolean(clip) && String(clip.name || '').indexOf('FULL:') === 0;
            },
            displayName: function (clip) {
                if (!clip) return 'Missing clip';
                return String(clip.name || 'Untitled').replace(/^FULL:\s*/, '');
            },
            thumbStyle: function (clip) {
                return clip && clip.thumbnail ? { backgroundImage: 'url("' + clip.thumbnail + '")' } : {};
            },
            usageCount: function (clipId) {
                var count = this.timeline.items.filter(function (i) { return i.clipId === clipId; }).length;
                this.timeline.choicePoints.forEach(function (p) {
                    p.options.forEach(function (o) { if (o.clipId === clipId) count += 1; });
                });
                return count;
            },
            pointsInItem: function (itemId) {
                return this.pointsLayout.filter(function (pl) { return pl.point.itemId === itemId; });
            },
            toast: function (text, type) {
                var self = this;
                var t = { id: uid(), text: text, type: type || 'info' };
                this.toasts.push(t);
                setTimeout(function () {
                    self.toasts = self.toasts.filter(function (x) { return x.id !== t.id; });
                }, type === 'error' ? 6000 : 3200);
            },

            // ---------------------------------------------------------- projects
            loadProjects: function () {
                var self = this;
                return api('/api/projects')
                    .then(function (projects) {
                        if (projects.length) return projects;
                        return api('/api/projects', { method: 'POST', body: { title: 'My interactive movie' } })
                            .then(function () { return api('/api/projects'); });
                    })
                    .then(function (projects) {
                        self.projects = projects;
                        var saved = Number(localStorage.getItem('vi.projectId'));
                        var pick = projects.find(function (p) { return p.id === saved; }) || projects[0];
                        return self.openProject(pick.id);
                    })
                    .catch(function (err) { self.toast(err.message, 'error'); })
                    .then(function () { self.loading = false; });
            },
            openProject: function (id) {
                var self = this;
                return this.flushSave().then(function () {
                    self.projectId = id;
                    localStorage.setItem('vi.projectId', String(id));
                    self.selection = null;
                    self.history = { past: [], future: [] };
                    return Promise.all([
                        api('/api/videos?projectId=' + id),
                        api('/api/story?projectId=' + id),
                        api('/api/timeline?projectId=' + id)
                    ]).then(function (results) {
                        return self.loadCaptions().then(function () { return results; });
                    });
                }).then(function (results) {
                    self._suspendSave = true;
                    self.videos = results[0] || [];
                    self.clips = (results[1] && results[1].clips) || [];
                    self.timeline = normalizeTimeline(results[2] && results[2].timeline);
                    self.binTab = self.cutClips.length ? 'clips' : 'videos';
                    self.playhead = 0;
                    return nextTick();
                }).then(function () {
                    self._suspendSave = false;
                    self.saveState = 'saved';
                    if (self.player) self.player.seek(0, true);
                    self.autoFit = true;
                    self.fitTimeline();
                }).catch(function (err) {
                    self._suspendSave = false;
                    self.toast('Could not open project: ' + err.message, 'error');
                });
            },
            createProject: function () {
                var self = this;
                this.askText({ title: 'New project', message: 'Project name', value: 'Untitled movie', confirmLabel: 'Create' })
                    .then(function (title) {
                        if (!title) return null;
                        return api('/api/projects', { method: 'POST', body: { title: title } }).then(function (res) {
                            return api('/api/projects').then(function (projects) {
                                self.projects = projects;
                                return self.openProject(res.projectId);
                            });
                        });
                    })
                    .catch(function (err) { self.toast(err.message, 'error'); });
            },
            refreshLibrary: function () {
                var self = this;
                return Promise.all([
                    api('/api/videos?projectId=' + this.projectId),
                    api('/api/story?projectId=' + this.projectId)
                ]).then(function (results) {
                    self.videos = results[0] || [];
                    self.clips = (results[1] && results[1].clips) || [];
                    self.pruneTimeline();
                });
            },
            // Drop references to clips that no longer exist (e.g. after deleting a video)
            pruneTimeline: function () {
                var ids = new Set(this.clips.map(function (c) { return c.unique_id; }));
                var tl = this.timeline;
                var items = tl.items.filter(function (i) { return ids.has(i.clipId); });
                var itemIds = new Set(items.map(function (i) { return i.id; }));
                var changed = items.length !== tl.items.length;
                var points = tl.choicePoints.filter(function (p) { return itemIds.has(p.itemId); });
                if (points.length !== tl.choicePoints.length) changed = true;
                points.forEach(function (p) {
                    p.options.forEach(function (o) {
                        if (o.clipId && !ids.has(o.clipId)) {
                            o.clipId = null;
                            changed = true;
                        }
                    });
                });
                var markers = tl.markers.filter(function (m) { return itemIds.has(m.itemId); });
                if (markers.length !== tl.markers.length) changed = true;
                var overlays = tl.overlays.filter(function (o) { return itemIds.has(o.itemId); });
                if (overlays.length !== tl.overlays.length) changed = true;
                if (changed) {
                    tl.items = items;
                    tl.choicePoints = points;
                    tl.markers = markers;
                    tl.overlays = overlays;
                    this.validateSelection();
                }
            },

            // ---------------------------------------------------------- saving
            scheduleSave: function () {
                var self = this;
                this.saveState = 'pending';
                clearTimeout(this._saveTimer);
                this._saveTimer = setTimeout(function () { self.saveNow(); }, 600);
            },
            saveNow: function () {
                var self = this;
                clearTimeout(this._saveTimer);
                this._saveTimer = null;
                if (!this.projectId) return Promise.resolve();
                var seq = ++this._saveSeq;
                var body = { projectId: this.projectId, timeline: JSON.parse(JSON.stringify(this.timeline)) };
                this.saveState = 'saving';
                return api('/api/timeline', { method: 'POST', body: body })
                    .then(function () {
                        if (seq === self._saveSeq && !self._saveTimer) {
                            self.saveState = 'saved';
                            self.saveError = '';
                        }
                    })
                    .catch(function (err) {
                        if (seq === self._saveSeq) {
                            self.saveState = 'error';
                            self.saveError = err.message;
                        }
                    });
            },
            flushSave: function () {
                if (this._saveTimer || this.saveState === 'pending') return this.saveNow();
                return Promise.resolve();
            },
            onBeforeUnload: function () {
                if (!this._saveTimer || !this.projectId) return;
                try {
                    fetch('/api/timeline', {
                        method: 'POST',
                        keepalive: true,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projectId: this.projectId, timeline: this.timeline })
                    });
                } catch (e) { /* ignore */ }
            },

            // ---------------------------------------------------------- undo / redo
            commit: function (mutate) {
                var before = JSON.stringify(this.timeline);
                mutate(this.timeline);
                this.pushHistory(before);
            },
            pushHistory: function (before) {
                if (before === JSON.stringify(this.timeline)) return;
                this.history.past.push(before);
                if (this.history.past.length > 100) this.history.past.shift();
                this.history.future = [];
            },
            beginEdit: function () {
                this._editBefore = JSON.stringify(this.timeline);
            },
            endEdit: function () {
                if (this._editBefore === undefined || this._editBefore === null) return;
                this.pushHistory(this._editBefore);
                this._editBefore = null;
            },
            undo: function () {
                if (!this.history.past.length) return;
                this.history.future.push(JSON.stringify(this.timeline));
                this.timeline = JSON.parse(this.history.past.pop());
                this.validateSelection();
            },
            redo: function () {
                if (!this.history.future.length) return;
                this.history.past.push(JSON.stringify(this.timeline));
                this.timeline = JSON.parse(this.history.future.pop());
                this.validateSelection();
            },
            validateSelection: function () {
                var sel = this.selection;
                if (!sel) return;
                var exists = sel.type === 'item'
                    ? this.timeline.items.some(function (i) { return i.id === sel.id; })
                    : sel.type === 'marker'
                        ? this.timeline.markers.some(function (m) { return m.id === sel.id; })
                        : sel.type === 'overlay'
                            ? this.timeline.overlays.some(function (o) { return o.id === sel.id; })
                            : this.timeline.choicePoints.some(function (p) { return p.id === sel.id; });
                if (!exists) this.selection = null;
            },

            // ---------------------------------------------------------- main track
            appendClip: function (clip) {
                var id = uid();
                this.commit(function (tl) { tl.items.push({ id: id, clipId: clip.unique_id, in: 0, out: null }); });
                this.selection = { type: 'item', id: id };
                this.toast('Added \u201c' + this.displayName(clip) + '\u201d to the main movie');
            },
            insertClipAt: function (clipId, index) {
                var id = uid();
                this.commit(function (tl) {
                    tl.items.splice(clamp(index, 0, tl.items.length), 0, { id: id, clipId: clipId, in: 0, out: null });
                });
                this.selection = { type: 'item', id: id };
            },
            removeItem: function (itemId) {
                this.commit(function (tl) {
                    tl.items = tl.items.filter(function (i) { return i.id !== itemId; });
                    tl.choicePoints = tl.choicePoints.filter(function (p) { return p.itemId !== itemId; });
                });
                this.validateSelection();
            },
            moveItem: function (itemId, delta) {
                var index = this.timeline.items.findIndex(function (i) { return i.id === itemId; });
                this.reorderItem(itemId, index + delta);
            },
            reorderItem: function (itemId, toIndex) {
                this.commit(function (tl) {
                    var index = tl.items.findIndex(function (i) { return i.id === itemId; });
                    if (index < 0) return;
                    var moved = tl.items.splice(index, 1)[0];
                    tl.items.splice(clamp(toIndex, 0, tl.items.length), 0, moved);
                });
            },
            duplicateItem: function (itemId) {
                var id = uid();
                this.commit(function (tl) {
                    var index = tl.items.findIndex(function (i) { return i.id === itemId; });
                    if (index < 0) return;
                    tl.items.splice(index + 1, 0, { id: id, clipId: tl.items[index].clipId, in: tl.items[index].in, out: tl.items[index].out });
                });
                this.selection = { type: 'item', id: id };
            },
            deleteSelection: function () {
                if (!this.selection) return;
                if (this.selection.type === 'item') this.removeItem(this.selection.id);
                else if (this.selection.type === 'marker') this.removeMarker(this.selection.id);
                else if (this.selection.type === 'overlay') this.removeOverlay(this.selection.id);
                else this.removePoint(this.selection.id);
            },
            dropIndexAt: function (t, excludeId) {
                return this.layout.items.filter(function (e) {
                    return e.item.id !== excludeId && (e.start + e.duration / 2) < t;
                }).length;
            },

            // ---------------------------------------------------------- choices
            timeToAnchor: function (t) {
                var items = this.layout.items;
                if (!items.length) return null;
                for (var i = 0; i < items.length; i++) {
                    if (t < items[i].end - 1e-6) {
                        var inPoint = Number(items[i].item.in) || 0;
                        return { itemId: items[i].item.id, at: round3(clamp(inPoint + (t - items[i].start), 0, items[i].clip.duration)) };
                    }
                }
                var last = items[items.length - 1];
                var lastOut = last.item.out === null || last.item.out === undefined ? last.clip.duration : last.item.out;
                return { itemId: last.item.id, at: round3(lastOut) };
            },
            newOption: function (clip) {
                return {
                    id: uid(), label: '', clipId: clip ? clip.unique_id : null, color: '#ffffff',
                    then: { type: 'continue', targetId: null, ending: '' },
                    setFlags: [], requires: null, whenLocked: 'hide'
                };
            },
            addChoiceAt: function (t, clip) {
                if (!this.layout.items.length) {
                    this.toast('Add a clip to the main movie first', 'error');
                    return null;
                }
                var anchor = this.timeToAnchor(clamp(t, 0, this.totalDuration));
                var point = {
                    id: uid(),
                    itemId: anchor.itemId,
                    at: anchor.at,
                    prompt: '',
                    timeout: 0,
                    mode: 'pause',
                    allowSkip: true,
                    defaultOptionId: null,
                    options: clip ? [this.newOption(clip)] : [this.newOption(null), this.newOption(null)]
                };
                this.commit(function (tl) { tl.choicePoints.push(point); });
                this.selection = { type: 'choice', id: point.id };
                return point;
            },
            addChoiceAtPlayhead: function () {
                if (this.addChoiceAt(this.playhead)) this.toast('Choice added at ' + fmtPrecise(this.playhead) + ' \u2014 pick a clip for each option');
            },
            addChoiceInItem: function (entry) {
                var inside = this.playhead >= entry.start && this.playhead < entry.end;
                this.addChoiceAt(inside ? this.playhead : entry.start + entry.duration / 2);
            },
            useAsChoice: function (clip) {
                var point = this.selectedPoint;
                if (point) {
                    var empty = point.options.find(function (o) { return !o.clipId; });
                    if (empty) {
                        this.commit(function () { empty.clipId = clip.unique_id; });
                    } else if (point.options.length < MAX_OPTIONS) {
                        var option = this.newOption(clip);
                        this.commit(function () { point.options.push(option); });
                    } else {
                        this.toast('A choice can have up to ' + MAX_OPTIONS + ' options', 'error');
                        return;
                    }
                    this.toast('\u201c' + this.displayName(clip) + '\u201d is now an option');
                    return;
                }
                if (this.addChoiceAt(this.playhead, clip)) {
                    this.toast('New choice at ' + fmtPrecise(this.playhead) + ' with \u201c' + this.displayName(clip) + '\u201d as an option');
                }
            },
            selectPoint: function (pointId) {
                this.selection = { type: 'choice', id: pointId };
            },
            removePoint: function (pointId) {
                this.commit(function (tl) {
                    tl.choicePoints = tl.choicePoints.filter(function (p) { return p.id !== pointId; });
                });
                this.validateSelection();
            },
            movePointTo: function (pointId, t) {
                var anchor = this.timeToAnchor(clamp(Number(t) || 0, 0, this.totalDuration));
                if (!anchor) return;
                this.commit(function (tl) {
                    var point = tl.choicePoints.find(function (p) { return p.id === pointId; });
                    if (!point) return;
                    point.itemId = anchor.itemId;
                    point.at = anchor.at;
                });
            },
            setPointField: function (point, field, value) {
                this.commit(function () { point[field] = value; });
            },
            addOption: function (point) {
                if (point.options.length >= MAX_OPTIONS) return;
                var option = this.newOption(null);
                this.commit(function () { point.options.push(option); });
            },
            removeOption: function (point, optionId) {
                this.commit(function () {
                    point.options = point.options.filter(function (o) { return o.id !== optionId; });
                    if (point.defaultOptionId === optionId) point.defaultOptionId = null;
                });
            },
            setOptionClip: function (point, option, clipId) {
                this.commit(function () { option.clipId = clipId || null; });
            },
            setOptionThen: function (point, option, type) {
                this.commit(function () {
                    option.then = { type: type, targetId: option.then.targetId, ending: option.then.ending };
                });
            },
            setOptionJumpTarget: function (point, option, targetId) {
                this.commit(function () { option.then.targetId = targetId || null; });
            },
            setOptionEnding: function (point, option, ending) {
                this.commit(function () { option.then.ending = String(ending || '').trim().slice(0, 80); });
            },
            setOptionFlags: function (point, option, value) {
                var flags = MovieCompiler.normalizeFlags(value);
                this.commit(function () { option.setFlags = flags; });
            },
            setOptionRequires: function (point, option, value) {
                var flag = MovieCompiler.normalizeFlag(value);
                this.commit(function () { option.requires = flag ? { flag: flag, is: true } : null; });
            },
            setOptionWhenLocked: function (point, option, value) {
                this.commit(function () { option.whenLocked = value === 'lock' ? 'lock' : 'hide'; });
            },

            // ---------------------------------------------------------- markers
            markerTime: function (marker) {
                var ml = this.markersLayout.find(function (x) { return x.marker.id === marker.id; });
                return ml ? ml.time : 0;
            },
            addMarkerAt: function (t, type) {
                if (!this.layout.items.length) {
                    this.toast('Add a clip to the main movie first', 'error');
                    return null;
                }
                var anchor = this.timeToAnchor(clamp(t, 0, this.totalDuration));
                var marker = {
                    id: uid(), itemId: anchor.itemId, at: anchor.at,
                    type: type || 'chapter', label: '', targetId: null, condition: null, ending: ''
                };
                this.commit(function (tl) { tl.markers.push(marker); });
                this.selection = { type: 'marker', id: marker.id };
                return marker;
            },
            addMarkerAtPlayhead: function (type) {
                if (this.addMarkerAt(this.playhead, type || 'chapter')) this.toast('Marker added at ' + fmtPrecise(this.playhead));
            },
            addMarkerInItem: function (entry, type) {
                var inside = this.playhead >= entry.start && this.playhead < entry.end;
                this.addMarkerAt(inside ? this.playhead : entry.start + entry.duration / 2, type);
            },
            selectMarker: function (markerId) {
                this.selection = { type: 'marker', id: markerId };
            },
            removeMarker: function (markerId) {
                this.commit(function (tl) {
                    tl.markers = tl.markers.filter(function (m) { return m.id !== markerId; });
                    // Clear jump targets that pointed at the deleted marker
                    tl.markers.forEach(function (m) { if (m.targetId === markerId) m.targetId = null; });
                    tl.choicePoints.forEach(function (p) {
                        p.options.forEach(function (o) { if (o.then.targetId === markerId) o.then.targetId = null; });
                    });
                });
                this.validateSelection();
            },
            moveMarkerTo: function (markerId, t) {
                var anchor = this.timeToAnchor(clamp(Number(t) || 0, 0, this.totalDuration));
                if (!anchor) return;
                this.commit(function (tl) {
                    var marker = tl.markers.find(function (m) { return m.id === markerId; });
                    if (!marker) return;
                    marker.itemId = anchor.itemId;
                    marker.at = anchor.at;
                });
            },
            setMarkerType: function (marker, type) {
                this.commit(function () { marker.type = type; });
            },
            setMarkerTarget: function (marker, targetId) {
                this.commit(function () { marker.targetId = targetId || null; });
            },
            setMarkerCondition: function (marker, value) {
                var flag = MovieCompiler.normalizeFlag(value);
                this.commit(function () { marker.condition = flag ? { flag: flag, is: true } : null; });
            },

            // ---------------------------------------------------------- titles (overlays)
            addOverlayAt: function (t) {
                if (!this.layout.items.length) {
                    this.toast('Add a clip to the main movie first', 'error');
                    return null;
                }
                var anchor = this.timeToAnchor(clamp(t, 0, this.totalDuration));
                var overlay = { id: uid(), itemId: anchor.itemId, at: anchor.at, duration: 3, text: '', position: 'lower' };
                this.commit(function (tl) { tl.overlays.push(overlay); });
                this.selection = { type: 'overlay', id: overlay.id };
                return overlay;
            },
            addOverlayAtPlayhead: function () {
                if (this.addOverlayAt(this.playhead)) this.toast('Title added at ' + fmtPrecise(this.playhead));
            },
            addOverlayInItem: function (entry) {
                var inside = this.playhead >= entry.start && this.playhead < entry.end;
                this.addOverlayAt(inside ? this.playhead : entry.start + entry.duration / 2);
            },
            selectOverlay: function (overlayId) {
                this.selection = { type: 'overlay', id: overlayId };
            },
            removeOverlay: function (overlayId) {
                this.commit(function (tl) {
                    tl.overlays = tl.overlays.filter(function (o) { return o.id !== overlayId; });
                });
                this.validateSelection();
            },
            moveOverlayTo: function (overlayId, t) {
                var anchor = this.timeToAnchor(clamp(Number(t) || 0, 0, this.totalDuration));
                if (!anchor) return;
                this.commit(function (tl) {
                    var overlay = tl.overlays.find(function (o) { return o.id === overlayId; });
                    if (!overlay) return;
                    overlay.itemId = anchor.itemId;
                    overlay.at = anchor.at;
                });
            },
            setOverlayDuration: function (overlay, value) {
                this.commit(function () { overlay.duration = clamp(Number(value) || 3, 0.5, 600); });
            },
            setOverlayPosition: function (overlay, position) {
                this.commit(function () { overlay.position = position; });
            },

            // ---------------------------------------------------------- trims
            setItemTrim: function (item, which, value) {
                var clip = this.clipMap.get(item.clipId);
                if (!clip) return;
                var dur = Number(clip.duration) || 0;
                this.commit(function () {
                    if (which === 'in') {
                        item.in = round3(clamp(Number(value) || 0, 0, Math.max(0, (item.out === null ? dur : item.out) - 0.1)));
                    } else {
                        var out = clamp(Number(value) || 0, item.in + 0.1, dur);
                        item.out = out >= dur - 0.0005 ? null : round3(out);
                    }
                });
            },
            resetItemTrim: function (item) {
                this.commit(function () { item.in = 0; item.out = null; });
            },

            // ---------------------------------------------------------- captions
            captionsFor: function (clipId) {
                return this.captions[clipId] || null;
            },
            attachCaptions: function (clip) {
                var self = this;
                var input = document.createElement('input');
                input.type = 'file';
                input.accept = '.srt,.vtt,text/plain';
                input.onchange = function () {
                    var file = input.files && input.files[0];
                    if (!file) return;
                    var form = new FormData();
                    form.append('projectId', String(self.projectId));
                    form.append('file', file);
                    fetch('/api/upload', { method: 'POST', body: form })
                        .then(function (r) { return r.json(); })
                        .then(function (up) {
                            if (!up || !up.success) throw new Error((up && up.error) || 'Upload failed');
                            return api('/api/clip/captions', { method: 'POST', body: { projectId: self.projectId, clipId: clip.unique_id, path: up.path, filename: file.name } });
                        })
                        .then(function (res) {
                            return self.loadCaptions().then(function () {
                                self.toast(res.count + ' caption' + (res.count === 1 ? '' : 's') + ' attached to \u201c' + self.displayName(clip) + '\u201d');
                            });
                        })
                        .catch(function (err) { self.toast(err.message, 'error'); });
                };
                input.click();
            },
            removeCaptions: function (clip) {
                var self = this;
                api('/api/clip/captions/delete', { method: 'POST', body: { clipId: clip.unique_id } })
                    .then(function () { return self.loadCaptions(); })
                    .then(function () { self.toast('Captions removed'); })
                    .catch(function (err) { self.toast(err.message, 'error'); });
            },
            loadCaptions: function () {
                var self = this;
                return api('/api/captions?projectId=' + this.projectId).then(function (rows) {
                    var captions = {};
                    (rows || []).forEach(function (row) {
                        captions[row.clipId] = { filename: row.filename, path: row.path, cues: null };
                    });
                    // Parse each caption file for the preview
                    var jobs = (rows || []).map(function (row) {
                        return fetch(row.path).then(function (r) { return r.ok ? r.text() : ''; }).then(function (text) {
                            captions[row.clipId].cues = MovieCompiler.parseCaptions(text);
                        }).catch(function () { captions[row.clipId].cues = []; });
                    });
                    return Promise.all(jobs).then(function () { self.captions = captions; });
                }).catch(function () { /* ignore */ });
            },

            // ---------------------------------------------------------- story check navigation
            goToIssue: function (issue) {
                if (!issue.target) return;
                if (issue.target.type === 'choice') this.selection = { type: 'choice', id: issue.target.id };
                else if (issue.target.type === 'marker') this.selection = { type: 'marker', id: issue.target.id };
                else if (issue.target.type === 'overlay') this.selection = { type: 'overlay', id: issue.target.id };
                else if (issue.target.type === 'item') this.selection = { type: 'item', id: issue.target.id };
            },
            pushSettingsEdit: function () {
                this.pushHistory(this._settingsBefore || JSON.stringify(this.timeline));
                this._settingsBefore = null;
            },
            previewPoint: function (point) {
                var pl = this.pointsLayout.find(function (x) { return x.point.id === point.id; });
                if (!pl || !this.player) return;
                this.player.seek(Math.max(0, pl.time - 2), true);
                this.player.play();
            },
            optionChipStyle: function (opt) {
                var clip = this.clipMap.get(opt.clipId);
                var width = clip ? clamp((Number(clip.duration) || 0) * this.pps, 92, 260) : 92;
                return { width: width + 'px', '--chip-color': opt.color || '#ffffff' };
            },
            optionTitle: function (opt, i) {
                var clip = this.clipMap.get(opt.clipId);
                return 'Option ' + (i + 1) + ': ' + (opt.label || (clip ? this.displayName(clip) : 'no clip yet')) +
                    (clip ? ' \u2014 plays ' + this.displayName(clip) + ' (' + fmtPrecise(clip.duration) + '), then the movie resumes' : '');
            },

            // ---------------------------------------------------------- player
            onPlayerEvent: function (type, detail) {
                if (type === 'timeupdate') {
                    if (!this.drag || this.drag.kind !== 'playhead') this.playhead = detail.time;
                    this.followPlayhead();
                } else if (type === 'state') {
                    this.playerState = detail.state;
                    if (detail.state !== 'choosing' && detail.state !== 'option') this.livePointId = null;
                } else if (type === 'choice-shown') {
                    this.livePointId = detail.point.id;
                } else if (type === 'jump') {
                    this.toast('Jumped to ' + fmtPrecise(detail.to));
                }
            },
            togglePlay: function () {
                if (this.player) this.player.togglePlay();
            },
            seekTo: function (t) {
                this.playhead = clamp(t, 0, this.totalDuration);
                if (this.player) this.player.seek(this.playhead, true);
            },
            nudgePlayhead: function (delta) {
                this.seekTo(this.playhead + delta);
            },
            followPlayhead: function () {
                var scroller = this.$refs.tlScroll;
                if (!scroller || this.playerState !== 'playing') return;
                var x = this.playhead * this.pps;
                if (x > scroller.scrollLeft + scroller.clientWidth - 40) scroller.scrollLeft = x - 80;
                else if (x < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, x - 80);
            },

            // ---------------------------------------------------------- timeline geometry & pointer input
            fitTimeline: function () {
                var scroller = this.$refs.tlScroll;
                var width = scroller ? scroller.clientWidth : 900;
                this.timelineWidth = width;
                var total = this.totalDuration || 30;
                this.pps = clamp((width - 132) / total, ZOOM_MIN, ZOOM_MAX);
            },
            onTimelineScroll: function (event) {
                if (this.$refs.tlLabels) this.$refs.tlLabels.scrollTop = event.target.scrollTop;
            },
            setZoomFromSlider: function (value) {
                this.autoFit = false;
                this.pps = ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, clamp(value, 0, 100) / 100);
            },
            onTimelineWheel: function (event) {
                var scroller = this.$refs.tlScroll;
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    var rect = scroller.getBoundingClientRect();
                    var anchorTime = (event.clientX - rect.left + scroller.scrollLeft) / this.pps;
                    this.autoFit = false;
                    this.pps = clamp(this.pps * (event.deltaY < 0 ? 1.15 : 1 / 1.15), ZOOM_MIN, ZOOM_MAX);
                    var self = this;
                    this.$nextTick(function () { scroller.scrollLeft = anchorTime * self.pps - (event.clientX - rect.left); });
                } else if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                    event.preventDefault();
                    scroller.scrollLeft += event.deltaY;
                }
            },
            timeFromClientX: function (clientX) {
                var rect = this.$refs.tlContent.getBoundingClientRect();
                return clamp((clientX - rect.left) / this.pps, 0, this.totalDuration);
            },
            startPointerDrag: function (handlers) {
                var move = function (ev) { if (handlers.move) handlers.move(ev); };
                var up = function (ev) {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                    window.removeEventListener('pointercancel', up);
                    if (handlers.up) handlers.up(ev);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
                window.addEventListener('pointercancel', up);
            },
            onRulerPointerDown: function (event) {
                if (!this.totalDuration || event.button !== 0) return;
                event.preventDefault();
                var self = this;
                var seek = function (ev) { self.seekTo(self.timeFromClientX(ev.clientX)); };
                this.drag = { kind: 'playhead' };
                seek(event);
                this.startPointerDrag({ move: seek, up: function () { self.drag = null; } });
            },
            onTrackBackgroundPointerDown: function (event) {
                if (event.button !== 0) return;
                this.selection = null;
                if (this.totalDuration) this.seekTo(this.timeFromClientX(event.clientX));
            },
            blockStyle: function (entry) {
                var style = {
                    left: (entry.start * this.pps) + 'px',
                    width: Math.max(4, entry.duration * this.pps - 2) + 'px'
                };
                if (entry.clip.thumbnail) style.backgroundImage = 'url("' + entry.clip.thumbnail + '")';
                if (this.drag && this.drag.kind === 'item' && this.drag.itemId === entry.item.id) {
                    style.transform = 'translateX(' + this.drag.dx + 'px)';
                }
                return style;
            },
            onBlockPointerDown: function (event, entry) {
                if (event.button !== 0) return;
                event.preventDefault();
                var self = this;
                var startX = event.clientX;
                var dragging = false;
                this.selection = { type: 'item', id: entry.item.id };
                this.startPointerDrag({
                    move: function (ev) {
                        if (!dragging && Math.abs(ev.clientX - startX) > 5) {
                            dragging = true;
                            self.drag = { kind: 'item', itemId: entry.item.id, dx: 0, index: null };
                        }
                        if (dragging) {
                            self.drag.dx = ev.clientX - startX;
                            self.drag.index = self.dropIndexAt(self.timeFromClientX(ev.clientX), entry.item.id);
                        }
                    },
                    up: function () {
                        var drag = self.drag;
                        self.drag = null;
                        if (dragging && drag && drag.index !== null) {
                            var current = self.timeline.items.findIndex(function (i) { return i.id === entry.item.id; });
                            if (drag.index !== current) self.reorderItem(entry.item.id, drag.index);
                        }
                    }
                });
            },
            onMarkerPointerDown: function (event, pl) {
                if (event.button !== 0) return;
                event.preventDefault();
                var self = this;
                var startX = event.clientX;
                var dragging = false;
                var before = JSON.stringify(this.timeline);
                var point = pl.point;
                this.selection = { type: 'choice', id: point.id };
                this.startPointerDrag({
                    move: function (ev) {
                        if (!dragging && Math.abs(ev.clientX - startX) > 3) dragging = true;
                        if (!dragging) return;
                        var anchor = self.timeToAnchor(self.timeFromClientX(ev.clientX));
                        if (!anchor) return;
                        point.itemId = anchor.itemId;
                        point.at = anchor.at;
                        self.drag = { kind: 'marker', pointId: point.id };
                    },
                    up: function () {
                        self.drag = null;
                        if (dragging) self.pushHistory(before);
                    }
                });
            },
            onChoiceTrackDblClick: function (event) {
                if (!this.layout.items.length) return;
                var t = this.timeFromClientX(event.clientX);
                this.addChoiceAt(t);
            },
            onMarkerTrackDblClick: function (event) {
                if (!this.layout.items.length) return;
                this.addMarkerAt(this.timeFromClientX(event.clientX), 'chapter');
            },
            onOverlayTrackDblClick: function (event) {
                if (!this.layout.items.length) return;
                this.addOverlayAt(this.timeFromClientX(event.clientX));
            },
            onMarkerDotPointerDown: function (event, ml) {
                if (event.button !== 0) return;
                event.preventDefault();
                var self = this;
                var startX = event.clientX;
                var dragging = false;
                var before = JSON.stringify(this.timeline);
                var marker = ml.marker;
                this.selection = { type: 'marker', id: marker.id };
                this.startPointerDrag({
                    move: function (ev) {
                        if (!dragging && Math.abs(ev.clientX - startX) > 3) dragging = true;
                        if (!dragging) return;
                        var anchor = self.timeToAnchor(self.timeFromClientX(ev.clientX));
                        if (!anchor) return;
                        marker.itemId = anchor.itemId;
                        marker.at = anchor.at;
                        self.drag = { kind: 'marker-dot', markerId: marker.id };
                    },
                    up: function () {
                        self.drag = null;
                        if (dragging) self.pushHistory(before);
                    }
                });
            },

            // ---------------------------------------------------------- drag & drop from the media bin
            onMediaDragStart: function (event, clip) {
                this.dragClipId = clip.unique_id;
                event.dataTransfer.effectAllowed = 'copy';
                event.dataTransfer.setData('application/x-vi-clip', clip.unique_id);
                event.dataTransfer.setData('text/plain', this.displayName(clip));
            },
            onMediaDragEnd: function () {
                this.dragClipId = null;
                this.tlDrop = null;
            },
            draggedClipId: function (event) {
                var id = this.dragClipId;
                if (!id && event && event.dataTransfer) id = event.dataTransfer.getData('application/x-vi-clip');
                return id && this.clipMap.get(id) ? id : null;
            },
            onMainTrackDragOver: function (event) {
                if (!this.dragClipId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                this.tlDrop = { track: 'main', index: this.dropIndexAt(this.timeFromClientX(event.clientX), null) };
            },
            onMainTrackDrop: function (event) {
                var clipId = this.draggedClipId(event);
                var index = this.tlDrop && this.tlDrop.track === 'main' ? this.tlDrop.index : this.timeline.items.length;
                this.tlDrop = null;
                this.dragClipId = null;
                if (clipId) this.insertClipAt(clipId, index);
            },
            pointAtClientX: function (clientX) {
                var x = clientX - this.$refs.tlContent.getBoundingClientRect().left;
                var self = this;
                var hit = null;
                this.pointsLayout.forEach(function (pl) {
                    var left = pl.time * self.pps;
                    var widest = pl.point.options.reduce(function (max, o) {
                        var clip = self.clipMap.get(o.clipId);
                        return Math.max(max, clip ? clamp((Number(clip.duration) || 0) * self.pps, 92, 260) : 92);
                    }, 92);
                    if (x >= left - 12 && x <= left + 16 + widest) hit = pl.point;
                });
                return hit;
            },
            onChoiceTrackDragOver: function (event) {
                if (!this.dragClipId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                var point = this.pointAtClientX(event.clientX);
                this.tlDrop = { track: 'choice', pointId: point ? point.id : null, time: this.timeFromClientX(event.clientX) };
            },
            onChoiceTrackDrop: function (event) {
                var clipId = this.draggedClipId(event);
                var drop = this.tlDrop;
                this.tlDrop = null;
                this.dragClipId = null;
                if (!clipId || !drop) return;
                var clip = this.clipMap.get(clipId);
                if (drop.pointId) {
                    this.selectPoint(drop.pointId);
                    this.useAsChoice(clip);
                } else if (this.addChoiceAt(drop.time, clip)) {
                    this.toast('New choice at ' + fmtPrecise(drop.time) + ' \u2014 add more options from the Media panel');
                }
            },
            onTrackDragLeave: function (event) {
                if (!event.currentTarget.contains(event.relatedTarget)) this.tlDrop = null;
            },

            // ---------------------------------------------------------- uploads
            onFilesPicked: function (event) {
                var files = Array.prototype.slice.call(event.target.files || []);
                event.target.value = '';
                this.uploadFiles(files);
            },
            isFileDrag: function (event) {
                var types = event.dataTransfer && event.dataTransfer.types;
                return Boolean(types) && Array.prototype.indexOf.call(types, 'Files') !== -1;
            },
            onBinDragEnter: function (event) {
                if (this.isFileDrag(event)) this.binDrop = true;
            },
            onBinDragOver: function (event) {
                if (this.isFileDrag(event)) {
                    this.binDrop = true;
                    event.dataTransfer.dropEffect = 'copy';
                }
            },
            onBinDragLeave: function (event) {
                if (!event.currentTarget.contains(event.relatedTarget)) this.binDrop = false;
            },
            onBinDrop: function (event) {
                this.binDrop = false;
                var files = Array.prototype.slice.call((event.dataTransfer && event.dataTransfer.files) || []);
                if (files.length) this.uploadFiles(files);
            },
            uploadFiles: function (files) {
                var self = this;
                var videos = files.filter(function (f) { return /\.(mp4|m4v|mov|avi|mkv|webm)$/i.test(f.name); });
                if (videos.length < files.length) {
                    this.toast((files.length - videos.length) + ' file(s) skipped \u2014 only video files (mp4, mov, webm, mkv, avi) can be uploaded here', 'error');
                }
                // One at a time keeps the machine responsive while FFmpeg processes each file
                return videos.reduce(function (chain, file) {
                    return chain.then(function () { return self.uploadOne(file); });
                }, Promise.resolve());
            },
            uploadOne: function (file) {
                var self = this;
                this.uploads.push({ id: uid(), name: file.name, progress: 0, status: 'queued', error: '' });
                var u = this.uploads[this.uploads.length - 1];
                return new Promise(function (resolve) {
                    var xhr = new XMLHttpRequest();
                    var form = new FormData();
                    form.append('projectId', String(self.projectId));
                    form.append('file', file);
                    xhr.open('POST', '/api/upload');
                    xhr.upload.onprogress = function (ev) {
                        if (!ev.lengthComputable) return;
                        u.progress = (ev.loaded / ev.total) * 0.9;
                        if (ev.loaded >= ev.total) u.status = 'processing';
                    };
                    xhr.onload = function () {
                        var data = null;
                        try { data = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
                        if (xhr.status >= 200 && xhr.status < 300 && data && data.success) {
                            u.status = 'done';
                            u.progress = 1;
                            self.refreshLibrary().then(function () {
                                self.binTab = 'videos';
                                setTimeout(function () { self.dismissUpload(u); }, 2500);
                                resolve(data);
                            });
                        } else {
                            u.status = 'error';
                            u.error = (data && data.error) || ('Upload failed (' + xhr.status + ')');
                            resolve(null);
                        }
                    };
                    xhr.onerror = function () {
                        u.status = 'error';
                        u.error = 'Network error during upload';
                        resolve(null);
                    };
                    u.status = 'uploading';
                    xhr.send(form);
                });
            },
            uploadStatusText: function (u) {
                switch (u.status) {
                    case 'queued': return 'Waiting\u2026';
                    case 'uploading': return 'Uploading ' + Math.round(u.progress / 0.9 * 100) + '%';
                    case 'processing': return 'Processing video\u2026';
                    case 'done': return 'Ready';
                    default: return u.error || 'Failed';
                }
            },
            dismissUpload: function (u) {
                this.uploads = this.uploads.filter(function (x) { return x.id !== u.id; });
            },

            // ---------------------------------------------------------- clip management
            renameClip: function (clip) {
                var self = this;
                this.askText({ title: 'Rename', message: 'Name', value: this.displayName(clip), confirmLabel: 'Rename' })
                    .then(function (name) {
                        if (!name) return null;
                        var finalName = self.isSource(clip) ? 'FULL: ' + name : name;
                        return api('/api/clip/update', { method: 'POST', body: { id: clip.unique_id, name: finalName } })
                            .then(function () { clip.name = finalName; });
                    })
                    .catch(function (err) { self.toast(err.message, 'error'); });
            },
            deleteClip: function (clip) {
                var self = this;
                var source = this.isSource(clip);
                var used = this.usageCount(clip.unique_id);
                var message = (source
                    ? 'Delete the video \u201c' + this.displayName(clip) + '\u201d and every clip cut from it? The files are removed from disk.'
                    : 'Delete the clip \u201c' + this.displayName(clip) + '\u201d? The file is removed from disk.') +
                    (used ? ' It is used ' + used + ' time' + (used === 1 ? '' : 's') + ' in this movie and will be removed there too.' : '');
                this.confirmAction({ title: source ? 'Delete video' : 'Delete clip', message: message, confirmLabel: 'Delete' })
                    .then(function (ok) {
                        if (!ok) return null;
                        var request = source
                            ? api('/api/delete_video', { method: 'POST', body: { id: clip.source_video_id } })
                            : api('/api/delete_clip', { method: 'POST', body: { unique_id: clip.unique_id } });
                        return request.then(function () { return self.refreshLibrary(); })
                            .then(function () { self.toast((source ? 'Video' : 'Clip') + ' deleted'); });
                    })
                    .catch(function (err) { self.toast(err.message, 'error'); });
            },

            // ---------------------------------------------------------- cutter
            openCutter: function (clip) {
                var video = this.videos.find(function (v) { return v.id === clip.source_video_id; });
                if (!video) {
                    this.toast('The source video for this clip was not found', 'error');
                    return;
                }
                if (this.player) this.player.pause();
                this.cutter.open = true;
                this.changeCutterVideo(video.id);
            },
            changeCutterVideo: function (videoId) {
                var video = this.videos.find(function (v) { return v.id === videoId; });
                if (!video) return;
                var c = this.cutter;
                c.videoId = video.id;
                c.duration = Number(video.duration) || 0;
                c.in = 0;
                c.out = c.duration;
                c.current = 0;
                c.error = '';
                c.busy = false;
                c.nameTouched = false;
                c.selectionEnd = null;
                this.updateCutterName();
            },
            updateCutterName: function () {
                var c = this.cutter;
                if (c.nameTouched) return;
                var video = this.cutterVideo;
                var base = video ? String(video.filename || 'Clip').replace(/\.[^.]+$/, '') : 'Clip';
                c.name = base + ' ' + fmt(c.in) + '\u2013' + fmt(c.out);
            },
            closeCutter: function () {
                var video = this.$refs.cutterVideo;
                if (video) video.pause();
                this.cutter.open = false;
            },
            pct: function (t) {
                return this.cutter.duration ? clamp(t / this.cutter.duration * 100, 0, 100) : 0;
            },
            onCutterLoaded: function () {
                var video = this.$refs.cutterVideo;
                if (!video) return;
                if (video.duration && Math.abs(video.duration - this.cutter.duration) > 0.5) {
                    this.cutter.duration = video.duration;
                    if (this.cutter.out > video.duration || this.cutter.out === 0) this.cutter.out = video.duration;
                    this.updateCutterName();
                }
            },
            onCutterTimeUpdate: function () {
                var video = this.$refs.cutterVideo;
                if (!video) return;
                this.cutter.current = video.currentTime;
                if (this.cutter.selectionEnd !== null && video.currentTime >= this.cutter.selectionEnd) {
                    video.pause();
                    this.cutter.selectionEnd = null;
                }
            },
            toggleCutterPlay: function () {
                var video = this.$refs.cutterVideo;
                if (!video) return;
                this.cutter.selectionEnd = null;
                if (video.paused) video.play().catch(function () {}); else video.pause();
            },
            playSelection: function () {
                var video = this.$refs.cutterVideo;
                if (!video) return;
                video.currentTime = this.cutter.in;
                this.cutter.selectionEnd = this.cutter.out;
                video.play().catch(function () {});
            },
            cutterSeek: function (t) {
                var video = this.$refs.cutterVideo;
                this.cutter.current = clamp(t, 0, this.cutter.duration);
                if (video) video.currentTime = this.cutter.current;
            },
            setCutterIn: function (t) {
                var c = this.cutter;
                var video = this.$refs.cutterVideo;
                if (t === undefined) t = video ? video.currentTime : 0;
                c.in = round3(clamp(Number(t) || 0, 0, Math.max(0, c.duration - 0.1)));
                if (c.out - c.in < 0.1) c.out = round3(Math.min(c.duration, c.in + 1));
                this.updateCutterName();
            },
            setCutterOut: function (t) {
                var c = this.cutter;
                var video = this.$refs.cutterVideo;
                if (t === undefined) t = video ? video.currentTime : c.duration;
                c.out = round3(clamp(Number(t) || 0, 0.1, c.duration));
                if (c.out - c.in < 0.1) c.in = round3(Math.max(0, c.out - 1));
                this.updateCutterName();
            },
            onTrimPointerDown: function (event, which) {
                if (event.button !== 0 || !this.cutter.duration) return;
                event.preventDefault();
                var self = this;
                var bar = this.$refs.trimBar;
                var timeAt = function (ev) {
                    var rect = bar.getBoundingClientRect();
                    return clamp((ev.clientX - rect.left) / rect.width, 0, 1) * self.cutter.duration;
                };
                var apply = function (ev) {
                    var t = timeAt(ev);
                    if (which === 'in') {
                        self.setCutterIn(Math.min(t, self.cutter.out - 0.1));
                        self.cutterSeek(self.cutter.in);
                    } else if (which === 'out') {
                        self.setCutterOut(Math.max(t, self.cutter.in + 0.1));
                        self.cutterSeek(self.cutter.out);
                    } else {
                        self.cutterSeek(t);
                    }
                };
                apply(event);
                this.startPointerDrag({ move: apply });
            },
            createClip: function () {
                var self = this;
                var c = this.cutter;
                if (c.out - c.in < 0.1) {
                    c.error = 'OUT has to be after IN.';
                    return;
                }
                c.busy = true;
                c.error = '';
                var name = (c.name || '').trim() || 'Clip ' + fmt(c.in) + '\u2013' + fmt(c.out);
                api('/api/clip', {
                    method: 'POST',
                    body: { projectId: this.projectId, sourceId: c.videoId, start: round3(c.in), end: round3(c.out), name: name }
                }).then(function (res) {
                    return self.refreshLibrary().then(function () {
                        var clip = self.clipMap.get(res.clipId);
                        self.binTab = 'clips';
                        c.busy = false;
                        self.closeCutter();
                        if (clip && c.addToTimeline) self.appendClip(clip);
                        else self.toast('Clip \u201c' + name + '\u201d created');
                    });
                }).catch(function (err) {
                    c.busy = false;
                    c.error = err.message;
                });
            },

            // ---------------------------------------------------------- export
            openExport: function () {
                var self = this;
                var project = this.projects.find(function (p) { return p.id === self.projectId; });
                if (!this.exporter.title) this.exporter.title = project ? project.title : 'My interactive movie';
                this.exporter.open = true;
                this.exporter.error = '';
                this.exporter.issues = this.issues;
                this.exporter.stats = this.compiled.stats;
                if (this.player) this.player.pause();
                this.flushSave();
                this.loadExports();
            },
            closeExport: function () {
                this.exporter.open = false;
            },
            startRender: function () {
                var self = this;
                var ex = this.exporter;
                ex.error = '';
                this.flushSave()
                    .then(function () {
                        return api('/api/timeline/render', {
                            method: 'POST',
                            body: { projectId: self.projectId, title: ex.title, resolution: ex.resolution }
                        });
                    })
                    .then(function (res) {
                        ex.job = res.job;
                        if (res.issues) ex.issues = res.issues;
                        if (res.stats) ex.stats = res.stats;
                        self.pollJob(res.job.id);
                    })
                    .catch(function (err) { ex.error = err.message; });
            },
            pollJob: function (jobId) {
                var self = this;
                clearTimeout(this._pollTimer);
                var failures = 0;
                var tick = function () {
                    api('/api/render_jobs/' + jobId).then(function (res) {
                        failures = 0;
                        if (self.exporter.job && self.exporter.job.id === jobId) self.exporter.job = res.job;
                        if (res.job.status === 'done') {
                            self.loadExports();
                            self.toast('Your movie is ready');
                            return;
                        }
                        if (res.job.status === 'error') {
                            self.exporter.error = res.job.error || 'Rendering failed';
                            return;
                        }
                        self._pollTimer = setTimeout(tick, 1000);
                    }).catch(function (err) {
                        failures += 1;
                        if (failures > 5) {
                            self.exporter.error = 'Lost contact with the render job: ' + err.message;
                            return;
                        }
                        self._pollTimer = setTimeout(tick, 2000);
                    });
                };
                this._pollTimer = setTimeout(tick, 600);
            },
            loadExports: function () {
                var self = this;
                api('/api/exports').then(function (list) {
                    var stamp = function (name) { var m = /_(\d{10,})$/.exec(name); return m ? Number(m[1]) : 0; };
                    self.exporter.exports = (list || [])
                        .slice()
                        .sort(function (a, b) { return stamp(b.name) - stamp(a.name); })
                        .slice(0, 6);
                }).catch(function () { /* ignore */ });
            },
            copyLink: function (url) {
                var self = this;
                var full = new URL(url, window.location.href).href;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(full).then(function () { self.toast('Link copied'); })
                        .catch(function () { self.toast(full); });
                } else {
                    this.toast(full);
                }
            },

            // ---------------------------------------------------------- dialogs
            askText: function (opts) {
                var self = this;
                return new Promise(function (resolve) {
                    self._dialogResolve = resolve;
                    Object.assign(self.dialog, {
                        open: true, kind: 'text', title: opts.title || '', message: opts.message || '',
                        value: opts.value || '', placeholder: opts.placeholder || '',
                        confirmLabel: opts.confirmLabel || 'Save', danger: false
                    });
                    nextTick(function () {
                        if (self.$refs.dialogInput) {
                            self.$refs.dialogInput.focus();
                            self.$refs.dialogInput.select();
                        }
                    });
                });
            },
            confirmAction: function (opts) {
                var self = this;
                return new Promise(function (resolve) {
                    self._dialogResolve = resolve;
                    Object.assign(self.dialog, {
                        open: true, kind: 'confirm', title: opts.title || 'Are you sure?', message: opts.message || '',
                        value: '', placeholder: '', confirmLabel: opts.confirmLabel || 'OK', danger: opts.danger !== false
                    });
                });
            },
            closeDialog: function (ok) {
                var dialog = this.dialog;
                var resolve = this._dialogResolve;
                this._dialogResolve = null;
                dialog.open = false;
                if (!resolve) return;
                if (dialog.kind === 'text') resolve(ok ? String(dialog.value || '').trim() : null);
                else resolve(Boolean(ok));
            },

            // ---------------------------------------------------------- keyboard
            onKeyDown: function (event) {
                var key = event.key;
                var target = event.target || {};
                var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;

                if (this.dialog.open) {
                    if (key === 'Escape') this.closeDialog(false);
                    else if (key === 'Enter' && this.dialog.kind === 'confirm') this.closeDialog(true);
                    return;
                }
                if (this.cutter.open) {
                    if (key === 'Escape') { this.closeCutter(); return; }
                    if (typing) return;
                    if (key === 'i' || key === 'I') { this.setCutterIn(); event.preventDefault(); }
                    else if (key === 'o' || key === 'O') { this.setCutterOut(); event.preventDefault(); }
                    else if (key === ' ') { event.preventDefault(); this.toggleCutterPlay(); }
                    return;
                }
                if (this.exporter.open) {
                    if (key === 'Escape') this.closeExport();
                    return;
                }
                if (this.settingsOpen) {
                    if (key === 'Escape') this.settingsOpen = false;
                    return;
                }
                if (typing) return;
                if (target.closest && target.closest('.ip-root')) return; // the player handles its own keys

                var mod = event.metaKey || event.ctrlKey;
                if (mod && (key === 'z' || key === 'Z')) {
                    event.preventDefault();
                    if (event.shiftKey) this.redo(); else this.undo();
                    return;
                }
                if (mod && (key === 'y' || key === 'Y')) {
                    event.preventDefault();
                    this.redo();
                    return;
                }
                if (mod || event.altKey) return;

                if (key === ' ') {
                    event.preventDefault();
                    if (target.tagName === 'BUTTON' && target.blur) target.blur();
                    this.togglePlay();
                } else if (key === 'c' || key === 'C') {
                    this.addChoiceAtPlayhead();
                } else if (key === 'm' || key === 'M') {
                    this.addMarkerAtPlayhead('chapter');
                } else if (key === 't' || key === 'T') {
                    this.addOverlayAtPlayhead();
                } else if (key === 'Delete' || key === 'Backspace') {
                    if (this.selection) {
                        event.preventDefault();
                        this.deleteSelection();
                    }
                } else if (key === 'ArrowLeft') {
                    event.preventDefault();
                    this.nudgePlayhead(event.shiftKey ? -5 : -1);
                } else if (key === 'ArrowRight') {
                    event.preventDefault();
                    this.nudgePlayhead(event.shiftKey ? 5 : 1);
                } else if (key === 'Escape') {
                    this.selection = null;
                }
            }
        }
    }).mount('#app');
})();
