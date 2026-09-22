# Video Infinity 🎬

> **Interactive Branching Video Studio & Narrative Gamebook Engine**

Video Infinity is a full-featured, local-first interactive video creator and branching narrative editor. It empowers filmmakers, game developers, educators, and content creators to craft "Choose Your Own Adventure" style interactive movies (similar to Netflix's *Bandersnatch*) with visual logic graphs, timeline clipping, timed decision points, variable-based branching, and one-click standalone HTML player generation.

---

## ✨ Features

- **Visual Story & Logic Editor**:
  - Drag-and-drop node graph canvas for connecting scenes and story branches.
  - Interactive choice buttons with customizable screen positioning, colors, and countdown timers.
  - Variable tracking system (`set_var` / `req_var`) for unlocking conditional narrative pathways.
  - Return-to-main logic loops for exploration and sub-quests.
  - Game-over ending states and fail-safe saves.

- **Timeline Video Trimmer & Clipper**:
  - Precision video trimming and clip extraction powered by FFmpeg.
  - Built-in video filters (Black & White, Sepia, Vivid).
  - Playback speed control (0.5x, 1x, 1.5x, 2x) with pitch-corrected audio.
  - Clip-level background music attachment and volume adjustments.

- **Event & Decision Creator**:
  - Create interactive overlay choices triggered at exact timestamps.
  - Support for multi-branch scenarios with fallback timeouts.
  - Live in-editor preview player for testing choices before export.

- **Choice Analytics & Heatmaps**:
  - Track audience decisions and preference trends.
  - Per-choice counters and route visualization.
  - Reset and export analytics data.

- **Standalone HTML Player Publishing**:
  - One-click build generator that bundles the entire interactive experience into a self-contained HTML runtime.
  - Smart Skip functionality: automatically skip previously watched scenes.
  - State persistence via `localStorage` (save & resume progress).
  - Ready for hosting on static servers, Netlify, Vercel, GitHub Pages, or S3.

- **Dual Architecture (Classic & Modular Timeline)**:
  - **Classic Studio (`server.js`)**: Single-page Vue 3 interactive graph editor.
  - **Timeline Studio (`server_new.js` / `public_new`)**: CapCut-style timeline-first authoring workflow with modular Vue components.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | [Node.js](https://nodejs.org/) & [Express 5](https://expressjs.com/) |
| **Media Processing** | [Fluent-FFmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) with bundled static binaries |
| **Database** | [SQLite](https://sqlite.org/) (`sqlite3` / `sqlite`) with auto-migrations |
| **Frontend** | [Vue.js 3](https://vuejs.org/) (SPA) & [Tailwind CSS](https://tailwindcss.com/) |
| **Storage** | Local-first file storage and zero-cloud dependency |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [FFmpeg](https://ffmpeg.org/) (optional if using bundled `ffmpeg-static`)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/instafire/VideoInfinity.git
   cd VideoInfinity
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the studio server:**
   ```bash
   npm start
   ```

   To start the v2 modular timeline studio:
   ```bash
   npm run start:v2
   ```

4. **Launch the application:**
   Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```

---

## 📁 Repository Structure

```text
VideoInfinity/
├── server.js              # Express application server and REST API
├── server_new.js          # Enhanced v2 modular studio server
├── public/                # Classic studio frontend
│   └── index.html         # Vue 3 studio interface
├── public_new/            # Modular timeline-first studio interface
│   ├── index.html         # Studio v2 shell
│   ├── app.js             # Runtime orchestrator
│   ├── js/                # Modular Vue 3 components and views
│   └── styles/            # UI styles
├── docs/                  # Design specifications and architecture notes
├── playwright.config.js   # End-to-end testing configuration
├── phase1-e2e.js          # Automated end-to-end test suite
├── package.json           # Project manifest and scripts
└── README.md              # Project documentation
```

---

## 🔌 API Endpoints Summary

- `GET /api/projects` - List all projects
- `POST /api/projects` - Create a new project
- `POST /api/upload` - Upload video or audio assets
- `GET /api/videos` - Retrieve uploaded source videos
- `POST /api/clip` - Extract clip segment with filters and timing
- `POST /api/create_event_clip` - Create decision-point event clip
- `GET /api/story` - Retrieve story graph nodes and connections
- `POST /api/save_logic_block` - Save choice connections and branch edges
- `POST /api/publish` - Generate standalone interactive video bundle
- `GET /api/analytics/:projectId` - Fetch viewer decision statistics

---

## 🔒 Privacy & Local-First Philosophy

Video Infinity is built with privacy as a fundamental priority:
- All video rendering, clipping, and database operations happen strictly on your local machine.
- No telemetry, analytics, or media files are sent to external servers or third-party cloud services.
- Media directories (`videos/`, `clips/`, `thumbnails/`, `exports/`) and local databases are excluded from version control by default.

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
