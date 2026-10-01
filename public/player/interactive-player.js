/*!
 * Video Infinity - Interactive Player v2
 *
 * Shared by the Timeline Studio preview and every exported movie, so what you preview is
 * exactly what viewers get.
 *
 *  - Plays a main movie: one stitched file (exports) or several clips back-to-back
 *    (studio preview, double-buffered so clip changes are near seamless). Each segment can
 *    start part-way into its file, which is how in-timeline trimming works.
 *  - Pauses at choice points and shows the options on top of the video.
 *  - Hovering (or focusing) an option plays a muted preview of its clip.
 *  - Clicking an option plays that clip; when it ends the main movie resumes from the
 *    exact frame where it paused.
 *  - Options can also jump to a marker or end the movie, set flags, and be hidden or locked
 *    until a flag is set.
 *  - Chapters, jump markers, endings, on-screen titles and captions.
 *  - Optional "keep playing" choices (the movie continues while viewers decide).
 *  - Saves progress so viewers can resume later (exports only).
 *
 * Usage:
 *   new InteractivePlayer(element, {
 *     title, poster, theme, startScreen, allowSeek, showChapters, rememberProgress,
 *     segments: [{ src, duration, mediaStart, label }],
 *     choicePoints: [{ id, time, prompt, timeout, mode, allowSkip, defaultOptionId,
 *                      options: [{ id, label, color, clip: { src, poster, duration, captions }|null,
 *                                  then: { type, targetId, targetTime, ending },
 *                                  setFlags, requires, whenLocked }] }],
 *     markers:  [{ id, type: chapter|jump|end, time, label, targetId, targetTime, condition, ending }],
 *     overlays: [{ id, text, position, start, end }],
 *     captions: [{ start, end, text }],
 *     endings:  [{ id, label, reachable, source }],
 *     onEvent: function (type, detail) {}
 *   });
 */
(function (global) {
    'use strict';

    var ICONS = {
        play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
        pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
        volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
        muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
        fullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.05-4.95M5 4v4h4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7l-5 5 5 5M5.5 12H15a4 4 0 0 1 0 8h-2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        chapters: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
        cc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 10.5a2.5 2.5 0 1 0 0 3M17.5 10.5a2.5 2.5 0 1 0 0 3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
        lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
        jump: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6l6 6-6 6M13 6l6 6-6 6" fill="currentColor"/></svg>',
        end: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M6 5h11l-3 3.5L17 12H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    };

    function el(tag, className, parent) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (parent) parent.appendChild(node);
        return node;
    }

    function button(className, parent, label, icon) {
        var node = el('button', className, parent);
        node.type = 'button';
        if (label) node.setAttribute('aria-label', label);
        if (icon) node.innerHTML = icon;
        return node;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function formatTime(seconds) {
        seconds = Math.max(0, Math.floor(Number(seconds) || 0));
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = seconds % 60;
        var mm = h ? String(m).padStart(2, '0') : String(m);
        return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
    }

    function InteractivePlayer(container, options) {
        if (!(this instanceof InteractivePlayer)) return new InteractivePlayer(container, options);
        options = options || {};
        this.container = container;
        this.opts = {
            title: options.title || '',
            poster: options.poster || '',
            theme: options.theme || '#3b82f6',
            startScreen: Boolean(options.startScreen),
            onEvent: typeof options.onEvent === 'function' ? options.onEvent : null
        };
        this.state = 'empty'; // empty | loading | paused | playing | choosing | option | ended
        this.segments = [];
        this.choicePoints = [];
        this.markers = [];
        this.overlays = [];
        this.captions = [];
        this.endings = [];
        this.settings = { allowSeek: true, showChapters: true, rememberProgress: false };
        this.duration = 0;
        this.active = 0;
        this.segIndex = 0;
        this.completed = {};
        this.currentPoint = null;
        this.currentOption = null;
        this.resumeAt = 0;
        this.flags = {};
        this.volume = 1;
        this.muted = false;
        this.captionsOn = true;
        this._segSig = null;
        this._loadToken = 0;
        this._pendingLocal = null;
        this._wantPlay = false;
        this._raf = null;
        this._timerRaf = null;
        this._preparedPointId = null;
        this._lastEmit = 0;
        this._idleTimer = null;
        this._listeners = [];
        this._saveKey = null;
        this._saveTimer = null;
        this._saveDirty = false;
        this._savedState = null;
        this._activeCue = null;
        this._activeOverlay = null;
        this._activeChapter = null;
        this._optionCue = null;
        this._chapterMenuOpen = false;
        this._loopJumps = {};
        this._jumpTimes = [];

        this._build();
        this.setTimeline(options);
        if (this.opts.startScreen) {
            this.startEl.hidden = false;
        }
        container.__player = this;
    }

    var P = InteractivePlayer.prototype;

    // ------------------------------------------------------------------ DOM

    P._build = function () {
        var self = this;
        var root = this.root = el('div', 'ip-root');
        root.tabIndex = 0;
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', 'Interactive movie player');
        root.style.setProperty('--ip-accent', this.opts.theme);

        var stage = this.stage = el('div', 'ip-stage', root);
        this.mains = [this._makeVideo('ip-video ip-main', stage), this._makeVideo('ip-video ip-main ip-hidden', stage)];
        this.optionVideo = this._makeVideo('ip-video ip-option ip-hidden', stage);

        this.spinner = el('div', 'ip-spinner', stage);
        this.spinner.hidden = true;

        this.messageEl = el('div', 'ip-message', stage);
        this.messageEl.hidden = true;

        // Chapter badge (top-left) and on-screen title / caption (bottom)
        this.chapterBadge = el('div', 'ip-chapter-badge', stage);
        this.chapterBadge.hidden = true;
        this.overlayEl = el('div', 'ip-title-card', stage);
        this.overlayEl.hidden = true;
        this.captionEl = el('div', 'ip-caption', stage);
        this.captionEl.hidden = true;

        // Choice overlay
        var overlay = this.overlay = el('div', 'ip-choice', stage);
        overlay.hidden = true;
        var panel = el('div', 'ip-choice-panel', overlay);
        this.promptEl = el('div', 'ip-choice-prompt', panel);
        this.timerEl = el('div', 'ip-choice-timer', panel);
        this.timerFill = el('div', 'ip-choice-timer-fill', this.timerEl);
        this.cardsEl = el('div', 'ip-choice-cards', panel);
        this.skipBtn = button('ip-choice-skip', panel, 'Continue watching');
        this.skipBtn.textContent = 'Continue watching \u25B8';

        // "Now playing your choice" badge
        var badge = this.badge = el('div', 'ip-option-badge', stage);
        badge.hidden = true;
        var badgeText = el('div', 'ip-option-badge-text', badge);
        el('span', 'ip-option-badge-kicker', badgeText).textContent = 'Your choice';
        this.badgeLabel = el('span', 'ip-option-badge-label', badgeText);
        this.badgeProgress = el('div', 'ip-option-badge-progress', badge);
        this.badgeFill = el('div', 'ip-option-badge-fill', this.badgeProgress);
        this.returnBtn = button('ip-option-return', badge, 'Back to the movie', ICONS.back);
        el('span', '', this.returnBtn).textContent = 'Back to movie';

        // Start + end screens
        var start = this.startEl = el('div', 'ip-start', stage);
        start.hidden = true;
        this.startPoster = el('div', 'ip-start-poster', start);
        var startBody = el('div', 'ip-start-body', start);
        this.startTitle = el('div', 'ip-start-title', startBody);
        this.startBtn = button('ip-start-play', startBody, 'Play movie', ICONS.play);
        this.resumeBtn = button('ip-start-resume', startBody, 'Resume');
        this.resumeBtn.hidden = true;
        el('div', 'ip-start-hint', startBody).textContent = 'An interactive movie \u2014 you choose what happens';

        var end = this.endEl = el('div', 'ip-end', stage);
        end.hidden = true;
        this.endTitle = el('div', 'ip-end-title', end);
        this.endTitle.textContent = 'The End';
        var endButtons = el('div', 'ip-end-buttons', end);
        this.replayBtn = button('ip-end-replay', endButtons, 'Watch again', ICONS.replay);
        el('span', '', this.replayBtn).textContent = 'Watch again';
        this.endingsBtn = button('ip-end-endings', endButtons, 'Other endings', ICONS.chapters);
        el('span', '', this.endingsBtn).textContent = 'Other endings';
        this.endingsBtn.hidden = true;
        this.endingsPanel = el('div', 'ip-endings', end);
        this.endingsPanel.hidden = true;

        // Controls
        var controls = this.controls = el('div', 'ip-controls', root);
        this.playBtn = button('ip-btn ip-play', controls, 'Play', ICONS.play);
        this.timeEl = el('span', 'ip-time', controls);
        var progress = this.progress = el('div', 'ip-progress', controls);
        progress.setAttribute('role', 'slider');
        progress.setAttribute('aria-label', 'Seek');
        this.progressTrack = el('div', 'ip-progress-track', progress);
        this.progressFill = el('div', 'ip-progress-fill', this.progressTrack);
        this.markersEl = el('div', 'ip-progress-markers', progress);
        this.progressTip = el('div', 'ip-progress-tip', progress);
        this.chaptersBtn = button('ip-btn ip-chapters', controls, 'Chapters', ICONS.chapters);
        this.chaptersBtn.hidden = true;
        this.ccBtn = button('ip-btn ip-cc', controls, 'Captions', ICONS.cc);
        this.ccBtn.hidden = true;
        this.muteBtn = button('ip-btn ip-mute', controls, 'Mute', ICONS.volume);
        this.volumeInput = el('input', 'ip-volume', controls);
        this.volumeInput.type = 'range';
        this.volumeInput.min = '0';
        this.volumeInput.max = '1';
        this.volumeInput.step = '0.05';
        this.volumeInput.value = '1';
        this.volumeInput.setAttribute('aria-label', 'Volume');
        this.fsBtn = button('ip-btn ip-fullscreen', controls, 'Fullscreen', ICONS.fullscreen);

        // Chapters menu
        var chapterMenu = this.chapterMenu = el('div', 'ip-chapters-menu', root);
        chapterMenu.hidden = true;
        el('div', 'ip-chapters-title', chapterMenu).textContent = 'Chapters';
        this.chapterList = el('div', 'ip-chapters-list', chapterMenu);

        this.container.appendChild(root);

        // Events
        this.mains.forEach(function (video) {
            video.addEventListener('ended', function () {
                if (video === self.mains[self.active]) self._onSegmentEnd();
            });
            video.addEventListener('waiting', function () {
                if (video === self.mains[self.active] && self.state === 'playing') self._spin(true);
            });
            video.addEventListener('playing', function () {
                if (video === self.mains[self.active]) self._spin(false);
            });
            video.addEventListener('error', function () {
                if (video === self.mains[self.active] && video._ipSrc) {
                    self._spin(false);
                    self._showMessage('This clip could not be played in the browser.');
                }
            });
        });
        this.optionVideo.addEventListener('ended', function () { self._optionEnded(); });
        this.optionVideo.addEventListener('waiting', function () { if (self.state === 'option') self._spin(true); });
        this.optionVideo.addEventListener('playing', function () { self._spin(false); });
        this.optionVideo.addEventListener('error', function () {
            if (self.state !== 'option') return;
            self._showMessage('This choice clip could not be played. Returning to the movie\u2026', 1800);
            setTimeout(function () { self._optionEnded(); }, 1200);
        });

        this.playBtn.addEventListener('click', function () { self.togglePlay(); });
        stage.addEventListener('click', function (event) {
            if (event.target === stage || event.target.classList.contains('ip-video')) self.togglePlay();
        });
        this.startBtn.addEventListener('click', function () { self.play(); });
        this.resumeBtn.addEventListener('click', function () { self._resumeSaved(); });
        this.replayBtn.addEventListener('click', function () { self.restart(); });
        this.endingsBtn.addEventListener('click', function () {
            self.endingsPanel.hidden = !self.endingsPanel.hidden;
        });
        this.skipBtn.addEventListener('click', function () { self.continueWatching(); });
        this.returnBtn.addEventListener('click', function () { self._optionEnded(true); });
        this.muteBtn.addEventListener('click', function () { self.setMuted(!self.muted); });
        this.volumeInput.addEventListener('input', function () {
            self.setVolume(Number(self.volumeInput.value));
            if (self.muted && self.volume > 0) self.setMuted(false);
        });
        this.fsBtn.addEventListener('click', function () { self.toggleFullscreen(); });
        this.chaptersBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            self._toggleChapterMenu();
        });
        this.ccBtn.addEventListener('click', function () { self.setCaptions(!self.captionsOn); });

        var seekFromEvent = function (event) {
            var rect = self.progressTrack.getBoundingClientRect();
            var pct = rect.width ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0;
            return pct * self.duration;
        };
        progress.addEventListener('click', function (event) {
            if (!self.duration || !self.settings.allowSeek) return;
            self.seek(seekFromEvent(event));
        });
        progress.addEventListener('mousemove', function (event) {
            if (!self.duration) return;
            var t = seekFromEvent(event);
            self.progressTip.textContent = formatTime(t);
            self.progressTip.style.left = (t / self.duration * 100) + '%';
        });

        root.addEventListener('keydown', function (event) { self._onKey(event); });
        root.addEventListener('mousemove', function () { self._wake(); });
        root.addEventListener('mouseleave', function () {
            if (self.state === 'playing') root.classList.add('ip-idle');
        });
        this._on(document, 'fullscreenchange', function () {
            root.classList.toggle('ip-is-fullscreen', document.fullscreenElement === root);
        });
        this._on(document, 'click', function (event) {
            if (self._chapterMenuOpen && !self.chapterMenu.contains(event.target) && event.target !== self.chaptersBtn) {
                self._closeChapterMenu();
            }
        });
        this._on(window, 'beforeunload', function () { self._saveNow(); });
    };

    P._makeVideo = function (className, parent) {
        var video = document.createElement('video');
        video.className = className;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.preload = 'auto';
        video.controls = false;
        video.disablePictureInPicture = true;
        parent.appendChild(video);
        return video;
    };

    P._on = function (target, type, handler) {
        target.addEventListener(type, handler);
        this._listeners.push([target, type, handler]);
    };

    // ------------------------------------------------------------------ Timeline data

    P.setTimeline = function (data) {
        data = data || {};
        var self = this;
        var cursor = 0;
        var segments = (Array.isArray(data.segments) ? data.segments : [])
            .filter(function (s) { return s && s.src && Number(s.duration) > 0; })
            .map(function (s) {
                var seg = {
                    src: String(s.src),
                    duration: Number(s.duration),
                    mediaStart: Math.max(0, Number(s.mediaStart) || 0),
                    start: cursor,
                    id: s.id || null,
                    label: s.label || ''
                };
                cursor += seg.duration;
                return seg;
            });
        var signature = segments.map(function (s) { return s.src + '|' + s.duration.toFixed(3) + '|' + s.mediaStart.toFixed(3); }).join(';');
        var segmentsChanged = signature !== this._segSig;
        this.segments = segments;
        this.duration = cursor;
        this._segSig = signature;

        if (data.title !== undefined) this.opts.title = data.title || '';
        if (data.poster !== undefined) this.opts.poster = data.poster || '';
        if (data.theme) {
            this.opts.theme = data.theme;
            this.root.style.setProperty('--ip-accent', data.theme);
        }
        if (data.settings) {
            this.settings = {
                allowSeek: data.settings.allowSeek !== false,
                showChapters: data.settings.showChapters !== false,
                rememberProgress: Boolean(data.settings.rememberProgress)
            };
        }
        this.startTitle.textContent = this.opts.title || 'Interactive movie';
        this.startPoster.style.backgroundImage = this.opts.poster ? 'url("' + String(this.opts.poster).replace(/"/g, '%22') + '")' : '';

        this.markers = (Array.isArray(data.markers) ? data.markers : [])
            .map(function (m) {
                return {
                    id: String(m.id),
                    type: m.type === 'jump' || m.type === 'end' ? m.type : 'chapter',
                    time: clamp(Number(m.time) || 0, 0, self.duration),
                    label: m.label || '',
                    targetId: m.targetId || null,
                    targetTime: m.targetTime === null || m.targetTime === undefined ? null : Number(m.targetTime),
                    condition: m.condition || null,
                    ending: m.ending || ''
                };
            })
            .sort(function (a, b) { return a.time - b.time; });

        this.choicePoints = (Array.isArray(data.choicePoints) ? data.choicePoints : [])
            .map(function (p) {
                var options = (Array.isArray(p.options) ? p.options : [])
                    .filter(function (o) { return o && (o.clip || (o.then && o.then.type) ); })
                    .map(function (o) {
                        return {
                            id: String(o.id),
                            label: o.label || '',
                            color: o.color || '#ffffff',
                            clip: o.clip && o.clip.src ? {
                                clipId: o.clip.clipId || null,
                                src: String(o.clip.src),
                                poster: o.clip.poster || '',
                                duration: Number(o.clip.duration) || 0,
                                captions: Array.isArray(o.clip.captions) ? o.clip.captions : []
                            } : null,
                            then: o.then && o.then.type ? {
                                type: o.then.type,
                                targetId: o.then.targetId || null,
                                targetTime: o.then.targetTime === null || o.then.targetTime === undefined ? null : Number(o.then.targetTime),
                                ending: o.then.ending || ''
                            } : { type: 'continue', targetId: null, targetTime: null, ending: '' },
                            setFlags: Array.isArray(o.setFlags) ? o.setFlags : [],
                            requires: o.requires || null,
                            whenLocked: o.whenLocked === 'lock' ? 'lock' : 'hide'
                        };
                    });
                return {
                    id: String(p.id),
                    time: clamp(Number(p.time) || 0, 0, self.duration),
                    prompt: p.prompt || '',
                    timeout: Math.max(0, Number(p.timeout) || 0),
                    mode: p.mode === 'play' && Math.max(0, Number(p.timeout) || 0) > 0 ? 'play' : 'pause',
                    allowSkip: p.allowSkip !== false,
                    defaultOptionId: p.defaultOptionId || null,
                    options: options
                };
            })
            .filter(function (p) { return p.options.length > 0; })
            .sort(function (a, b) { return a.time - b.time; });

        this.overlays = (Array.isArray(data.overlays) ? data.overlays : [])
            .filter(function (o) { return o && o.text && Number(o.end) > Number(o.start); })
            .map(function (o) {
                return {
                    id: String(o.id),
                    text: String(o.text),
                    position: ['top', 'center', 'lower', 'bottom'].indexOf(o.position) !== -1 ? o.position : 'lower',
                    start: Number(o.start),
                    end: Number(o.end)
                };
            })
            .sort(function (a, b) { return a.start - b.start; });

        this.captions = (Array.isArray(data.captions) ? data.captions : [])
            .filter(function (c) { return c && c.text && Number(c.end) > Number(c.start); })
            .map(function (c) { return { start: Number(c.start), end: Number(c.end), text: String(c.text) }; })
            .sort(function (a, b) { return a.start - b.start; });

        this.endings = (Array.isArray(data.endings) ? data.endings : [])
            .filter(function (e) { return e && e.id; })
            .map(function (e) { return { id: String(e.id), label: e.label || 'The End', reachable: e.reachable !== false, source: e.source || 'end' }; });

        this._preparedPointId = null;
        this._activeCue = undefined;
        this._activeOverlay = undefined;
        this._activeChapter = undefined;
        if (this.state === 'choosing' && this.currentPoint) {
            var stillThere = this.choicePoints.some(function (p) { return p.id === self.currentPoint.id; });
            if (!stillThere) {
                this._closeChoice();
                this.currentPoint = null;
                this._setState('paused');
            }
        }
        this._renderMarkers();
        this._renderChapterMenu();
        this._renderEndings();
        this._updateControlVisibility();

        if (!segments.length) {
            this._cancelInteraction();
            this.mains.forEach(function (v) { self._clearSrc(v); });
            this._setState('empty');
            this._updateTime(0);
            return;
        }
        if (segmentsChanged) {
            var keepTime = this.state === 'empty' ? 0 : Math.min(this.currentTime(), this.duration);
            var keepPlaying = this.state === 'playing';
            if (this.state === 'choosing' || this.state === 'option') {
                keepTime = Math.min(this.resumeAt, this.duration);
                this._cancelInteraction();
            }
            if (this.state === 'ended') this.endEl.hidden = true;
            this._loadAt(keepTime, keepPlaying);
        } else {
            this._updateTime();
        }
    };

    P._renderMarkers = function () {
        var self = this;
        this.markersEl.textContent = '';
        if (!this.duration) return;
        this.choicePoints.forEach(function (point) {
            var marker = el('div', 'ip-marker ip-marker-choice', self.markersEl);
            marker.style.left = (point.time / self.duration * 100) + '%';
            marker.title = (point.prompt || 'Choice') + ' \u2014 ' + formatTime(point.time);
        });
        this.markers.forEach(function (m) {
            if (m.type !== 'chapter') return;
            var marker = el('div', 'ip-marker ip-marker-chapter', self.markersEl);
            marker.style.left = (m.time / self.duration * 100) + '%';
            marker.title = m.label + ' \u2014 ' + formatTime(m.time);
        });
    };

    P._renderChapterMenu = function () {
        var self = this;
        this.chapterList.textContent = '';
        this.markers.forEach(function (m) {
            if (m.type !== 'chapter') return;
            var row = button('ip-chapter-row', self.chapterList, m.label);
            var name = el('span', 'ip-chapter-name', row);
            name.textContent = m.label;
            var time = el('span', 'ip-chapter-time', row);
            time.textContent = formatTime(m.time);
            row.addEventListener('click', function () {
                self._closeChapterMenu();
                self.seek(m.time + 0.001, true);
                self.play();
            });
        });
    };

    P._renderEndings = function () {
        var self = this;
        this.endingsPanel.textContent = '';
        if (!this.endings.length) return;
        el('div', 'ip-endings-title', this.endingsPanel).textContent = 'Endings';
        var list = el('div', 'ip-endings-list', this.endingsPanel);
        this.endings.forEach(function (ending) {
            var row = el('div', 'ip-ending-row', list);
            row.classList.add(ending.reachable ? 'is-found' : 'is-missing');
            el('span', 'ip-ending-icon', row).innerHTML = ending.reachable ? '\u2713' : '?';
            el('span', 'ip-ending-name', row).textContent = ending.reachable ? ending.label : 'Undiscovered ending';
        });
    };

    P._updateControlVisibility = function () {
        var hasChapters = this.settings.showChapters && this.markers.some(function (m) { return m.type === 'chapter'; });
        this.chaptersBtn.hidden = !hasChapters;
        if (!hasChapters) this._closeChapterMenu();
        var hasCaptions = this.captions.length > 0 || this.choicePoints.some(function (p) {
            return p.options.some(function (o) { return o.clip && o.clip.captions.length; });
        });
        this.ccBtn.hidden = !hasCaptions;
        this.ccBtn.classList.toggle('ip-on', this.captionsOn);
        this.progress.classList.toggle('ip-no-seek', !this.settings.allowSeek);
    };

    // ------------------------------------------------------------------ Main playback

    P.currentTime = function () {
        var seg = this.segments[this.segIndex];
        if (!seg) return 0;
        var video = this.mains[this.active];
        var local = this._pendingLocal !== null ? this._pendingLocal : (video ? video.currentTime - seg.mediaStart : 0);
        return clamp(seg.start + Math.min(local || 0, seg.duration), 0, this.duration);
    };

    P._segmentAt = function (t) {
        for (var i = 0; i < this.segments.length; i++) {
            var seg = this.segments[i];
            if (t < seg.start + seg.duration - 0.0005) return i;
        }
        return Math.max(0, this.segments.length - 1);
    };

    P._srcOf = function (video) {
        return video._ipSrc || '';
    };

    P._setSrc = function (video, src) {
        if (video._ipSrc === src) return;
        video._ipSrc = src;
        video.src = src;
    };

    P._clearSrc = function (video) {
        if (!video._ipSrc) return;
        video._ipSrc = '';
        video.pause();
        video.removeAttribute('src');
        try { video.load(); } catch (e) { /* ignore */ }
    };

    P._showMain = function (index) {
        this.mains[index].classList.remove('ip-hidden');
        this.mains[1 - index].classList.add('ip-hidden');
    };

    P._loadAt = function (t, play) {
        var self = this;
        if (!this.segments.length) return;
        t = clamp(t, 0, this.duration);
        var index = this._segmentAt(t);
        var seg = this.segments[index];
        var local = clamp(t - seg.start, 0, Math.max(0, seg.duration - 0.001));
        var mediaTime = seg.mediaStart + local;
        var token = ++this._loadToken;

        // Reuse the standby element if it already buffered this clip
        if (this._srcOf(this.mains[this.active]) !== seg.src && this._srcOf(this.mains[1 - this.active]) === seg.src) {
            this.mains[this.active].pause();
            this.active = 1 - this.active;
        }
        var video = this.mains[this.active];
        this.segIndex = index;
        this._showMain(this.active);
        this._pendingLocal = local;
        this._wantPlay = Boolean(play);
        if (this.state !== 'playing') this._setState('loading');
        this._updateTime(t);

        var ready = function () {
            if (token !== self._loadToken) return;
            try {
                if (Math.abs(video.currentTime - mediaTime) > 0.03) video.currentTime = mediaTime;
            } catch (e) { /* ignore */ }
            self._pendingLocal = null;
            self._spin(false);
            if (self._wantPlay) {
                self._playMain();
            } else {
                video.pause();
                self._setState('paused');
                self._updateTime();
            }
            self._preloadNext();
        };

        if (this._srcOf(video) !== seg.src) {
            this._setSrc(video, seg.src);
            this._spin(true);
            video.addEventListener('loadedmetadata', function onMeta() {
                video.removeEventListener('loadedmetadata', onMeta);
                ready();
            });
        } else if (video.readyState >= 1) {
            ready();
        } else {
            this._spin(true);
            video.addEventListener('loadedmetadata', function onMeta() {
                video.removeEventListener('loadedmetadata', onMeta);
                ready();
            });
        }
    };

    P._preloadNext = function () {
        var next = this.segments[this.segIndex + 1];
        if (!next) return;
        var standby = this.mains[1 - this.active];
        if (this._srcOf(standby) !== next.src) {
            standby.pause();
            this._setSrc(standby, next.src);
        } else if (standby.readyState >= 1 && Math.abs(standby.currentTime - next.mediaStart) > 0.05) {
            try { standby.currentTime = next.mediaStart; } catch (e) { /* ignore */ }
        }
    };

    P._switchToSegment = function (index) {
        var self = this;
        var seg = this.segments[index];
        var previous = this.mains[this.active];
        var nextIndex = 1 - this.active;
        var video = this.mains[nextIndex];
        this.segIndex = index;
        this._loadToken++;
        this._pendingLocal = null;
        if (this._srcOf(video) !== seg.src) {
            this._setSrc(video, seg.src);
        } else {
            try { video.currentTime = seg.mediaStart; } catch (e) { /* ignore */ }
        }
        this.active = nextIndex;
        this._showMain(nextIndex);
        previous.pause();
        this._applyVolume();
        this._playMain();
        setTimeout(function () { self._preloadNext(); }, 60);
    };

    P._playMain = function () {
        var self = this;
        var video = this.mains[this.active];
        this._hideOverlays();
        this._setState('playing');
        this._applyVolume();
        var promise = video.play();
        if (promise && typeof promise.catch === 'function') {
            promise.catch(function (err) {
                if (err && err.name === 'NotAllowedError' && self.state === 'playing') {
                    self._setState('paused');
                }
            });
        }
        this._startLoop();
    };

    P._startLoop = function () {
        if (this._raf) return;
        var self = this;
        var tick = function () {
            self._raf = null;
            self._tick();
            if (self.state === 'playing' || self.state === 'option' || self.state === 'choosing') self._raf = requestAnimationFrame(tick);
        };
        this._raf = requestAnimationFrame(tick);
    };

    P._tick = function () {
        if (this.state === 'playing' || (this.state === 'choosing' && this.currentPoint && this.currentPoint.mode === 'play')) {
            var seg = this.segments[this.segIndex];
            if (!seg || this._pendingLocal !== null) return;
            var video = this.mains[this.active];
            var t = this.currentTime();
            this._prepareUpcoming(t);
            if (this._checkChoices(t)) return;
            if (this._checkMarkers(t)) return;
            if (video.ended || video.currentTime >= seg.mediaStart + seg.duration - 0.02) {
                this._onSegmentEnd();
                return;
            }
            this._updateTime(t);
        } else if (this.state === 'option') {
            var ov = this.optionVideo;
            var dur = ov.duration || (this.currentOption && this.currentOption.clip && this.currentOption.clip.duration) || 0;
            this.badgeFill.style.transform = 'scaleX(' + (dur ? clamp(ov.currentTime / dur, 0, 1) : 0) + ')';
            this._updateOptionCaption();
        }
    };

    P._onSegmentEnd = function () {
        if (this.state !== 'playing' && !(this.state === 'choosing' && this.currentPoint && this.currentPoint.mode === 'play')) return;
        var seg = this.segments[this.segIndex];
        if (!seg) return;
        // A choice or marker placed at the very end of a clip fires before moving on
        if (this._checkChoices(seg.start + seg.duration + 0.001)) return;
        if (this._checkMarkers(seg.start + seg.duration + 0.001)) return;
        if (this.segIndex >= this.segments.length - 1) {
            this._finish('__end__');
            return;
        }
        this._switchToSegment(this.segIndex + 1);
    };

    P._finish = function (endingId, label) {
        this._cancelInteraction();
        this.mains[this.active].pause();
        this._setState('ended');
        var ending = this.endings.filter(function (e) { return e.id === endingId; })[0];
        this.endTitle.textContent = label || (ending && ending.label) || 'The End';
        this.endEl.hidden = false;
        this.endingsBtn.hidden = this.endings.length <= 1;
        this.endingsPanel.hidden = true;
        this._updateTime(this.duration);
        this._clearSave();
        this._emit('ended', { endingId: endingId || '__end__', label: this.endTitle.textContent });
    };

    // ------------------------------------------------------------------ Markers (chapters, jumps, endings)

    P._checkMarkers = function (t) {
        for (var i = 0; i < this.markers.length; i++) {
            var m = this.markers[i];
            if (m.type === 'chapter') continue;
            if (m.time > t + 0.001) break;
            if (this.completed['marker:' + m.id]) continue;
            if (m.condition && Boolean(this.flags[m.condition.flag]) !== (m.condition.is !== false)) continue;
            this.completed['marker:' + m.id] = true;
            if (m.type === 'jump' && m.targetTime !== null && m.targetTime >= 0) {
                // Flags only change when the viewer chooses, so if the same jump marker fires
                // twice with no choice in between, playback would repeat forever: stop instead.
                // (Jumps while a keep-playing choice is open are fine: its timer ends the loop.)
                if (this.state !== 'choosing') {
                    if (this._loopJumps[m.id]) {
                        this._stopLoop(m);
                        return true;
                    }
                    this._loopJumps[m.id] = true;
                }
                this._emit('jump', { marker: m, to: m.targetTime });
                this._jumpTo(m.targetTime);
                return true;
            }
            if (m.type === 'end') {
                this._finish(m.id, m.ending);
                return true;
            }
        }
        return false;
    };

    P._jumpTo = function (t) {
        var self = this;
        t = clamp(t, 0, this.duration);
        // Backstop against pathological jump storms (the precise check is in _checkMarkers)
        var now = Date.now();
        this._jumpTimes = (this._jumpTimes || []).filter(function (x) { return now - x < 3000; });
        this._jumpTimes.push(now);
        if (this._jumpTimes.length > 60) {
            this._stopLoop(null);
            return;
        }
        // Choices at the landing point show (e.g. a "hub" choice right at a chapter marker);
        // markers at the landing point do not fire, so a jump can never re-trigger itself.
        // This is exactly the rule the compiler's story check uses.
        this.choicePoints.forEach(function (p) { self.completed[p.id] = p.time < t - 0.001; });
        this.markers.forEach(function (m) { self.completed['marker:' + m.id] = m.time <= t + 0.001; });
        this._preparedPointId = null;
        if (this.state === 'choosing') this._closeChoice();
        this.currentPoint = null;
        // Jumps only come from the story flow (markers during playback, chosen options), so
        // the movie always keeps playing after one.
        this._loadAt(t, true);
    };

    P._stopLoop = function (marker) {
        this._jumpTimes = [];
        this._resetLoopGuard();
        this._cancelInteraction();
        this.mains[this.active].pause();
        this._setState('paused');
        this._showMessage('This movie keeps jumping in a loop with no choice to get out, so playback was stopped.');
        this._emit('loop-stopped', { marker: marker });
    };

    P._resetLoopGuard = function () {
        this._loopJumps = {};
    };

    // ------------------------------------------------------------------ Choices

    P._nextPendingPoint = function () {
        for (var i = 0; i < this.choicePoints.length; i++) {
            if (!this.completed[this.choicePoints[i].id]) return this.choicePoints[i];
        }
        return null;
    };

    P._checkChoices = function (t) {
        var point = this._nextPendingPoint();
        if (point && point.time <= t + 0.001) {
            this._openChoice(point);
            return true;
        }
        return false;
    };

    // Build the cards a few seconds early so the preview clips are already buffering
    P._prepareUpcoming = function (t) {
        var point = this._nextPendingPoint();
        if (!point || this._preparedPointId === point.id) return;
        if (point.time - t <= 4) {
            this._renderChoice(point);
            this._preparedPointId = point.id;
        }
    };

    P._optionAvailable = function (option) {
        if (!option.requires) return true;
        return Boolean(this.flags[option.requires.flag]) === (option.requires.is !== false);
    };

    P._openChoice = function (point) {
        var self = this;
        this._resetLoopGuard();
        this.completed[point.id] = true;
        this.currentPoint = point;
        this.resumeAt = this.currentTime();
        if (this._preparedPointId !== point.id) this._renderChoice(point);
        this._preparedPointId = null;

        var visible = point.options.filter(function (o) { return self._optionAvailable(o) || o.whenLocked === 'lock'; });
        if (!visible.length) {
            // Every option is hidden by its condition: skip the choice entirely
            this.currentPoint = null;
            this._emit('choice-skipped', { point: point });
            return;
        }

        if (point.mode !== 'play') this.mains[this.active].pause();
        this._setState('choosing');
        this._updateTime(this.resumeAt);
        this.overlay.hidden = false;
        this.overlay.classList.toggle('ip-choice-live', point.mode === 'play');
        requestAnimationFrame(function () { self.overlay.classList.add('ip-visible'); });
        if (point.timeout > 0) this._startTimer(point);
        if (window.matchMedia && window.matchMedia('(hover: none)').matches) {
            // No hover on touch screens: play every preview
            Array.prototype.forEach.call(this.cardsEl.querySelectorAll('.ip-card'), function (card) {
                self._previewStart(card);
            });
        }
        this._emit('choice-shown', { point: point, time: this.resumeAt });
    };

    P._renderChoice = function (point) {
        var self = this;
        this._stopAllPreviews();
        this.cardsEl.textContent = '';
        this.promptEl.textContent = point.prompt || 'What happens next?';
        var count = point.options.length;
        this.cardsEl.setAttribute('data-cols', String(count <= 4 ? count : 3));
        var number = 0;
        point.options.forEach(function (option) {
            var available = self._optionAvailable(option);
            if (!available && option.whenLocked !== 'lock') return; // hidden until its flag is set
            number += 1;
            var card = button('ip-card', self.cardsEl, option.label || ('Option ' + number));
            card.setAttribute('data-option-id', option.id);
            var media = el('div', 'ip-card-media', card);
            var clip = option.clip;
            if (clip && clip.poster) {
                var img = el('img', 'ip-card-poster', media);
                img.alt = '';
                img.draggable = false;
                img.src = clip.poster;
            } else {
                media.classList.add('ip-no-poster');
            }
            if (clip) {
                var preview = document.createElement('video');
                preview.className = 'ip-card-video';
                preview.muted = true;
                preview.defaultMuted = true;
                preview.loop = true;
                preview.playsInline = true;
                preview.setAttribute('playsinline', '');
                preview.setAttribute('muted', '');
                preview.preload = clip.poster ? 'auto' : 'metadata';
                preview.src = clip.src;
                media.appendChild(preview);
                el('span', 'ip-card-pill', media).textContent = 'Preview';
                if (clip.duration) el('span', 'ip-card-duration', media).textContent = formatTime(clip.duration);
            } else {
                var icon = el('span', 'ip-card-icon', media);
                icon.innerHTML = option.then.type === 'jump' ? ICONS.jump : ICONS.end;
            }
            el('span', 'ip-card-key', media).textContent = String(number);
            var label = el('span', 'ip-card-label', card);
            label.textContent = option.label || ('Option ' + number);
            if (option.color && option.color.toLowerCase() !== '#ffffff') label.style.color = option.color;
            if (!available) {
                card.classList.add('ip-locked');
                card.disabled = true;
                el('span', 'ip-card-lock', media).innerHTML = ICONS.lock;
            } else {
                card.addEventListener('mouseenter', function () { self._previewStart(card); });
                card.addEventListener('focus', function () { self._previewStart(card); });
                card.addEventListener('mouseleave', function () { self._previewStop(card); });
                card.addEventListener('blur', function () { self._previewStop(card); });
                card.addEventListener('click', function (event) {
                    event.stopPropagation();
                    self.choose(option.id);
                });
            }
        });
        this.skipBtn.hidden = point.allowSkip === false;
        this.timerEl.hidden = !(point.timeout > 0);
        this.timerFill.style.transform = 'scaleX(1)';
    };

    P._previewStart = function (card) {
        if (this.state !== 'choosing') return;
        var video = card.querySelector('.ip-card-video');
        card.classList.add('ip-previewing');
        if (!video) return;
        try { if (video.currentTime > 0.05 && video.paused) video.currentTime = 0; } catch (e) { /* ignore */ }
        var promise = video.play();
        if (promise && typeof promise.catch === 'function') promise.catch(function () {});
        this._emit('preview', { optionId: card.getAttribute('data-option-id') });
    };

    P._previewStop = function (card) {
        var video = card.querySelector('.ip-card-video');
        card.classList.remove('ip-previewing');
        if (!video) return;
        video.pause();
        try { video.currentTime = 0; } catch (e) { /* ignore */ }
    };

    P._stopAllPreviews = function () {
        var self = this;
        Array.prototype.forEach.call(this.cardsEl.querySelectorAll('.ip-card'), function (card) {
            self._previewStop(card);
        });
    };

    P._startTimer = function (point) {
        var self = this;
        var total = point.timeout * 1000;
        var started = performance.now();
        this._stopTimer();
        var step = function () {
            self._timerRaf = null;
            if (self.state !== 'choosing' || self.currentPoint !== point) return;
            var left = Math.max(0, total - (performance.now() - started));
            self.timerFill.style.transform = 'scaleX(' + (left / total) + ')';
            if (left <= 0) {
                var available = point.options.filter(function (o) { return self._optionAvailable(o); });
                var def = point.defaultOptionId && available.filter(function (o) { return o.id === point.defaultOptionId; })[0];
                if (def) self.choose(def.id, 'timeout');
                else self.continueWatching('timeout');
                return;
            }
            self._timerRaf = requestAnimationFrame(step);
        };
        this._timerRaf = requestAnimationFrame(step);
    };

    P._stopTimer = function () {
        if (this._timerRaf) cancelAnimationFrame(this._timerRaf);
        this._timerRaf = null;
    };

    P._closeChoice = function () {
        this._stopTimer();
        this._stopAllPreviews();
        this.overlay.classList.remove('ip-visible');
        this.overlay.classList.remove('ip-choice-live');
        this.overlay.hidden = true;
    };

    P.choose = function (optionId, reason) {
        if (this.state !== 'choosing' || !this.currentPoint) return;
        var point = this.currentPoint;
        var option = point.options.filter(function (o) { return o.id === optionId; })[0];
        if (!option || !this._optionAvailable(option)) return;
        this._resetLoopGuard();
        this._closeChoice();
        var self = this;
        option.setFlags.forEach(function (flag) { self.flags[flag] = true; });
        this._emit('choice', { point: point, option: option, reason: reason || 'click' });
        this._saveSoon();
        var then = option.then || { type: 'continue' };
        if (option.clip) {
            this._playOption(option);
        } else if (then.type === 'jump' && then.targetTime !== null) {
            this.currentPoint = null;
            this._jumpTo(then.targetTime);
        } else if (then.type === 'end') {
            this._finish(option.id, then.ending);
        } else {
            this._resumeMain();
        }
    };

    P.continueWatching = function (reason) {
        if (this.state !== 'choosing') return;
        var point = this.currentPoint;
        this._closeChoice();
        this._emit('skip', { point: point, reason: reason || 'skip' });
        if (point.mode === 'play') {
            this.currentPoint = null;
            this._setState('playing');
            this._startLoop();
            return;
        }
        this._resumeMain();
    };

    P._playOption = function (option) {
        var self = this;
        var video = this.optionVideo;
        this.currentOption = option;
        this._optionCue = undefined;
        this._setState('option');
        this.badgeLabel.textContent = option.label || 'Your choice';
        this.badgeFill.style.transform = 'scaleX(0)';
        this.badge.hidden = false;
        this.root.classList.add('ip-option-playing');
        video.poster = option.clip.poster || '';
        if (this._srcOf(video) !== option.clip.src) {
            this._setSrc(video, option.clip.src);
        } else {
            try { video.currentTime = 0; } catch (e) { /* ignore */ }
        }
        video.classList.remove('ip-hidden');
        this._applyVolume();
        var promise = video.play();
        if (promise && typeof promise.catch === 'function') {
            promise.catch(function (err) {
                if (err && err.name === 'NotAllowedError' && self.state === 'option') {
                    video.muted = true;
                    video.play().catch(function () {});
                }
            });
        }
        this._startLoop();
    };

    P._optionEnded = function (skipped) {
        if (this.state !== 'option') return;
        var option = this.currentOption;
        var video = this.optionVideo;
        video.pause();
        video.classList.add('ip-hidden');
        this.badge.hidden = true;
        this.root.classList.remove('ip-option-playing');
        this.currentOption = null;
        this._optionCue = undefined;
        this.captionEl.hidden = true;
        this._emit('option-ended', { option: option, skipped: Boolean(skipped) });
        var then = option && option.then ? option.then : { type: 'continue' };
        if (then.type === 'jump' && then.targetTime !== null) {
            this.currentPoint = null;
            this._jumpTo(then.targetTime);
        } else if (then.type === 'end') {
            this._finish(option.id, then.ending);
        } else {
            this._resumeMain();
        }
    };

    // The main video was only paused, so it is still sitting on the exact frame where the
    // choice appeared: resuming is instant and continues from that point.
    P._resumeMain = function () {
        var t = this.resumeAt;
        this.currentPoint = null;
        this._emit('resume', { time: t });
        var seg = this.segments[this.segIndex];
        if (seg && t >= seg.start + seg.duration - 0.03) {
            this._setState('playing');
            if (this._checkMarkers(seg.start + seg.duration + 0.001)) return;
            if (this.segIndex >= this.segments.length - 1) {
                this._finish('__end__');
                return;
            }
            this._switchToSegment(this.segIndex + 1);
            return;
        }
        this._playMain();
    };

    P._cancelInteraction = function () {
        this._closeChoice();
        if (this.state === 'option') {
            this.optionVideo.pause();
            this.optionVideo.classList.add('ip-hidden');
            this.badge.hidden = true;
            this.root.classList.remove('ip-option-playing');
            this.currentOption = null;
        }
        this.currentPoint = null;
    };

    // ------------------------------------------------------------------ Public controls

    P.play = function () {
        if (!this.segments.length) return;
        this.startEl.hidden = true;
        if (this.state === 'choosing') return;
        if (this.state === 'option') {
            this.optionVideo.play().catch(function () {});
            this.root.classList.remove('ip-option-paused');
            return;
        }
        if (this.state === 'ended') {
            this.restart();
            return;
        }
        if (this.state === 'loading') {
            this._wantPlay = true;
            return;
        }
        this._playMain();
    };

    P.pause = function () {
        this._wantPlay = false;
        if (this.state === 'option') {
            this.optionVideo.pause();
            this.root.classList.add('ip-option-paused');
            return;
        }
        if (this.state === 'loading') {
            return;
        }
        if (this.state !== 'playing') return;
        this.mains[this.active].pause();
        this._setState('paused');
    };

    P.togglePlay = function () {
        if (this.state === 'option') {
            if (this.optionVideo.paused) this.play(); else this.pause();
            return;
        }
        if (this.state === 'playing' || (this.state === 'loading' && this._wantPlay)) this.pause();
        else this.play();
    };

    // force=true (used by the studio) also cancels an open choice / playing option
    P.seek = function (t, force) {
        if (!this.segments.length) return;
        if (!force && !this.settings.allowSeek) return;
        this._resetLoopGuard();
        if (this.state === 'choosing' || this.state === 'option') {
            if (!force) return;
            this._cancelInteraction();
            this._setState('paused');
        }
        var self = this;
        t = clamp(Number(t) || 0, 0, this.duration);
        // Choices and markers before the new position count as passed; later ones will show again
        this.choicePoints.forEach(function (p) { self.completed[p.id] = p.time < t - 0.001; });
        this.markers.forEach(function (m) { self.completed['marker:' + m.id] = m.time < t - 0.001; });
        this._preparedPointId = null;
        var wasPlaying = this.state === 'playing' || (this.state === 'loading' && this._wantPlay);
        if (this.state === 'ended') {
            this.endEl.hidden = true;
            this._setState('paused');
        }
        var index = this._segmentAt(t);
        var video = this.mains[this.active];
        var seg = this.segments[index];
        if (index === this.segIndex && this._srcOf(video) === seg.src && video.readyState >= 1 && this._pendingLocal === null) {
            try { video.currentTime = seg.mediaStart + clamp(t - seg.start, 0, Math.max(0, seg.duration - 0.001)); } catch (e) { /* ignore */ }
            this._updateTime(t);
            if (wasPlaying && this.state !== 'playing') this._playMain();
        } else {
            this._loadAt(t, wasPlaying);
        }
        this._emit('seek', { time: t });
        this._saveSoon();
    };

    P.restart = function () {
        this.completed = {};
        this.flags = {};
        this._resetLoopGuard();
        this._cancelInteraction();
        this.endEl.hidden = true;
        this.startEl.hidden = true;
        if (this.state === 'ended') this._setState('paused');
        this._clearSave();
        this._loadAt(0, true);
    };

    P.setVolume = function (value) {
        this.volume = clamp(Number(value) || 0, 0, 1);
        this.volumeInput.value = String(this.volume);
        this._applyVolume();
    };

    P.setMuted = function (muted) {
        this.muted = Boolean(muted);
        this.muteBtn.innerHTML = this.muted ? ICONS.muted : ICONS.volume;
        this.muteBtn.setAttribute('aria-label', this.muted ? 'Unmute' : 'Mute');
        this._applyVolume();
    };

    P.setCaptions = function (on) {
        this.captionsOn = Boolean(on);
        this.ccBtn.classList.toggle('ip-on', this.captionsOn);
        this._activeCue = undefined;
        this._optionCue = undefined;
        if (!this.captionsOn) this.captionEl.hidden = true;
        else this._updateTime();
    };

    P._applyVolume = function () {
        var self = this;
        this.mains.concat([this.optionVideo]).forEach(function (video) {
            video.volume = self.volume;
            video.muted = self.muted;
        });
    };

    P.toggleFullscreen = function () {
        var root = this.root;
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(function () {});
        } else if (root.requestFullscreen) {
            root.requestFullscreen().catch(function () {});
        } else if (root.webkitRequestFullscreen) {
            root.webkitRequestFullscreen();
        }
    };

    P.getSnapshot = function () {
        return {
            state: this.state,
            time: Math.round(this.currentTime() * 1000) / 1000,
            resumeAt: Math.round(this.resumeAt * 1000) / 1000,
            segment: this.segIndex,
            mainSrc: this._srcOf(this.mains[this.active]),
            optionSrc: this.state === 'option' ? this._srcOf(this.optionVideo) : null,
            choiceId: this.currentPoint ? this.currentPoint.id : null,
            flags: Object.assign({}, this.flags),
            ending: this.state === 'ended' ? this.endTitle.textContent : null
        };
    };

    P.destroy = function () {
        this._saveNow();
        if (this._raf) cancelAnimationFrame(this._raf);
        this._stopTimer();
        clearTimeout(this._idleTimer);
        clearTimeout(this._saveTimer);
        this._listeners.forEach(function (entry) { entry[0].removeEventListener(entry[1], entry[2]); });
        this._listeners = [];
        var self = this;
        this.mains.concat([this.optionVideo]).forEach(function (video) { self._clearSrc(video); });
        this._stopAllPreviews();
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
        if (this.container.__player === this) delete this.container.__player;
        this.state = 'destroyed';
    };

    // ------------------------------------------------------------------ Progress saving (exports)

    P.enableProgressSaving = function (key) {
        this._saveKey = key || null;
        this._savedState = null;
        if (!key || !this.settings.rememberProgress) return;
        try {
            var raw = global.localStorage && localStorage.getItem(key);
            if (raw) this._savedState = JSON.parse(raw);
        } catch (e) { /* ignore */ }
        if (this._savedState && typeof this._savedState.time === 'number' && this._savedState.time > 1 && this._savedState.time < this.duration - 1) {
            this.resumeBtn.hidden = false;
            this.resumeBtn.textContent = 'Resume from ' + formatTime(this._savedState.time);
        }
    };

    P._resumeSaved = function () {
        var saved = this._savedState;
        this.startEl.hidden = true;
        if (!saved) {
            this.play();
            return;
        }
        this.flags = saved.flags && typeof saved.flags === 'object' ? saved.flags : {};
        this.completed = {};
        this._resetLoopGuard();
        var self = this;
        (saved.completed || []).forEach(function (id) { self.completed[id] = true; });
        (saved.markers || []).forEach(function (id) { self.completed['marker:' + id] = true; });
        this._loadAt(clamp(saved.time, 0, this.duration), true);
        this._emit('resumed-save', { time: saved.time });
    };

    P._saveSoon = function () {
        var self = this;
        if (!this._saveKey || !this.settings.rememberProgress) return;
        this._saveDirty = true;
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(function () { self._saveNow(); }, 800);
    };

    P._saveNow = function () {
        if (!this._saveKey || !this.settings.rememberProgress || !this._saveDirty) return;
        this._saveDirty = false;
        if (this.state === 'ended' || this.state === 'empty') return;
        try {
            var completed = [];
            var markers = [];
            for (var key in this.completed) {
                if (!this.completed[key]) continue;
                if (key.indexOf('marker:') === 0) markers.push(key.slice(7));
                else completed.push(key);
            }
            localStorage.setItem(this._saveKey, JSON.stringify({
                time: Math.round(this.currentTime() * 100) / 100,
                flags: this.flags,
                completed: completed,
                markers: markers
            }));
        } catch (e) { /* ignore */ }
    };

    P._clearSave = function () {
        if (!this._saveKey) return;
        try { localStorage.removeItem(this._saveKey); } catch (e) { /* ignore */ }
        this._savedState = null;
        this.resumeBtn.hidden = true;
    };

    // ------------------------------------------------------------------ Chapters menu

    P._toggleChapterMenu = function () {
        if (this._chapterMenuOpen) this._closeChapterMenu();
        else {
            this.chapterMenu.hidden = false;
            this._chapterMenuOpen = true;
            var t = this.currentTime();
            var rows = this.chapterList.querySelectorAll('.ip-chapter-row');
            var chapters = this.markers.filter(function (m) { return m.type === 'chapter'; });
            chapters.forEach(function (m, i) {
                if (rows[i]) rows[i].classList.toggle('is-current', t >= m.time - 0.001 && (i === chapters.length - 1 || t < chapters[i + 1].time));
            });
        }
    };

    P._closeChapterMenu = function () {
        this.chapterMenu.hidden = true;
        this._chapterMenuOpen = false;
    };

    // ------------------------------------------------------------------ UI helpers

    P._setState = function (state) {
        if (this.state === state) return;
        var previous = this.state;
        this.state = state;
        var root = this.root;
        ['empty', 'loading', 'paused', 'playing', 'choosing', 'option', 'ended'].forEach(function (name) {
            root.classList.toggle('ip-state-' + name, name === state);
        });
        var showPause = state === 'playing' || state === 'option';
        this.playBtn.innerHTML = showPause ? ICONS.pause : ICONS.play;
        this.playBtn.setAttribute('aria-label', showPause ? 'Pause' : 'Play');
        if (state !== 'option') root.classList.remove('ip-option-paused');
        if (state === 'playing') this._wake();
        else root.classList.remove('ip-idle');
        this._emit('state', { state: state, previous: previous });
        this._saveSoon();
    };

    P._hideOverlays = function () {
        this.startEl.hidden = true;
        this.endEl.hidden = true;
        this.messageEl.hidden = true;
    };

    P._spin = function (on) {
        this.spinner.hidden = !on;
    };

    P._showMessage = function (text, duration) {
        var self = this;
        this.messageEl.textContent = text;
        this.messageEl.hidden = false;
        clearTimeout(this._messageTimer);
        if (duration) this._messageTimer = setTimeout(function () { self.messageEl.hidden = true; }, duration);
    };

    P._updateTime = function (t) {
        if (t === undefined) t = this.currentTime();
        var pct = this.duration ? clamp(t / this.duration, 0, 1) : 0;
        this.progressFill.style.transform = 'scaleX(' + pct + ')';
        this.timeEl.textContent = formatTime(t) + ' / ' + formatTime(this.duration);
        this.progress.setAttribute('aria-valuenow', String(Math.round(t)));
        this.progress.setAttribute('aria-valuemax', String(Math.round(this.duration)));
        this._updateChapter(t);
        this._updateOverlay(t);
        this._updateCaption(t);
        var now = Date.now();
        if (now - this._lastEmit > 66 || this.state !== 'playing') {
            this._lastEmit = now;
            this._emit('timeupdate', { time: t, duration: this.duration });
        }
    };

    P._updateChapter = function (t) {
        var current = null;
        if (this.settings.showChapters) {
            for (var i = 0; i < this.markers.length; i++) {
                var m = this.markers[i];
                if (m.type === 'chapter' && m.time <= t + 0.001) current = m;
                if (m.time > t) break;
            }
        }
        if (current === this._activeChapter) return;
        this._activeChapter = current;
        if (current) {
            this.chapterBadge.textContent = current.label;
            this.chapterBadge.hidden = false;
        } else {
            this.chapterBadge.hidden = true;
        }
    };

    P._updateOverlay = function (t) {
        var active = null;
        for (var i = 0; i < this.overlays.length; i++) {
            var o = this.overlays[i];
            if (t >= o.start && t < o.end) { active = o; break; }
            if (o.start > t) break;
        }
        if (active === this._activeOverlay) return;
        this._activeOverlay = active;
        if (active) {
            this.overlayEl.textContent = active.text;
            this.overlayEl.className = 'ip-title-card ip-pos-' + active.position;
            this.overlayEl.hidden = false;
        } else {
            this.overlayEl.hidden = true;
        }
    };

    P._updateCaption = function (t) {
        if (this.state === 'option') return; // option captions handled separately
        var active = null;
        if (this.captionsOn) {
            for (var i = 0; i < this.captions.length; i++) {
                var c = this.captions[i];
                if (t >= c.start && t < c.end) { active = c; break; }
                if (c.start > t) break;
            }
        }
        if (active === this._activeCue) return;
        this._activeCue = active;
        if (active) {
            this.captionEl.textContent = active.text;
            this.captionEl.hidden = false;
        } else {
            this.captionEl.hidden = true;
        }
    };

    P._updateOptionCaption = function () {
        var active = null;
        if (this.captionsOn && this.currentOption && this.currentOption.clip) {
            var t = this.optionVideo.currentTime;
            var cues = this.currentOption.clip.captions;
            for (var i = 0; i < cues.length; i++) {
                var c = cues[i];
                if (t >= c.start && t < c.end) { active = c; break; }
                if (c.start > t) break;
            }
        }
        if (active === this._optionCue) return;
        this._optionCue = active;
        if (active) {
            this.captionEl.textContent = active.text;
            this.captionEl.hidden = false;
        } else {
            this.captionEl.hidden = true;
        }
    };

    P._wake = function () {
        var root = this.root;
        var self = this;
        root.classList.remove('ip-idle');
        clearTimeout(this._idleTimer);
        if (this.state === 'playing') {
            this._idleTimer = setTimeout(function () {
                if (self.state === 'playing') root.classList.add('ip-idle');
            }, 2500);
        }
    };

    P._onKey = function (event) {
        var target = event.target;
        if (target && target !== this.root && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        var key = event.key;
        if (this.state === 'choosing') {
            var index = parseInt(key, 10);
            if (index >= 1 && index <= this.currentPoint.options.length) {
                event.preventDefault();
                this.choose(this.currentPoint.options[index - 1].id, 'keyboard');
            }
            return;
        }
        if (key === ' ' || key === 'k' || key === 'K') {
            if (target && target.tagName === 'BUTTON' && target !== this.root) return;
            event.preventDefault();
            this.togglePlay();
        } else if (key === 'ArrowRight' && this.state !== 'option' && this.settings.allowSeek) {
            event.preventDefault();
            this.seek(this.currentTime() + 5);
        } else if (key === 'ArrowLeft' && this.state !== 'option' && this.settings.allowSeek) {
            event.preventDefault();
            this.seek(this.currentTime() - 5);
        } else if (key === 'm' || key === 'M') {
            this.setMuted(!this.muted);
        } else if (key === 'c' || key === 'C') {
            if (!this.ccBtn.hidden) this.setCaptions(!this.captionsOn);
        } else if (key === 'f' || key === 'F') {
            this.toggleFullscreen();
        }
    };

    P._emit = function (type, detail) {
        if (!this.opts.onEvent) return;
        try {
            this.opts.onEvent(type, detail || {});
        } catch (err) {
            if (global.console) global.console.error(err);
        }
    };

    InteractivePlayer.formatTime = formatTime;
    global.InteractivePlayer = InteractivePlayer;
})(typeof window !== 'undefined' ? window : this);
