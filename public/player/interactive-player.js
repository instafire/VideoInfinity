/*!
 * Video Infinity - Interactive Player
 *
 * Shared by the Timeline Studio preview and every exported movie, so what you preview is
 * exactly what viewers get.
 *
 *  - Plays a main movie: one stitched file (exports) or several clips back-to-back
 *    (studio preview, double-buffered so clip changes are near seamless).
 *  - Pauses at choice points and shows the options on top of the video.
 *  - Hovering (or focusing) an option plays a muted preview of its clip.
 *  - Clicking an option plays that clip; when it ends the main movie resumes from the
 *    exact frame where it paused.
 *
 * Usage:
 *   new InteractivePlayer(element, {
 *     title, poster, theme, startScreen,
 *     segments: [{ src, duration }],
 *     choicePoints: [{ id, time, prompt, timeout, allowSkip, defaultOptionId,
 *                      options: [{ id, label, color, src, poster, duration }] }],
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
        back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7l-5 5 5 5M5.5 12H15a4 4 0 0 1 0 8h-2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
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
        this.duration = 0;
        this.active = 0;
        this.segIndex = 0;
        this.completed = {};
        this.currentPoint = null;
        this.currentOption = null;
        this.resumeAt = 0;
        this.volume = 1;
        this.muted = false;
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
        el('div', 'ip-start-hint', startBody).textContent = 'An interactive movie \u2014 you choose what happens';

        var end = this.endEl = el('div', 'ip-end', stage);
        end.hidden = true;
        el('div', 'ip-end-title', end).textContent = 'The End';
        this.replayBtn = button('ip-end-replay', end, 'Watch again', ICONS.replay);
        el('span', '', this.replayBtn).textContent = 'Watch again';

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
        this.muteBtn = button('ip-btn ip-mute', controls, 'Mute', ICONS.volume);
        this.volumeInput = el('input', 'ip-volume', controls);
        this.volumeInput.type = 'range';
        this.volumeInput.min = '0';
        this.volumeInput.max = '1';
        this.volumeInput.step = '0.05';
        this.volumeInput.value = '1';
        this.volumeInput.setAttribute('aria-label', 'Volume');
        this.fsBtn = button('ip-btn ip-fullscreen', controls, 'Fullscreen', ICONS.fullscreen);

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
        this.replayBtn.addEventListener('click', function () { self.restart(); });
        this.skipBtn.addEventListener('click', function () { self.continueWatching(); });
        this.returnBtn.addEventListener('click', function () { self._optionEnded(true); });
        this.muteBtn.addEventListener('click', function () { self.setMuted(!self.muted); });
        this.volumeInput.addEventListener('input', function () {
            self.setVolume(Number(self.volumeInput.value));
            if (self.muted && self.volume > 0) self.setMuted(false);
        });
        this.fsBtn.addEventListener('click', function () { self.toggleFullscreen(); });

        var seekFromEvent = function (event) {
            var rect = self.progressTrack.getBoundingClientRect();
            var pct = rect.width ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0;
            return pct * self.duration;
        };
        progress.addEventListener('click', function (event) {
            if (!self.duration) return;
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
                var seg = { src: String(s.src), duration: Number(s.duration), start: cursor, id: s.id || null, label: s.label || '' };
                cursor += seg.duration;
                return seg;
            });
        var signature = segments.map(function (s) { return s.src + '|' + s.duration.toFixed(3); }).join(';');
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
        this.startTitle.textContent = this.opts.title || 'Interactive movie';
        this.startPoster.style.backgroundImage = this.opts.poster ? 'url("' + String(this.opts.poster).replace(/"/g, '%22') + '")' : '';

        this.choicePoints = (Array.isArray(data.choicePoints) ? data.choicePoints : [])
            .map(function (p) {
                var options = (Array.isArray(p.options) ? p.options : []).filter(function (o) { return o && o.src; });
                return {
                    id: String(p.id),
                    time: clamp(Number(p.time) || 0, 0, self.duration),
                    prompt: p.prompt || '',
                    timeout: Math.max(0, Number(p.timeout) || 0),
                    allowSkip: p.allowSkip !== false,
                    defaultOptionId: p.defaultOptionId || null,
                    options: options
                };
            })
            .filter(function (p) { return p.options.length > 0; })
            .sort(function (a, b) { return a.time - b.time; });

        this._preparedPointId = null;
        if (this.state === 'choosing' && this.currentPoint) {
            var stillThere = this.choicePoints.some(function (p) { return p.id === self.currentPoint.id; });
            if (!stillThere) {
                this._closeChoice();
                this.currentPoint = null;
                this._setState('paused');
            }
        }
        this._renderMarkers();

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
            var marker = el('div', 'ip-marker', self.markersEl);
            marker.style.left = (point.time / self.duration * 100) + '%';
            marker.title = (point.prompt || 'Choice') + ' \u2014 ' + formatTime(point.time);
        });
    };

    // ------------------------------------------------------------------ Main playback

    P.currentTime = function () {
        var seg = this.segments[this.segIndex];
        if (!seg) return 0;
        var video = this.mains[this.active];
        var local = this._pendingLocal !== null ? this._pendingLocal : (video ? video.currentTime : 0);
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
                if (Math.abs(video.currentTime - local) > 0.03) video.currentTime = local;
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
        } else if (standby.readyState >= 1 && standby.currentTime > 0.05) {
            try { standby.currentTime = 0; } catch (e) { /* ignore */ }
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
            try { video.currentTime = 0; } catch (e) { /* ignore */ }
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
            if (self.state === 'playing' || self.state === 'option') self._raf = requestAnimationFrame(tick);
        };
        this._raf = requestAnimationFrame(tick);
    };

    P._tick = function () {
        if (this.state === 'playing') {
            var seg = this.segments[this.segIndex];
            if (!seg || this._pendingLocal !== null) return;
            var video = this.mains[this.active];
            var t = this.currentTime();
            this._prepareUpcoming(t);
            if (this._checkChoices(t)) return;
            if (video.ended || video.currentTime >= seg.duration - 0.02) {
                this._onSegmentEnd();
                return;
            }
            this._updateTime(t);
        } else if (this.state === 'option') {
            var ov = this.optionVideo;
            var dur = ov.duration || (this.currentOption && this.currentOption.duration) || 0;
            this.badgeFill.style.transform = 'scaleX(' + (dur ? clamp(ov.currentTime / dur, 0, 1) : 0) + ')';
        }
    };

    P._onSegmentEnd = function () {
        if (this.state !== 'playing') return;
        var seg = this.segments[this.segIndex];
        if (!seg) return;
        // A choice placed at the very end of a clip fires before moving on
        if (this._checkChoices(seg.start + seg.duration + 0.001)) return;
        if (this.segIndex >= this.segments.length - 1) {
            this._finish();
            return;
        }
        this._switchToSegment(this.segIndex + 1);
    };

    P._finish = function () {
        this.mains[this.active].pause();
        this._setState('ended');
        this.endEl.hidden = false;
        this._updateTime(this.duration);
        this._emit('ended', {});
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

    P._openChoice = function (point) {
        var self = this;
        var video = this.mains[this.active];
        video.pause();
        this.completed[point.id] = true;
        this.currentPoint = point;
        this.resumeAt = this.currentTime();
        if (this._preparedPointId !== point.id) this._renderChoice(point);
        this._preparedPointId = null;
        this._setState('choosing');
        this._updateTime(this.resumeAt);
        this.overlay.hidden = false;
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
        point.options.forEach(function (option, index) {
            var card = button('ip-card', self.cardsEl, option.label || ('Option ' + (index + 1)));
            card.setAttribute('data-option-id', option.id);
            var media = el('div', 'ip-card-media', card);
            if (option.poster) {
                var img = el('img', 'ip-card-poster', media);
                img.alt = '';
                img.draggable = false;
                img.src = option.poster;
            } else {
                media.classList.add('ip-no-poster');
            }
            var preview = document.createElement('video');
            preview.className = 'ip-card-video';
            preview.muted = true;
            preview.defaultMuted = true;
            preview.loop = true;
            preview.playsInline = true;
            preview.setAttribute('playsinline', '');
            preview.setAttribute('muted', '');
            preview.preload = option.poster ? 'auto' : 'metadata';
            preview.src = option.src;
            media.appendChild(preview);
            el('span', 'ip-card-pill', media).textContent = 'Preview';
            el('span', 'ip-card-key', media).textContent = String(index + 1);
            if (option.duration) el('span', 'ip-card-duration', media).textContent = formatTime(option.duration);
            var label = el('span', 'ip-card-label', card);
            label.textContent = option.label || ('Option ' + (index + 1));
            if (option.color && option.color.toLowerCase() !== '#ffffff') label.style.color = option.color;

            card.addEventListener('mouseenter', function () { self._previewStart(card); });
            card.addEventListener('focus', function () { self._previewStart(card); });
            card.addEventListener('mouseleave', function () { self._previewStop(card); });
            card.addEventListener('blur', function () { self._previewStop(card); });
            card.addEventListener('click', function (event) {
                event.stopPropagation();
                self.choose(option.id);
            });
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
                var hasDefault = point.defaultOptionId && point.options.some(function (o) { return o.id === point.defaultOptionId; });
                if (hasDefault) self.choose(point.defaultOptionId, 'timeout');
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
        this.overlay.hidden = true;
    };

    P.choose = function (optionId, reason) {
        if (this.state !== 'choosing' || !this.currentPoint) return;
        var point = this.currentPoint;
        var option = point.options.filter(function (o) { return o.id === optionId; })[0];
        if (!option) return;
        this._closeChoice();
        this._emit('choice', { point: point, option: option, reason: reason || 'click' });
        this._playOption(option);
    };

    P.continueWatching = function (reason) {
        if (this.state !== 'choosing') return;
        var point = this.currentPoint;
        this._closeChoice();
        this._emit('skip', { point: point, reason: reason || 'skip' });
        this._resumeMain();
    };

    P._playOption = function (option) {
        var self = this;
        var video = this.optionVideo;
        this.currentOption = option;
        this._setState('option');
        this.badgeLabel.textContent = option.label || 'Your choice';
        this.badgeFill.style.transform = 'scaleX(0)';
        this.badge.hidden = false;
        this.root.classList.add('ip-option-playing');
        video.poster = option.poster || '';
        if (this._srcOf(video) !== option.src) {
            this._setSrc(video, option.src);
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
        this._emit('option-ended', { option: option, skipped: Boolean(skipped) });
        this._resumeMain();
    };

    // The main video was only paused, so it is still sitting on the exact frame where the
    // choice appeared: resuming is instant and continues from that point.
    P._resumeMain = function () {
        var t = this.resumeAt;
        this.currentPoint = null;
        this._emit('resume', { time: t });
        var seg = this.segments[this.segIndex];
        if (seg && t >= seg.start + seg.duration - 0.03) {
            if (this.segIndex >= this.segments.length - 1) {
                this._finish();
                return;
            }
            this._setState('playing');
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
            this._wantPlay = false;
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
        if (this.state === 'choosing' || this.state === 'option') {
            if (!force) return;
            this._cancelInteraction();
            this._setState('paused');
        }
        var self = this;
        t = clamp(Number(t) || 0, 0, this.duration);
        // Choices before the new position count as passed; later ones will show again
        this.choicePoints.forEach(function (p) { self.completed[p.id] = p.time < t - 0.001; });
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
            try { video.currentTime = clamp(t - seg.start, 0, Math.max(0, seg.duration - 0.001)); } catch (e) { /* ignore */ }
            this._updateTime(t);
            if (wasPlaying && this.state !== 'playing') this._playMain();
        } else {
            this._loadAt(t, wasPlaying);
        }
        this._emit('seek', { time: t });
    };

    P.restart = function () {
        this.completed = {};
        this._cancelInteraction();
        this.endEl.hidden = true;
        this.startEl.hidden = true;
        if (this.state === 'ended') this._setState('paused');
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
            choiceId: this.currentPoint ? this.currentPoint.id : null
        };
    };

    P.destroy = function () {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._stopTimer();
        clearTimeout(this._idleTimer);
        this._listeners.forEach(function (entry) { entry[0].removeEventListener(entry[1], entry[2]); });
        this._listeners = [];
        var self = this;
        this.mains.concat([this.optionVideo]).forEach(function (video) { self._clearSrc(video); });
        this._stopAllPreviews();
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
        if (this.container.__player === this) delete this.container.__player;
        this.state = 'destroyed';
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
        var now = Date.now();
        if (now - this._lastEmit > 66 || this.state !== 'playing') {
            this._lastEmit = now;
            this._emit('timeupdate', { time: t, duration: this.duration });
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
        } else if (key === 'ArrowRight' && this.state !== 'option') {
            event.preventDefault();
            this.seek(this.currentTime() + 5);
        } else if (key === 'ArrowLeft' && this.state !== 'option') {
            event.preventDefault();
            this.seek(this.currentTime() - 5);
        } else if (key === 'm' || key === 'M') {
            this.setMuted(!this.muted);
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
