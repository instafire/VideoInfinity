// Video Infinity entry point.
//
// This file used to contain an older copy of the studio server (v20.7). `server_new.js` is a
// superset of it (same database schema and endpoints, plus input validation, presets,
// achievements, analytics, diagnostics and the Timeline Studio APIs), so every way of
// starting the app - `npm start`, `node server.js`, `npm run start:v2` - now runs the same
// server. The previous implementation is available in the git history.
//
//   /         -> Timeline Studio (upload, cut, timeline, choices, export)
//   /classic  -> the original tabbed studio (graph editor, variables, analytics)
require('./server_new.js');
