# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**VideoStudio (v20.12 Optimized)** is an interactive video studio application for creating branching/choose-your-own-adventure style videos (similar to Netflix's "Bandersnatch"). This is a merged and optimized version combining features from both the original and legacy versions.

## Commands

```bash
# Install dependencies
npm install

# Start the development server
node server.js
```

The server runs on port 3000 by default.

## Features

- **Project Management**: Create and manage multiple interactive video projects with custom themes
- **Video Import**: Upload video files (mp4, avi, mov, mkv, webm) and audio files (mp3, wav, ogg, m4a, aac)
- **Clip Editor**: Create clips from source videos with filters (bw, sepia, vivid), speed adjustments, and volume control
- **Event Creator**: Create interactive event clips with multiple choice options at any point
- **Logic Editor**: Visual graph-based story editor with:
  - Timeline-based choice triggers
  - Variable system (set_var, req_var)
  - Return-to-main logic for loops
  - Background music per clip
  - Mute audio option
- **Smart Skip**: Automatically skip watched scenes in published builds
- **Game Over Endings**: Mark clips as game-over endpoints
- **Multi-select**: Bulk delete clips in library
- **Analytics**: Track viewer choices and preferences
- **Publish**: Generate standalone HTML interactive video players

## Architecture

### Backend (server.js)

The Express server handles:
- **Database**: SQLite with tables for `projects`, `videos`, `clips`, `edges` (story connections), and `analytics`
- **API Endpoints**:
  - `/api/projects` - Project CRUD operations
  - `/api/upload` - Video/audio file uploads via Multer (2GB limit, validated file types)
  - `/api/clip` - Create clips from source videos using FFmpeg
  - `/api/create_event_clip` - Create interactive event clips
  - `/api/story` - Retrieve clips and edges for story graph
  - `/api/save_logic_block` - Save branching logic/choices
  - `/api/publish` - Generate standalone interactive video HTML
  - `/api/analytics/track` - Track viewer choices
  - `/api/delete_clips_bulk` - Bulk delete clips
  - `/api/clip/positions` - Save graph node positions

### Frontend (public/)

Single-page Vue 3 application loaded via CDN with views:
- **projects** - Project management and theme selection
- **upload** - Video/audio file upload
- **clipper** - Video trimming and segment creation with filters
- **library** - Clip management with multi-select and bulk delete
- **eventCreator** - Interactive event/choice creation
- **logic** - Branching story graph editor with visual connections
- **stats** - View analytics data
- **publish** - Export and publish standalone player with preview

### Published Builds

The `/api/publish` endpoint generates self-contained HTML files with:
- Clips and logic embedded as base64
- Smart skip (auto-skip watched scenes)
- Game over endings
- Volume control
- Timeline markers
- Save/resume functionality via localStorage

## Key Technologies

- **Express.js** - Web server framework
- **Vue.js 3** - Frontend SPA framework (CDN)
- **FFmpeg/fluent-ffmpeg** - Video processing (clipping, trimming, filters)
- **SQLite** - Local database storage
- **Tailwind CSS** - Styling (CDN)
