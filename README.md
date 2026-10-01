# Video Infinity 🎬

> **Interactive Branching Video Studio & Narrative Gamebook Engine**

Video Infinity is a local-first interactive movie maker. Upload videos, cut them into clips, lay them out on a timeline, drop **choice points** on top of the movie and export **one playable interactive movie** — similar to Netflix's *Bandersnatch*.

---

## ✨ Timeline Studio (default editor)

Open `http://localhost:3000` after starting the server.

1. **Upload** videos (drag files onto the Media panel or click *Upload video*). MP4, MOV, WebM, MKV and AVI are accepted; formats browsers can't play (AVI, HEVC, ProRes, 10-bit…) are converted to H.264/AAC on import.
2. **Cut clips** with ✂ — set IN/OUT with the trim handles, the inputs or the `I` / `O` keys.
3. **Build the main movie** — press *+ Timeline* or drag clips onto the *Main movie* track. Drag blocks to reorder them.
4. **Add choices** — press `C`, double-click the *Choices* track or drag a clip onto it. Each option gets a label and a clip. Choice points are anchored to their clip, so they move with it when you reorder.
5. **Preview** in the built-in player. It is the same player the export uses:
   - the movie pauses when a choice appears,
   - hovering an option plays a muted preview of its clip,
   - clicking an option plays that clip,
   - when the clip ends, **the main movie resumes from the exact frame where it paused**.
6. **Export** — the main track is stitched into a single MP4 (normalized resolution, frame rate and audio, frame-accurate A/V sync), choice clips are encoded alongside it, and a self-contained player is written to `public/exports/<name>/`. Upload that folder to any static host or open `index.html` directly — no CDN needed.

Optional per choice: a question for viewers, a countdown timer (continue the movie or auto-play a default option when it runs out) and a *Continue watching* skip button. The timeline autosaves and supports undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`).

## 🧰 Classic tools

The original tabbed studio is still available at `http://localhost:3000/classic`:

- **Visual Story & Logic Editor**: node graph, variables (`set_var` / `req_var`), return-to-main loops, game-over endings.
- **Clipper**: trimming with filters (Black & White, Sepia, Vivid), speed and volume.
- **Event Creator**: event clips with end-of-clip choices.
- **Analytics**: choice counts — exports made in the Timeline Studio report choices here too.
- **Publish**: playlist-based standalone player with Smart Skip and save/resume.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | [Node.js](https://nodejs.org/) & [Express 5](https://expressjs.com/) |
| **Media Processing** | [Fluent-FFmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) with bundled static binaries |
| **Database** | [SQLite](https://sqlite.org/) (`sqlite3` / `sqlite`) with auto-migrations |
| **Frontend** | [Vue.js 3](https://vuejs.org/) (served locally from `node_modules`), Tailwind CSS (classic tools) |
| **Player** | Dependency-free JavaScript (`public/player/`) shared by the studio and exports |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer
- FFmpeg is bundled via `ffmpeg-static`

### Installation

```bash
git clone https://github.com/instafire/VideoInfinity.git
cd VideoInfinity
npm install
npm start
```

Then open `http://localhost:3000`.

`npm start`, `node server.js` and `npm run start:v2` all start the same server. Set `PORT` to use another port and `DB_FILE` to use another SQLite file.

### Tests

```bash
npm test          # API end-to-end test: upload -> cut -> timeline -> render -> verify export
npm run test:e2e  # legacy Playwright UI test (requires @playwright/test)
```

---

## 📁 Repository Structure

```text
VideoInfinity/
├── server_new.js          # Express server: REST API, FFmpeg processing, publish/render engines
├── server.js              # Entry point (loads server_new.js)
├── public/
│   ├── studio/            # Timeline Studio (index.html, app.js, styles.css)
│   ├── player/            # Interactive player shared by the studio preview and exports
│   └── index.html         # Classic studio (served at /classic)
├── public_new/            # Earlier experimental v2 UI (not served)
├── test/timeline.test.js  # API end-to-end test
├── docs/                  # Design specifications and architecture notes
└── package.json
```

---

## 🔌 API Endpoints Summary

**Timeline Studio**

- `GET /api/timeline?projectId=` — load the project's timeline
- `POST /api/timeline` — save `{ projectId, timeline: { items, choicePoints } }`
- `POST /api/timeline/render` — start an export `{ projectId, title, resolution }` → `{ job }`
- `GET /api/render_jobs/:id` — export progress (`queued` → `rendering` → `done` with `url`)

**Media & projects**

- `GET /api/projects`, `POST /api/projects` — list / create projects
- `POST /api/upload` — upload video, audio or image (returns `videoId` and `clipId` for videos)
- `GET /api/videos` — uploaded source videos
- `POST /api/clip` — cut a clip `{ projectId, sourceId, start, end, name }`
- `POST /api/clip/update` — rename / update clip metadata (only the fields sent are changed)
- `POST /api/delete_clip`, `POST /api/delete_video`

**Classic tools**

- `GET /api/story`, `POST /api/save_logic_block`, `POST /api/create_event_clip`
- `POST /api/publish` — playlist-based standalone player
- `GET /api/analytics/:projectId`, `POST /api/analytics/track`

---

## 🔒 Privacy & Local-First Philosophy

- All video processing, clipping, rendering and database operations happen on your machine.
- The Timeline Studio and its exports load no third-party scripts.
- Media directories (`videos/`, `clips/`, `thumbnails/`, `exports/`) and local databases are excluded from version control.

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
