# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Video Infinity** is a local-first interactive movie maker for branching / choose-your-own-adventure videos (similar to Netflix's "Bandersnatch").

## Commands

```bash
npm install
npm start        # same as `node server.js` / `npm run start:v2`; serves http://localhost:3000
npm test         # API end-to-end test (test/timeline.test.js), no browser needed
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

### Timeline data model (`timelines.data` JSON)

```js
{
  version: 1,
  items: [{ id, clipId }],                       // main movie, played back to back
  choicePoints: [{ id, itemId, offset,            // anchored to a timeline item (moves with it)
                   prompt, timeout, allowSkip, defaultOptionId,
                   options: [{ id, label, clipId, color }] }]
}
```

### Player (`public/player/interactive-player.js` + `.css`)

Dependency-free `InteractivePlayer` used by both the studio preview (several clips, double-buffered) and exports (one stitched file). It pauses at choice points, plays muted hover previews in the option cards, plays the chosen clip in a separate layer and then resumes the paused main video from the same frame. Expose state for tests via `element.__player.getSnapshot()`.

### Frontends

- `public/studio/` — Timeline Studio (Vue 3 global build, in-DOM template in `index.html`, logic in `app.js`). `window.__studio` exposes the component for debugging/tests.
- `public/index.html` — classic tabbed studio (graph editor, events, logic, stats, publish).
- `public_new/` — earlier experimental UI, not served.
