# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Video Infinity** is a local-first interactive movie maker for branching / choose-your-own-adventure videos (similar to Netflix's "Bandersnatch").

## Commands

```bash
npm install
npm start        # same as `node server.js` / `npm run start:v2`; serves http://localhost:3000
npm test         # compiler unit tests + API end-to-end test, no browser needed
```

Environment variables: `PORT` (default 3000), `DB_FILE` (default `./database.sqlite`).

## Architecture

### Server (`server_new.js`; `server.js` just requires it)

- Express 5 + SQLite (`projects`, `videos`, `clips`, `edges`, `analytics`, `achievements`, `scene_presets`, `timelines`).
- Routes: `/` → Timeline Studio (`public/studio/index.html`), `/classic` → classic studio (`public/index.html`), `/vendor/vue` → Vue from `node_modules`.
- Rate limiting applies to `/api` only (static media/range requests are not limited).
- Uploads: type decided by extension, content verified by header sniffing (`sniffMediaContainer`), non-browser-playable video converted to H.264/AAC MP4. Each uploaded video also gets a `FULL: <name>` clip row.
- `/api/clip` cuts clips (IN/OUT validated against the source duration).
- Timeline Studio API: `GET/POST /api/timeline` (sanitized with `sanitizeTimeline`), `POST /api/timeline/render` (background job queue, one render at a time) and `GET /api/render_jobs/:id`.
- Rendering (`runTimelineRender`): main track stitched into one MP4 via a concat filter graph (scale/pad to one size, 30 fps, 48 kHz stereo, frame-quantized durations, silent audio for clips without audio). Option clips are encoded with the same settings. Output in `public/exports/<name>/` = `index.html` (player inlined, no CDN) + `movie.json` + `media/`.
- Classic `/api/publish` still generates the playlist-based Vue player.

### Timeline data model (`timelines.data` JSON, v2)

Defined in `public/player/movie-compiler.js` (UMD: loaded by the studio, `require`d by the
server and the tests). `upgradeTimeline` migrates v1 data, `sanitizeTimeline` validates client
input, `compileMovie` produces the player's movie + the story-check `issues`.

```js
{
  version: 2,
  settings: { allowSeek, showChapters, rememberProgress },
  items: [{ id, clipId, in, out }],               // main movie; in/out trim the clip (out null = clip end)
  choicePoints: [{ id, itemId, at, prompt, timeout, mode: 'pause'|'play', allowSkip, defaultOptionId,
                   options: [{ id, label, clipId|null, color,
                               then: { type: 'continue'|'jump'|'end', targetId, ending },
                               setFlags: [], requires: { flag, is }|null, whenLocked: 'hide'|'lock' }] }],
  markers: [{ id, itemId, at, type: 'chapter'|'jump'|'end', label, targetId, condition, ending }],
  overlays: [{ id, itemId, at, duration, text, position }]
}
```

`at` is media time inside the item's clip, so anchors stay on their frame when the clip is
trimmed and move with the clip when clips are reordered. Jumps land with choices at the target
active and markers at the target inactive; the player and the story check use the same rule.
Captions live in the `captions` table (one SRT/VTT file per clip, parsed by `parseCaptions`).

### Player (`public/player/interactive-player.js` + `.css`)

Dependency-free `InteractivePlayer` used by both the studio preview (several clips, double-buffered, segments can start at `mediaStart` for trims) and exports (one stitched file). It pauses at choice points, plays muted hover previews in the option cards, plays the chosen clip in a separate layer and then resumes the paused main video from the same frame, or follows the option's jump/end action. It also handles markers, flags, locked options, titles, captions, the chapters menu, endings and progress saving (`enableProgressSaving(key)`, exports only). If the same jump marker fires twice with no choice in between it stops playback (flags only change at choices, so that loop would never end). Expose state for tests via `element.__player.getSnapshot()`.

### Frontends

- `public/studio/` — Timeline Studio (Vue 3 global build, in-DOM template in `index.html`, logic in `app.js`). `window.__studio` exposes the component for debugging/tests.
- `public/index.html` — classic tabbed studio (graph editor, events, logic, stats, publish).
- `public_new/` — earlier experimental UI, not served.
