const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

// --- SECURITY UTILITIES ---

// FIX 1: HTML Escaping to prevent XSS
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const htmlEscapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;'
    };
    return str.replace(/[&<>"'\/]/g, char => htmlEscapes[char] || char);
}

// FIX 2: Path validation to prevent path traversal attacks
function safePath(baseDir, userPath) {
    const base = path.resolve(baseDir);
    const resolved = path.resolve(baseDir, userPath);
    if (!resolved.startsWith(base)) {
        return null; // Path traversal attempt detected
    }
    return resolved;
}

// FIX 3: File magic byte validation
const MAGIC_BYTES = {
    'video/mp4': [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // mp4
    'video/avi': [0x52, 0x49, 0x46, 0x46], // AVI
    'video/quicktime': [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70], // MOV
    'video/x-matroska': [0x1A, 0x45, 0xDF, 0xA3], // MKV
    'video/webm': [0x1A, 0x45, 0xDF, 0xA3], // WebM
    'audio/mpeg': [0x49, 0x44, 0x33], // MP3
    'audio/wav': [0x52, 0x49, 0x46, 0x46], // WAV (also RIFF)
    'audio/ogg': [0x4F, 0x67, 0x67, 0x53], // OGG
    'audio/mp4': [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // M4A
    'audio/aac': [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70], // AAC
    'image/jpeg': [0xFF, 0xD8, 0xFF], // JPG
    'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // PNG
    'image/gif': [0x47, 0x49, 0x46, 0x38] // GIF
};

function validateMagicBytes(buffer, mimetype) {
    if (mimetype === 'image/webp') {
        return buffer[0] === 0x52
            && buffer[1] === 0x49
            && buffer[2] === 0x46
            && buffer[3] === 0x46
            && buffer[8] === 0x57
            && buffer[9] === 0x45
            && buffer[10] === 0x42
            && buffer[11] === 0x50;
    }
    const magic = MAGIC_BYTES[mimetype];
    if (!magic) return true; // No validation for unknown types

    for (let i = 0; i < magic.length; i++) {
        if (buffer[i] !== magic[i]) {
            return false;
        }
    }
    return true;
}

// FIX 6: Input validation
function validateProjectId(id) {
    const num = parseInt(id, 10);
    return !isNaN(num) && num > 0 && num < 2147483647;
}

function validateUuid(id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
}

function validateTitle(title) {
    return typeof title === 'string' && title.length > 0 && title.length <= 200;
}

function validateColor(color) {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
}

function normalizeText(value, maxLength = 500) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
}

function normalizeNullableText(value, maxLength = 500) {
    const normalized = normalizeText(value, maxLength);
    return normalized || null;
}

function clampNumber(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function normalizeChoiceOverlayMode(value) {
    return value === 'hotspot' ? 'hotspot' : 'card';
}

function normalizeChoiceOverlayFit(value) {
    return value === 'contain' ? 'contain' : 'cover';
}

async function listStaticAssets(folderName, webPrefix) {
    const assetDir = path.join(__dirname, 'public', folderName);
    if (!await fs.pathExists(assetDir)) {
        return [];
    }
    const files = await fs.readdir(assetDir);
    return files
        .filter((file) => !file.startsWith('.'))
        .map((file) => ({
            name: file,
            path: `${webPrefix}/${file}`
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function isTruthyFlag(value) {
    return value === true || value === 1 || value === '1';
}

function buildNodeAnalytics(clips, edges, analyticsRows = [], sequence = []) {
    const clipMap = new Map(clips.map((clip) => [clip.unique_id, clip]));
    const sequenceIds = new Set(
        Array.isArray(sequence)
            ? sequence.map((item) => item?.id).filter(Boolean)
            : []
    );
    const inbound = new Map();
    const outbound = new Map();
    const visits = new Map();

    edges.forEach((edge) => {
        if (edge.from_id && clipMap.has(edge.from_id)) {
            outbound.set(edge.from_id, (outbound.get(edge.from_id) || 0) + (edge.to_id ? 1 : 0));
        }
        if (edge.to_id && clipMap.has(edge.to_id)) {
            inbound.set(edge.to_id, (inbound.get(edge.to_id) || 0) + 1);
        }
    });

    analyticsRows.forEach((row) => {
        if (!row.target_clip_id) return;
        visits.set(row.target_clip_id, (visits.get(row.target_clip_id) || 0) + Number(row.count || 0));
    });

    return clips
        .filter((clip) => !String(clip.name || '').startsWith('FULL:'))
        .map((clip) => ({
            clipId: clip.unique_id,
            name: clip.name,
            chapterName: normalizeText(clip.chapter_name, 120) || 'Unassigned',
            presetId: clip.preset_id || '',
            inSequence: sequenceIds.has(clip.unique_id),
            visits: visits.get(clip.unique_id) || 0,
            inboundCount: inbound.get(clip.unique_id) || 0,
            outboundCount: outbound.get(clip.unique_id) || 0,
            isEvent: isTruthyFlag(clip.is_event_clip),
            isEnding: isTruthyFlag(clip.is_game_over),
            hasTitleCard: Boolean(normalizeText(clip.title_card, 240)),
            hasSubtitle: Boolean(normalizeText(clip.subtitle_text, 1200))
        }))
        .sort((a, b) => {
            if (b.visits !== a.visits) return b.visits - a.visits;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
}

function buildStoryDiagnostics({ clips, edges, analyticsRows = [], sequence = [] }) {
    const clipMap = new Map(clips.map((clip) => [clip.unique_id, clip]));
    const validSequence = Array.isArray(sequence) ? sequence.filter((item) => item?.id) : [];
    const issues = [];
    const outgoing = new Map();
    const incoming = new Map();
    const chapters = new Map();
    const sequenceIds = [];

    validSequence.forEach((item, index) => {
        const clip = clipMap.get(item.id);
        if (!clip) {
            issues.push({
                severity: 'error',
                code: 'sequence-missing-clip',
                message: `Sequence item ${index + 1} points to a missing scene.`,
                sequenceIndex: index
            });
            return;
        }

        sequenceIds.push(item.id);

        if (String(clip.name || '').startsWith('FULL:')) {
            issues.push({
                severity: 'error',
                code: 'sequence-full-clip',
                message: `"${clip.name}" is a source clip and should not be in the publish sequence.`,
                clipId: clip.unique_id
            });
        }

        if (!normalizeText(clip.chapter_name, 120)) {
            issues.push({
                severity: 'warning',
                code: 'sequence-missing-chapter',
                message: `"${clip.name}" is missing a chapter label.`,
                clipId: clip.unique_id
            });
        }
    });

    edges.forEach((edge) => {
        if (edge.from_id) {
            outgoing.set(edge.from_id, (outgoing.get(edge.from_id) || 0) + (edge.to_id ? 1 : 0));
        }

        if (edge.from_id && !clipMap.has(edge.from_id)) {
            issues.push({
                severity: 'error',
                code: 'edge-missing-source',
                message: `A branch references a missing source scene (${edge.from_id}).`,
                fromId: edge.from_id,
                edgeId: edge.id
            });
        }

        if (edge.to_id) {
            incoming.set(edge.to_id, (incoming.get(edge.to_id) || 0) + 1);
            if (!clipMap.has(edge.to_id)) {
                issues.push({
                    severity: 'error',
                    code: 'edge-missing-target',
                    message: `Choice "${edge.label || 'Untitled'}" points to a missing target scene.`,
                    fromId: edge.from_id,
                    toId: edge.to_id,
                    edgeId: edge.id
                });
            }
        }

        if (edge.timeout_to_id && !clipMap.has(edge.timeout_to_id)) {
            issues.push({
                severity: 'error',
                code: 'timeout-missing-target',
                message: `A timed branch points to a missing timeout target (${edge.timeout_to_id}).`,
                fromId: edge.from_id,
                toId: edge.timeout_to_id,
                edgeId: edge.id
            });
        }
    });

    const reachableIds = new Set(sequenceIds);
    const queue = [...sequenceIds];
    while (queue.length) {
        const currentId = queue.shift();
        edges
            .filter((edge) => edge.from_id === currentId && edge.to_id && clipMap.has(edge.to_id))
            .forEach((edge) => {
                if (reachableIds.has(edge.to_id)) return;
                reachableIds.add(edge.to_id);
                queue.push(edge.to_id);
            });
    }

    clips
        .filter((clip) => !String(clip.name || '').startsWith('FULL:'))
        .forEach((clip) => {
            const chapterName = normalizeText(clip.chapter_name, 120) || 'Unassigned';
            if (!chapters.has(chapterName)) {
                chapters.set(chapterName, {
                    name: chapterName,
                    clipCount: 0,
                    eventCount: 0,
                    endingCount: 0,
                    sequenceCount: 0
                });
            }

            const chapter = chapters.get(chapterName);
            chapter.clipCount += 1;
            if (isTruthyFlag(clip.is_event_clip)) chapter.eventCount += 1;
            if (isTruthyFlag(clip.is_game_over)) chapter.endingCount += 1;
            if (sequenceIds.includes(clip.unique_id)) chapter.sequenceCount += 1;

            const hasOutgoing = (outgoing.get(clip.unique_id) || 0) > 0;
            const hasIncoming = (incoming.get(clip.unique_id) || 0) > 0;
            const isEnding = isTruthyFlag(clip.is_game_over);
            const inReachableTree = reachableIds.has(clip.unique_id);

            if (sequenceIds.length && !inReachableTree && !sequenceIds.includes(clip.unique_id)) {
                issues.push({
                    severity: 'warning',
                    code: 'orphan-scene',
                    message: `"${clip.name}" is not reachable from the current publish sequence.`,
                    clipId: clip.unique_id
                });
            } else if (!sequenceIds.length && !hasIncoming && !isTruthyFlag(clip.is_event_clip)) {
                issues.push({
                    severity: 'info',
                    code: 'unplaced-scene',
                    message: `"${clip.name}" is not connected to any incoming branch yet.`,
                    clipId: clip.unique_id
                });
            }

            if (!isEnding && !hasOutgoing) {
                issues.push({
                    severity: 'warning',
                    code: 'dead-end-scene',
                    message: `"${clip.name}" has no outgoing branches and is not marked as a Game Over scene.`,
                    clipId: clip.unique_id
                });
            }
        });

    if (!sequenceIds.length) {
        issues.push({
            severity: 'warning',
            code: 'empty-sequence',
            message: 'The publish sequence is empty.'
        });
    }

    const nodeStats = buildNodeAnalytics(clips, edges, analyticsRows, validSequence);
    const errorCount = issues.filter((issue) => issue.severity === 'error').length;
    const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
    const infoCount = issues.filter((issue) => issue.severity === 'info').length;

    return {
        issues,
        summary: {
            sceneCount: clips.filter((clip) => !String(clip.name || '').startsWith('FULL:')).length,
            sequenceCount: sequenceIds.length,
            reachableCount: reachableIds.size,
            chapterCount: chapters.size,
            errorCount,
            warningCount,
            infoCount
        },
        chapters: Array.from(chapters.values()).sort((a, b) => a.name.localeCompare(b.name)),
        nodeStats
    };
}

const ANALYTICS_SOURCES = new Set(['preview', 'published']);
const ANALYTICS_EVENT_TYPES = new Set(['choice', 'scene_view', 'achievement', 'ending']);

function normalizeAnalyticsEventType(eventType) {
    if (eventType === undefined || eventType === null || eventType === '') {
        return 'choice';
    }
    if (typeof eventType !== 'string') return null;
    const normalized = eventType.trim().toLowerCase();
    return ANALYTICS_EVENT_TYPES.has(normalized) ? normalized : null;
}

function normalizeAnalyticsSource(source, req) {
    if (source === undefined || source === null || source === '') {
        const referer = typeof req?.get === 'function' ? (req.get('referer') || '') : '';
        return referer.includes('/exports/') ? 'published' : 'preview';
    }
    if (typeof source !== 'string') return null;
    const normalized = source.trim().toLowerCase();
    return ANALYTICS_SOURCES.has(normalized) ? normalized : null;
}

function parseAnalyticsSourceFilter(source) {
    if (source === undefined || source === null || source === '') return null;
    if (typeof source !== 'string') return undefined;
    const normalized = source.trim().toLowerCase();
    return ANALYTICS_SOURCES.has(normalized) ? normalized : undefined;
}

// --- FIX 6: ROBUST FFMPEG PATH DEPENDENCY ---
// Explicitly fallback to system paths if static packages fail
try {
    const ffmpegPath = require('ffmpeg-static');
    const ffprobePath = require('ffprobe-static').path;
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    console.log("✅ FFmpeg/FFprobe linked successfully (Static)");
} catch (e) {
    console.warn("⚠️ Static FFmpeg not found. Falling back to system FFmpeg.");
    // fluent-ffmpeg will automatically attempt to use system 'ffmpeg' command
}
// -------------------------------------

const PORT = 3000;
const app = express();

// FIX 4: Restrict CORS to specific origins (configure as needed)
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        // In production, replace with specific allowed origins
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:8080',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:8080'
        ];
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// FIX 5: Rate limiting to prevent DoS attacks
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs (increased for video editing)
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: 1
});

// Stricter limiter for upload endpoints
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // Increased from 20 for bulk operations
    message: { error: 'Too many upload requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: 1
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 1. SETUP FOLDERS
const folders = ['videos', 'clips', 'thumbnails', 'exports', 'audio'];
folders.forEach(f => fs.ensureDirSync(path.join(__dirname, 'public', f)));

// 2. DATABASE INIT
let db;
(async () => {
    db = await open({ filename: './database.sqlite', driver: sqlite3.Database });
    
    // Core Tables
    await db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, theme_color TEXT DEFAULT '#3b82f6', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
    await db.exec(`CREATE TABLE IF NOT EXISTS videos (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, filename TEXT, filepath TEXT, thumbnail TEXT, duration REAL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
    
    // Clips Table
    await db.exec(`CREATE TABLE IF NOT EXISTS clips (id INTEGER PRIMARY KEY AUTOINCREMENT, unique_id TEXT UNIQUE, project_id INTEGER, name TEXT, filepath TEXT, thumbnail TEXT, source_video_id INTEGER, duration REAL, start_time REAL DEFAULT 0, end_time REAL, logic_name TEXT, timeout_to_id TEXT, timeout_seconds REAL, bg_music TEXT, bg_music_url TEXT, mute_audio INTEGER DEFAULT 0, is_event_clip INTEGER DEFAULT 0, is_game_over INTEGER DEFAULT 0, x REAL DEFAULT 0, y REAL DEFAULT 0);`);
    
    // Edges (Logic) Table
    await db.exec(`CREATE TABLE IF NOT EXISTS edges (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, from_id TEXT, to_id TEXT, label TEXT, text_color TEXT DEFAULT '#ffffff', trigger_time REAL, logic_id TEXT, return_to_main INTEGER DEFAULT 0, set_var TEXT, req_var TEXT, timeout_seconds REAL DEFAULT 0, timeout_to_id TEXT, is_dead_end INTEGER DEFAULT 0, behavior_type TEXT DEFAULT 'menu', qte_duration REAL DEFAULT 0, qte_target_id TEXT, character_name TEXT, relationship_change INTEGER DEFAULT 0, achievement_id TEXT, is_hidden INTEGER DEFAULT 0, overlay_mode TEXT DEFAULT 'card', overlay_asset TEXT, overlay_x REAL DEFAULT 50, overlay_y REAL DEFAULT 50, overlay_width REAL DEFAULT 22, overlay_height REAL DEFAULT 18, overlay_fit TEXT DEFAULT 'cover', overlay_focus_x REAL DEFAULT 50, overlay_focus_y REAL DEFAULT 50);`);

    // Stats Table
    await db.exec(`CREATE TABLE IF NOT EXISTS analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, choice_label TEXT, target_clip_id TEXT, source TEXT DEFAULT 'preview', event_type TEXT DEFAULT 'choice', timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);`);

    // Achievements Table
    await db.exec(`CREATE TABLE IF NOT EXISTS achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, achievement_id TEXT UNIQUE, name TEXT, description TEXT, icon TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);

    // Reusable Scene Presets
    await db.exec(`CREATE TABLE IF NOT EXISTS scene_presets (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, preset_id TEXT UNIQUE, name TEXT, chapter_name TEXT, title_card TEXT, subtitle_text TEXT, scene_notes TEXT, bg_music TEXT, mute_audio INTEGER DEFAULT 0, is_game_over INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);

    const migrations = [
        `ALTER TABLE projects ADD COLUMN theme_color TEXT DEFAULT '#3b82f6'`,
        `ALTER TABLE clips ADD COLUMN bg_music TEXT`,
        `ALTER TABLE clips ADD COLUMN mute_audio INTEGER DEFAULT 0`,
        `ALTER TABLE edges ADD COLUMN logic_id TEXT`,
        `ALTER TABLE edges ADD COLUMN return_to_main INTEGER DEFAULT 0`,
        `ALTER TABLE edges ADD COLUMN set_var TEXT`,
        `ALTER TABLE edges ADD COLUMN req_var TEXT`,
        `ALTER TABLE edges ADD COLUMN text_color TEXT DEFAULT '#ffffff'`,
        `ALTER TABLE clips ADD COLUMN is_event_clip INTEGER DEFAULT 0`,
        `ALTER TABLE clips ADD COLUMN is_game_over INTEGER DEFAULT 0`,
        `ALTER TABLE clips ADD COLUMN x REAL DEFAULT 0`,
        `ALTER TABLE clips ADD COLUMN y REAL DEFAULT 0`,
        `ALTER TABLE edges ADD COLUMN timeout_seconds REAL DEFAULT 0`,
        `ALTER TABLE edges ADD COLUMN timeout_to_id TEXT`,
        `ALTER TABLE edges ADD COLUMN is_dead_end INTEGER DEFAULT 0`,
        `ALTER TABLE edges ADD COLUMN behavior_type TEXT DEFAULT 'menu'`,
        `ALTER TABLE edges ADD COLUMN qte_duration REAL DEFAULT 0`,
        `ALTER TABLE edges ADD COLUMN qte_target_id TEXT`,
        `ALTER TABLE edges ADD COLUMN character_name TEXT`,
        `ALTER TABLE edges ADD COLUMN relationship_change INTEGER DEFAULT 0`,
        `ALTER TABLE edges ADD COLUMN achievement_id TEXT`,
        `ALTER TABLE edges ADD COLUMN is_hidden INTEGER DEFAULT 0`,
        `ALTER TABLE edges ADD COLUMN overlay_mode TEXT DEFAULT 'card'`,
        `ALTER TABLE edges ADD COLUMN overlay_asset TEXT`,
        `ALTER TABLE edges ADD COLUMN overlay_x REAL DEFAULT 50`,
        `ALTER TABLE edges ADD COLUMN overlay_y REAL DEFAULT 50`,
        `ALTER TABLE edges ADD COLUMN overlay_width REAL DEFAULT 22`,
        `ALTER TABLE edges ADD COLUMN overlay_height REAL DEFAULT 18`,
        `ALTER TABLE edges ADD COLUMN overlay_fit TEXT DEFAULT 'cover'`,
        `ALTER TABLE edges ADD COLUMN overlay_focus_x REAL DEFAULT 50`,
        `ALTER TABLE edges ADD COLUMN overlay_focus_y REAL DEFAULT 50`,
        `ALTER TABLE analytics ADD COLUMN source TEXT DEFAULT 'preview'`,
        `ALTER TABLE analytics ADD COLUMN event_type TEXT DEFAULT 'choice'`,
        `ALTER TABLE clips ADD COLUMN chapter_name TEXT`,
        `ALTER TABLE clips ADD COLUMN title_card TEXT`,
        `ALTER TABLE clips ADD COLUMN subtitle_text TEXT`,
        `ALTER TABLE clips ADD COLUMN scene_notes TEXT`,
        `ALTER TABLE clips ADD COLUMN preset_id TEXT`
    ];
    for(let m of migrations) {
        try { await db.exec(m); } catch(e){ console.warn('Migration skipped (likely already exists):', m.substring(0, 50)); }
    }

    // Performance indexes
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_clips_project ON clips(project_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_clips_unique ON clips(unique_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_clips_source ON clips(source_video_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_project ON edges(project_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_logic ON edges(logic_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_analytics_project ON analytics(project_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_analytics_project_source ON analytics(project_id, source)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_videos_project ON videos(project_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_achievements_project ON achievements(project_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_presets_project ON scene_presets(project_id)`);

    const proj = await db.get('SELECT * FROM projects');
    if(!proj) await db.run("INSERT INTO projects (title) VALUES ('Default Project')");
    console.log("✅ Studio Infinity Final v20.13 (Optimized) Ready");
})();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = file.mimetype.startsWith('audio')
            ? 'public/audio'
            : (file.mimetype.startsWith('image') ? 'public/images' : 'public/videos');
        fs.ensureDirSync(path.join(__dirname, dest));
        cb(null, path.join(__dirname, dest));
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const fileFilter = (req, file, cb) => {
    const videoTypes = /mp4|avi|mov|mkv|webm/;
    const audioTypes = /mp3|wav|ogg|m4a|aac/;
    const imageTypes = /jpg|jpeg|png|gif|webp/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    
    if (file.mimetype.startsWith('video') && videoTypes.test(ext)) {
        cb(null, true);
    } else if (file.mimetype.startsWith('audio') && audioTypes.test(ext)) {
        cb(null, true);
    } else if (file.mimetype.startsWith('image') && imageTypes.test(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only video, audio, and image files are allowed.'));
    }
};

const upload = multer({ 
    storage,
    fileFilter,
    limits: { fileSize: 2000 * 1024 * 1024 } // 2GB limit
});

const generateThumbnail = (inputPath, filename, timestamp = '20%') => {
    return new Promise((resolve, reject) => {
        const thumbFilename = filename.replace(path.extname(filename), '') + `_${Date.now()}.jpg`;
        const outputFolder = path.join(__dirname, 'public/thumbnails');
        
        ffmpeg(inputPath)
            .screenshots({ 
                timestamps: [timestamp], 
                filename: thumbFilename, 
                folder: outputFolder, 
                size: '640x360' 
            })
            .on('end', () => resolve(`/thumbnails/${thumbFilename}`))
            .on('error', (err) => {
                console.error('Thumbnail generation error:', err);
                resolve(null); 
            });
    });
};

const runFfmpegCommand = (command, timeoutMs = 300000) => (
    new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try {
                command.kill('SIGKILL');
            } catch (killError) {
                console.warn('FFmpeg timeout kill failed:', killError);
            }
            const timeoutError = new Error(`FFmpeg command timed out after ${timeoutMs}ms`);
            timeoutError.code = 'FFMPEG_TIMEOUT';
            reject(timeoutError);
        }, timeoutMs);

        command
            .on('end', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve();
            })
            .on('error', (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(err);
            })
            .run();
    })
);

// --- ROUTES ---
app.get('/api/projects', async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM projects ORDER BY id DESC');
        res.json(rows);
    } catch(err) {
        console.error('Error fetching projects:', err);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

app.post('/api/projects', async (req, res) => {
    // FIX 6: Input validation
    const { title } = req.body;
    if (!validateTitle(title)) {
        return res.status(400).json({ error: 'Invalid title: must be 1-200 characters' });
    }
    try {
        const result = await db.run('INSERT INTO projects (title) VALUES (?)', [title]);
        res.json({ success: true, projectId: result.lastID });
    } catch(err) {
        console.error('Error creating project:', err);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

app.post('/api/project/settings', async (req, res) => {
    // FIX 6: Input validation
    const { color, id } = req.body;
    if (!validateProjectId(id)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!validateColor(color)) {
        return res.status(400).json({ error: 'Invalid color format' });
    }
    try {
        await db.run('UPDATE projects SET theme_color = ? WHERE id = ?', [color, id]);
        res.json({success:true});
    } catch(err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

app.post('/api/analytics/track', async (req, res) => {
    const {
        projectId,
        label,
        target,
        source: requestedSource,
        eventType: requestedEventType
    } = req.body;
    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!target || typeof target !== 'string') {
        return res.status(400).json({ error: 'Invalid target' });
    }
    const source = normalizeAnalyticsSource(requestedSource, req);
    if (!source) {
        return res.status(400).json({ error: 'Invalid analytics source' });
    }
    const eventType = normalizeAnalyticsEventType(requestedEventType);
    if (!eventType) {
        return res.status(400).json({ error: 'Invalid analytics event type' });
    }
    const normalizedLabel = typeof label === 'string' && label.trim()
        ? label.trim()
        : eventType === 'choice'
            ? null
            : eventType.replace(/_/g, ' ');
    if (!normalizedLabel) {
        return res.status(400).json({ error: 'Invalid label' });
    }
    try {
        await db.run(
            'INSERT INTO analytics (project_id, choice_label, target_clip_id, source, event_type) VALUES (?, ?, ?, ?, ?)',
            [projectId, normalizedLabel, target, source, eventType]
        );
        res.json({success: true});
    } catch(err) {
        console.error('Analytics tracking error:', err);
        res.status(500).json({ error: 'Failed to track analytics' });
    }
});

app.get('/api/analytics/:projectId', async (req, res) => {
    if (!validateProjectId(req.params.projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    const sourceFilter = parseAnalyticsSourceFilter(req.query.source);
    if (req.query.source !== undefined && sourceFilter === undefined) {
        return res.status(400).json({ error: 'Invalid analytics source' });
    }
    try {
        const rows = sourceFilter
            ? await db.all("SELECT choice_label, COUNT(*) as count FROM analytics WHERE project_id = ? AND source = ? AND event_type = 'choice' GROUP BY choice_label ORDER BY count DESC",
                [req.params.projectId, sourceFilter])
            : await db.all("SELECT choice_label, COUNT(*) as count FROM analytics WHERE project_id = ? AND event_type = 'choice' GROUP BY choice_label ORDER BY count DESC",
                [req.params.projectId]);
        res.json(rows);
    } catch(err) {
        console.error('Error fetching analytics:', err);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

app.get('/api/analytics/summary/:projectId', async (req, res) => {
    if (!validateProjectId(req.params.projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    const sourceFilter = parseAnalyticsSourceFilter(req.query.source);
    if (req.query.source !== undefined && sourceFilter === undefined) {
        return res.status(400).json({ error: 'Invalid analytics source' });
    }

    try {
        const conditions = ['project_id = ?'];
        const params = [req.params.projectId];
        if (sourceFilter) {
            conditions.push('source = ?');
            params.push(sourceFilter);
        }
        const whereClause = conditions.join(' AND ');

        const [
            choiceTotal,
            sceneViewTotal,
            scenesReached,
            endingTotal,
            achievementTotal
        ] = await Promise.all([
            db.get(`SELECT COUNT(*) as total FROM analytics WHERE ${whereClause} AND event_type = 'choice'`, params),
            db.get(`SELECT COUNT(*) as total FROM analytics WHERE ${whereClause} AND event_type = 'scene_view'`, params),
            db.get(`SELECT COUNT(DISTINCT target_clip_id) as total FROM analytics WHERE ${whereClause} AND event_type = 'scene_view'`, params),
            db.get(`SELECT COUNT(*) as total FROM analytics WHERE ${whereClause} AND event_type = 'ending'`, params),
            db.get(`SELECT COUNT(*) as total FROM analytics WHERE ${whereClause} AND event_type = 'achievement'`, params)
        ]);

        res.json({
            totalChoices: Number(choiceTotal?.total || 0),
            totalSceneViews: Number(sceneViewTotal?.total || 0),
            scenesReached: Number(scenesReached?.total || 0),
            endingsReached: Number(endingTotal?.total || 0),
            achievementsUnlocked: Number(achievementTotal?.total || 0)
        });
    } catch (err) {
        console.error('Error fetching analytics summary:', err);
        res.status(500).json({ error: 'Failed to fetch analytics summary' });
    }
});

app.post('/api/analytics/reset', async (req, res) => {
    const { projectId, source } = req.body;
    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    const sourceFilter = parseAnalyticsSourceFilter(source);
    if (source !== undefined && sourceFilter === undefined) {
        return res.status(400).json({ error: 'Invalid analytics source' });
    }
    try {
        if (sourceFilter) {
            await db.run('DELETE FROM analytics WHERE project_id = ? AND source = ?', [projectId, sourceFilter]);
        } else {
            await db.run('DELETE FROM analytics WHERE project_id = ?', [projectId]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error resetting analytics:', err);
        // FIX 7: Don't expose err.message in production
        res.status(500).json({ error: 'Failed to reset analytics' });
    }
});

// --- ACHIEVEMENTS API ---
app.get('/api/achievements/:projectId', async (req, res) => {
    // FIX 6: Input validation
    if (!validateProjectId(req.params.projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    try {
        const rows = await db.all('SELECT * FROM achievements WHERE project_id = ?', [req.params.projectId]);
        res.json(rows);
    } catch(err) {
        console.error('Error fetching achievements:', err);
        res.status(500).json({ error: 'Failed to fetch achievements' });
    }
});

app.post('/api/achievements', async (req, res) => {
    // FIX: Add input validation
    const { projectId, achievementId, name, description, icon } = req.body;
    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!achievementId || typeof achievementId !== 'string') {
        return res.status(400).json({ error: 'Invalid achievement ID' });
    }
    if (!name || typeof name !== 'string' || name.length > 200) {
        return res.status(400).json({ error: 'Invalid name' });
    }
    try {
        await db.run('INSERT OR REPLACE INTO achievements (project_id, achievement_id, name, description, icon) VALUES (?, ?, ?, ?, ?)',
            [projectId, achievementId, name, description, icon || '*']);
        res.json({ success: true });
    } catch(err) {
        console.error('Error creating achievement:', err);
        res.status(500).json({ error: 'Failed to create achievement' });
    }
});

app.post('/api/delete_achievement', async (req, res) => {
    // FIX: Add input validation
    const { achievementId, projectId } = req.body;
    if (!achievementId || typeof achievementId !== 'string') {
        return res.status(400).json({ error: 'Invalid achievement ID' });
    }
    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    try {
        await db.run('DELETE FROM achievements WHERE achievement_id = ? AND project_id = ?',
            [achievementId, projectId]);
        res.json({ success: true });
    } catch(err) {
        console.error('Error deleting achievement:', err);
        res.status(500).json({ error: 'Failed to delete achievement' });
    }
});

app.get('/api/presets/:projectId', async (req, res) => {
    if (!validateProjectId(req.params.projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    try {
        const rows = await db.all(
            'SELECT * FROM scene_presets WHERE project_id = ? ORDER BY name COLLATE NOCASE ASC',
            [req.params.projectId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching scene presets:', err);
        res.status(500).json({ error: 'Failed to fetch scene presets' });
    }
});

app.post('/api/presets', async (req, res) => {
    const {
        projectId,
        presetId,
        name,
        chapterName,
        titleCard,
        subtitleText,
        sceneNotes,
        bgMusic,
        muteAudio,
        isGameOver
    } = req.body;

    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }

    const normalizedName = normalizeText(name, 120);
    if (!normalizedName) {
        return res.status(400).json({ error: 'Preset name is required' });
    }

    const resolvedPresetId = normalizeNullableText(presetId, 120) || uuidv4();

    try {
        await db.run(
            `INSERT INTO scene_presets (
                project_id, preset_id, name, chapter_name, title_card, subtitle_text, scene_notes, bg_music, mute_audio, is_game_over
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(preset_id) DO UPDATE SET
                name = excluded.name,
                chapter_name = excluded.chapter_name,
                title_card = excluded.title_card,
                subtitle_text = excluded.subtitle_text,
                scene_notes = excluded.scene_notes,
                bg_music = excluded.bg_music,
                mute_audio = excluded.mute_audio,
                is_game_over = excluded.is_game_over`,
            [
                projectId,
                resolvedPresetId,
                normalizedName,
                normalizeNullableText(chapterName, 120),
                normalizeNullableText(titleCard, 240),
                normalizeNullableText(subtitleText, 1200),
                normalizeNullableText(sceneNotes, 2000),
                normalizeNullableText(bgMusic, 300),
                isTruthyFlag(muteAudio) ? 1 : 0,
                isTruthyFlag(isGameOver) ? 1 : 0
            ]
        );

        res.json({ success: true, presetId: resolvedPresetId });
    } catch (err) {
        console.error('Error saving scene preset:', err);
        res.status(500).json({ error: 'Failed to save scene preset' });
    }
});

app.post('/api/presets/apply', async (req, res) => {
    const { projectId, presetId, clipId } = req.body;

    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!validateUuid(clipId)) {
        return res.status(400).json({ error: 'Invalid clip ID' });
    }
    if (!presetId || typeof presetId !== 'string') {
        return res.status(400).json({ error: 'Invalid preset ID' });
    }

    try {
        const preset = await db.get(
            'SELECT * FROM scene_presets WHERE project_id = ? AND preset_id = ?',
            [projectId, presetId]
        );
        if (!preset) {
            return res.status(404).json({ error: 'Scene preset not found' });
        }

        await db.run(
            `UPDATE clips SET
                chapter_name = ?,
                title_card = ?,
                subtitle_text = ?,
                scene_notes = ?,
                bg_music = ?,
                mute_audio = ?,
                is_game_over = ?,
                preset_id = ?
            WHERE project_id = ? AND unique_id = ?`,
            [
                preset.chapter_name || null,
                preset.title_card || null,
                preset.subtitle_text || null,
                preset.scene_notes || null,
                preset.bg_music || null,
                preset.mute_audio ? 1 : 0,
                preset.is_game_over ? 1 : 0,
                preset.preset_id,
                projectId,
                clipId
            ]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Error applying scene preset:', err);
        res.status(500).json({ error: 'Failed to apply scene preset' });
    }
});

app.post('/api/delete_preset', async (req, res) => {
    const { projectId, presetId } = req.body;
    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!presetId || typeof presetId !== 'string') {
        return res.status(400).json({ error: 'Invalid preset ID' });
    }

    try {
        await db.run('DELETE FROM scene_presets WHERE project_id = ? AND preset_id = ?', [projectId, presetId]);
        await db.run('UPDATE clips SET preset_id = NULL WHERE project_id = ? AND preset_id = ?', [projectId, presetId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting scene preset:', err);
        res.status(500).json({ error: 'Failed to delete scene preset' });
    }
});

app.get('/api/exports', async (req, res) => {
    try {
        const exportDir = path.join(__dirname, 'public/exports');
        if (!await fs.pathExists(exportDir)) {
            return res.json([]);
        }
        const dirs = await fs.readdir(exportDir);
        const builds = [];
        for (const dir of dirs) {
            const dirPath = path.join(exportDir, dir);
            const stat = await fs.stat(dirPath);
            if (stat.isDirectory() && await fs.pathExists(path.join(dirPath, 'index.html'))) {
                builds.push({ name: dir, url: `/exports/${dir}/index.html` });
            }
        }
        res.json(builds.reverse());
    } catch (e) { 
        console.error('Error fetching exports:', e);
        res.json([]); 
    }
});

app.post('/api/delete_export', async (req, res) => {
    try {
        // FIX 2: Path validation to prevent path traversal
        const cleanName = path.basename(req.body.name);
        const targetPath = safePath(path.join(__dirname, 'public/exports'), cleanName);
        if (!targetPath) {
            return res.status(400).json({ error: 'Invalid path' });
        }
        await fs.remove(targetPath);
        res.json({ success: true });
    } catch (e) {
        console.error('Error deleting export:', e);
        // FIX 7: Don't expose err.message in production
        res.status(500).json({ error: 'Failed to delete export' });
    }
});

app.post('/api/upload', uploadLimiter, upload.single('file'), async (req, res) => {
    // FIX: Validate projectId properly - default to 1 only if not provided
    let projectId = req.body.projectId;
    if (!projectId) projectId = 1;
    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!req.file) return res.status(400).json({ error: "No file" });

    // FIX 3: Validate magic bytes for uploaded files
    try {
        const buffer = await fs.readFile(req.file.path, { length: 16 });
        if (!validateMagicBytes(buffer, req.file.mimetype)) {
            await fs.unlink(req.file.path).catch(() => {});
            return res.status(400).json({ error: 'Invalid file content' });
        }
    } catch (err) {
        console.error('Magic byte validation error:', err);
        return res.status(400).json({ error: 'File validation failed' });
    }

    try {
        if(req.file.mimetype.startsWith('audio')) {
            return res.json({
                success: true,
                type: 'audio',
                path: `/audio/${req.file.filename}`,
                name: req.file.originalname
            });
        }

        if(req.file.mimetype.startsWith('image')) {
            return res.json({
                success: true,
                type: 'image',
                path: `/images/${req.file.filename}`,
                name: req.file.originalname
            });
        }

        const filename = req.file.filename;
        const webPath = `/videos/${filename}`;

        // FIX: Use promise wrapper for ffprobe to avoid async callback issues
        const metadata = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(req.file.path, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        }).catch(err => {
            console.error('FFprobe error:', err);
            return res.status(500).json({ error: 'Failed to process video' });
        });

        if (!metadata) return; // Error already sent

        const duration = metadata ? metadata.format.duration : 0;
        const thumbnail = await generateThumbnail(req.file.path, filename);

        // FIX: Add transaction for atomic operations
        try {
            await db.exec('BEGIN TRANSACTION');
            const result = await db.run('INSERT INTO videos (project_id, filename, filepath, thumbnail, duration) VALUES (?, ?, ?, ?, ?)',
                [projectId, req.file.originalname, webPath, thumbnail, duration]);

            const clipId = uuidv4();
            await db.run('INSERT INTO clips (unique_id, project_id, name, filepath, thumbnail, source_video_id, duration, x, y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [clipId, projectId, `FULL: ${req.file.originalname}`, webPath, thumbnail, result.lastID, duration, 100, 100]);

            await db.exec('COMMIT');
            res.json({ success: true, type: 'video' });
        } catch(dbErr) {
            await db.exec('ROLLBACK');
            console.error('Database error:', dbErr);
            res.status(500).json({ error: 'Failed to save video to database' });
        }
    } catch(err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.get('/api/videos', async (req, res) => {
    try {
        const projectId = req.query.projectId || 1;
        // FIX 6: Input validation
        if (!validateProjectId(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        const videos = await db.all('SELECT * FROM videos WHERE project_id = ? ORDER BY id DESC', [projectId]);
        res.json(videos);
    } catch(err) {
        console.error('Error fetching videos:', err);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

app.get('/api/audio', async (req, res) => { 
    try { 
        res.json(await listStaticAssets('audio', '/audio')); 
    } catch(e) {
        console.error('Error fetching audio:', e);
        res.json([]);
    } 
});

app.get('/api/images', async (req, res) => {
    try {
        res.json(await listStaticAssets('images', '/images'));
    } catch (e) {
        console.error('Error fetching images:', e);
        res.json([]);
    }
});

app.post('/api/delete_clips_bulk', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "Invalid ID list" });
        }

        // FIX: Validate each ID
        for (const id of ids) {
            if (!validateUuid(id)) {
                return res.status(400).json({ error: 'Invalid clip ID format' });
            }
        }

        // FIX: Batch query to avoid N+1 problem
        const placeholders = ids.map(() => '?').join(',');
        const clips = await db.all(`SELECT * FROM clips WHERE unique_id IN (${placeholders})`, ids);

        const deletableIds = [];
        for (const clip of clips) {
            if (clip.name.startsWith('FULL:')) {
                continue;
            }
            try {
                const filepath = path.join(__dirname, 'public', clip.filepath);
                if (await fs.pathExists(filepath)) {
                    await fs.unlink(filepath);
                }
            } catch (e) {
                console.error('File cleanup error for ' + clip.unique_id + ':', e);
            }
            deletableIds.push(clip.unique_id);
        }

        if (!deletableIds.length) {
            return res.json({ success: true, count: 0 });
        }

        const deletePlaceholders = deletableIds.map(() => '?').join(',');

        // FIX: Batch delete operations
        await db.run(`DELETE FROM clips WHERE unique_id IN (${deletePlaceholders})`, deletableIds);
        await db.run(`DELETE FROM edges WHERE from_id IN (${deletePlaceholders}) OR to_id IN (${deletePlaceholders})`, [...deletableIds, ...deletableIds]);
        await db.run(`DELETE FROM analytics WHERE target_clip_id IN (${deletePlaceholders})`, deletableIds);

        res.json({ success: true, count: deletableIds.length });
    } catch (err) {
        console.error('Bulk deletion failed:', err);
        res.status(500).json({ error: 'Internal server error during deletion' });
    }
});

app.post('/api/delete_video', async (req, res) => {
    // FIX 6: Input validation
    const { id } = req.body;
    if (!validateProjectId(id)) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }
    try {
        const vid = await db.get('SELECT * FROM videos WHERE id = ?', [id]);
        if(vid) {
            const relatedClips = await db.all('SELECT unique_id, filepath, name FROM clips WHERE source_video_id = ?', [id]);
            try {
                // FIX 2: Path validation
                const filepath = safePath(path.join(__dirname, 'public'), vid.filepath);
                if (filepath && await fs.pathExists(filepath)) {
                    await fs.unlink(filepath);
                }
            } catch(e) {
                console.error('Error deleting video file:', e);
            }
            for (const clip of relatedClips) {
                if (clip.name.startsWith('FULL:')) {
                    continue;
                }
                try {
                    const clipPath = safePath(path.join(__dirname, 'public'), clip.filepath);
                    if (clipPath && await fs.pathExists(clipPath)) {
                        await fs.unlink(clipPath);
                    }
                } catch (e) {
                    console.error('Error deleting derived clip file:', e);
                }
            }
            const relatedIds = relatedClips.map((clip) => clip.unique_id);
            await db.run('DELETE FROM videos WHERE id = ?', [id]);
            await db.run('DELETE FROM clips WHERE source_video_id = ?', [id]);
            if (relatedIds.length) {
                const placeholders = relatedIds.map(() => '?').join(',');
                await db.run(`DELETE FROM edges WHERE from_id IN (${placeholders}) OR to_id IN (${placeholders})`, [...relatedIds, ...relatedIds]);
                await db.run(`DELETE FROM analytics WHERE target_clip_id IN (${placeholders})`, relatedIds);
            }
        }
        res.json({ success: true });
    } catch(err) {
        console.error('Error deleting video:', err);
        res.status(500).json({ error: 'Failed to delete video' });
    }
});

app.post('/api/delete_clip', async (req, res) => {
    // FIX 6: Input validation
    const { unique_id } = req.body;
    if (!unique_id || typeof unique_id !== 'string') {
        return res.status(400).json({ error: 'Invalid clip ID' });
    }
    try {
        const clip = await db.get('SELECT * FROM clips WHERE unique_id = ?', [unique_id]);

        if(clip && !clip.name.startsWith('FULL:')) {
            try {
                // FIX 2: Path validation
                const filepath = safePath(path.join(__dirname, 'public'), clip.filepath);
                if (filepath && await fs.pathExists(filepath)) {
                    await fs.unlink(filepath);
                }
            } catch(e) {
                console.error('Error deleting clip file:', e);
            }

            await db.run('DELETE FROM clips WHERE unique_id = ?', [unique_id]);
            await db.run('DELETE FROM edges WHERE from_id = ? OR to_id = ?', [unique_id, unique_id]);
            await db.run('DELETE FROM analytics WHERE target_clip_id = ?', [unique_id]);
        }
        res.json({ success: true });
    } catch(err) {
        console.error('Error deleting clip:', err);
        res.status(500).json({ error: 'Failed to delete clip' });
    }
});

app.post('/api/clip', async (req, res) => {
    const { projectId, sourceId, start, end, name, filter, speed, volume } = req.body;

    // FIX: Add input validation
    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!validateProjectId(sourceId)) {
        return res.status(400).json({ error: 'Invalid source video ID' });
    }
    if (!name || typeof name !== 'string' || name.length > 200) {
        return res.status(400).json({ error: 'Invalid clip name' });
    }
    if (isNaN(parseFloat(start)) || isNaN(parseFloat(end))) {
        return res.status(400).json({ error: 'Invalid time values' });
    }

    try {
        const video = await db.get('SELECT * FROM videos WHERE id = ?', [sourceId]);
        if (!video) {
            return res.status(404).json({ error: 'Source video not found' });
        }
        
        const sourcePath = path.join(__dirname, 'public', video.filepath);
        if (!await fs.pathExists(sourcePath)) {
            return res.status(404).json({ error: 'Source video file not found' });
        }
        
        const clipId = uuidv4();
        const outputFilename = `clip_${clipId}.mp4`;
        const outputPath = path.join(__dirname, 'public/clips', outputFilename);
        
        let duration = parseFloat(end) - parseFloat(start);
        if(duration < 0) duration = 0.5;

        let command = ffmpeg(sourcePath).setStartTime(start).setDuration(duration);
        
        if(speed && parseFloat(speed)!==1.0) { 
            command.audioFilters(`atempo=${parseFloat(speed)}`); 
            duration=duration/parseFloat(speed); 
            command.videoFilters(`setpts=${1/parseFloat(speed)}*PTS`); 
        }
        
        if(filter && filter!=='none') { 
            if(filter==='bw') command.videoFilters('hue=s=0'); 
            if(filter==='sepia') command.videoFilters('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'); 
            if(filter==='vivid') command.videoFilters('eq=saturation=2'); 
        }
        
        if(volume && parseFloat(volume)!==1.0) { 
            command.audioFilters(`volume=${parseFloat(volume)}`); 
        }
        
        command.videoCodec('libx264').audioCodec('aac').outputOptions('-preset ultrafast').output(outputPath);

        try {
            await runFfmpegCommand(command, 300000);
            const thumbnail = await generateThumbnail(outputPath, outputFilename);
            const webPath = `/clips/${outputFilename}`;
            await db.run('INSERT INTO clips (unique_id, project_id, name, filepath, thumbnail, source_video_id, duration, start_time, end_time, x, y, is_event_clip, is_game_over) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)',
                [clipId, projectId, name, webPath, thumbnail, sourceId, duration, start, end, 150, 150]);
            res.json({ success: true, clipId });
        } catch (renderErr) {
            console.error('Clip render error:', renderErr);
            const errorMessage = renderErr?.code === 'FFMPEG_TIMEOUT'
                ? 'Render timed out'
                : 'Render Failed';
            res.status(renderErr?.code === 'FFMPEG_TIMEOUT' ? 504 : 500).json({ error: errorMessage });
        }
    } catch (err) {
        console.error('Clip creation error:', err);
        res.status(500).json({ error: 'Failed to create clip' });
    }
});

app.post('/api/update_event_logic', async (req, res) => {
    const { projectId, clipId, name, choices } = req.body;

    // FIX: Add input validation
    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!clipId || typeof clipId !== 'string') {
        return res.status(400).json({ error: 'Invalid clip ID' });
    }
    
    try {
        if(name) {
            await db.run('UPDATE clips SET name = ? WHERE unique_id = ?', [name, clipId]);
        }
        
        await db.run('DELETE FROM edges WHERE from_id = ?', [clipId]);

        const clip = await db.get('SELECT * FROM clips WHERE unique_id = ?', [clipId]);
        if(!clip) {
            return res.status(404).json({ error: 'Clip not found' });
        }

        const triggerTime = Math.max(0, clip.duration - 0.2);
        const logicId = uuidv4();

        if (choices && Array.isArray(choices)) {
            for (const choice of choices) {
                await db.run(`INSERT INTO edges (project_id, from_id, to_id, label, text_color, trigger_time, logic_id, return_to_main, set_var, req_var) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                [projectId, clipId, choice.toId || null, choice.label || 'Option', choice.color || '#ffffff', triggerTime, logicId, choice.returnToMain ? 1 : 0, choice.setVar || '', choice.reqVar || '']); 
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Update event logic error:', err);
        // FIX 7: Don't expose err.message in production
        res.status(500).json({ error: 'Failed to update event logic' });
    }
});

app.post('/api/create_event_clip', async (req, res) => {
    const { projectId, sourceId, start, end, name, choices } = req.body;

    // FIX: Add input validation
    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!validateProjectId(sourceId)) {
        return res.status(400).json({ error: 'Invalid source video ID' });
    }
    if (!name || typeof name !== 'string' || name.length > 200) {
        return res.status(400).json({ error: 'Invalid clip name' });
    }
    if (isNaN(parseFloat(start)) || isNaN(parseFloat(end))) {
        return res.status(400).json({ error: 'Invalid time values' });
    }

    try {
        const video = await db.get('SELECT * FROM videos WHERE id = ?', [sourceId]);
        if (!video) {
            return res.status(404).json({ error: 'Source video not found' });
        }
        
        const sourcePath = path.join(__dirname, 'public', video.filepath);
        if (!await fs.pathExists(sourcePath)) {
            return res.status(404).json({ error: 'Source video file not found' });
        }
        
        const clipId = uuidv4();
        const outputFilename = `event_${clipId}.mp4`;
        const outputPath = path.join(__dirname, 'public/clips', outputFilename);
        
        let duration = parseFloat(end) - parseFloat(start);
        if(duration < 0.2) duration = 0.5;

        let command = ffmpeg(sourcePath).setStartTime(start).setDuration(duration);

        command.videoCodec('libx264').audioCodec('aac').outputOptions('-preset ultrafast').output(outputPath);

        try {
            await runFfmpegCommand(command, 300000);
            const thumbnail = await generateThumbnail(outputPath, outputFilename);
            const webPath = `/clips/${outputFilename}`;

            await db.run('INSERT INTO clips (unique_id, project_id, name, filepath, thumbnail, source_video_id, duration, start_time, end_time, is_event_clip, x, y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [clipId, projectId, name, webPath, thumbnail, sourceId, duration, start, end, 200, 200]);

            const logicId = uuidv4();
            const triggerTime = Math.max(0, duration - 0.2);

            if (choices && choices.length > 0) {
                for (const choice of choices) {
                    await db.run('INSERT INTO edges (project_id, from_id, to_id, label, text_color, trigger_time, logic_id, return_to_main, set_var, req_var) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [projectId, clipId, choice.toId || null, choice.label || 'Option', choice.color || '#ffffff', triggerTime, logicId, choice.returnToMain ? 1 : 0, choice.setVar, choice.reqVar]);
                }
            }
            res.json({ success: true, clipId });
        } catch (renderErr) {
            console.error('Event clip render error:', renderErr);
            const errorMessage = renderErr?.code === 'FFMPEG_TIMEOUT'
                ? 'Render timed out'
                : 'Render Failed';
            res.status(renderErr?.code === 'FFMPEG_TIMEOUT' ? 504 : 500).json({ error: errorMessage });
        }
    } catch (err) {
        console.error('Event clip creation error:', err);
        res.status(500).json({ error: 'Failed to create event clip' });
    }
});

app.post('/api/clip/positions', async (req, res) => {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ error: 'Invalid updates data' });
    }

    // FIX 6: Validate each update
    for (const u of updates) {
        if (!validateUuid(u.id)) {
            return res.status(400).json({ error: 'Invalid clip ID' });
        }
        if (typeof u.x !== 'number' || typeof u.y !== 'number' || isNaN(u.x) || isNaN(u.y)) {
            return res.status(400).json({ error: 'Invalid position values' });
        }
    }

    try {
        for(const u of updates) {
            await db.run('UPDATE clips SET x = ?, y = ? WHERE unique_id = ?', [u.x, u.y, u.id]);
        }
        res.json({ success: true });
    } catch(err) {
        console.error('Error updating positions:', err);
        res.status(500).json({ error: 'Failed to update positions' });
    }
});

app.post('/api/clip/update', async (req, res) => {
    // FIX 6: Input validation
        const {
            id,
            name,
            isGameOver,
            chapterName,
            titleCard,
            subtitleText,
            sceneNotes,
            presetId,
            bgMusic,
            muteAudio
        } = req.body;
    if (!validateUuid(id)) {
        return res.status(400).json({ error: 'Invalid clip ID' });
    }
    if (typeof name !== 'string' || name.length > 200) {
        return res.status(400).json({ error: 'Invalid name' });
    }
    try {
        await db.run(
            `UPDATE clips SET
                name = ?,
                is_game_over = ?,
                chapter_name = ?,
                title_card = ?,
                subtitle_text = ?,
                scene_notes = ?,
                preset_id = ?,
                bg_music = ?,
                mute_audio = ?
            WHERE unique_id = ?`,
            [
                name,
                isGameOver ? 1 : 0,
                normalizeNullableText(chapterName, 120),
                normalizeNullableText(titleCard, 240),
                normalizeNullableText(subtitleText, 1200),
                normalizeNullableText(sceneNotes, 2000),
                normalizeNullableText(presetId, 120),
                normalizeNullableText(bgMusic, 300),
                isTruthyFlag(muteAudio) ? 1 : 0,
                id
            ]
        );
        res.json({ success: true });
    } catch(err) {
        console.error('Error updating clip:', err);
        res.status(500).json({ error: 'Failed to update clip' });
    }
});

app.post('/api/clip/thumbnail', async (req, res) => {
    // FIX 6: Input validation
    const { id, time } = req.body;

    if (!validateUuid(id)) {
        return res.status(400).json({ error: 'Invalid clip ID' });
    }
    if (typeof time !== 'string' && typeof time !== 'number') {
        return res.status(400).json({ error: 'Invalid time' });
    }

    try {
        const clip = await db.get('SELECT * FROM clips WHERE unique_id = ?', [id]);
        if(!clip) {
            return res.status(404).json({error: "Clip not found"});
        }

        // FIX 2: Path validation
        const fullPath = safePath(path.join(__dirname, 'public'), clip.filepath);
        if (!fullPath || !await fs.pathExists(fullPath)) {
            return res.status(404).json({error: "Clip file not found"});
        }

        const filename = path.basename(clip.filepath);
        const newThumb = await generateThumbnail(fullPath, filename, time);

        if (newThumb) {
            await db.run('UPDATE clips SET thumbnail = ? WHERE unique_id = ?', [newThumb, id]);
            res.json({ success: true, thumbnail: newThumb });
        } else {
            res.status(500).json({ error: 'Failed to generate thumbnail' });
        }
    } catch(err) {
        console.error('Thumbnail generation error:', err);
        // FIX 7: Don't expose err.message in production
        res.status(500).json({ error: 'Failed to generate thumbnail' });
    }
});

app.get('/api/story', async (req, res) => {
    try {
        const projectId = req.query.projectId || 1;
        // FIX 6: Input validation
        if (!validateProjectId(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        const clips = await db.all('SELECT * FROM clips WHERE project_id = ? ORDER BY id DESC', [projectId]);
        const edges = await db.all('SELECT * FROM edges WHERE project_id = ? ORDER BY trigger_time ASC', [projectId]);
        const presets = await db.all('SELECT * FROM scene_presets WHERE project_id = ? ORDER BY name COLLATE NOCASE ASC', [projectId]);
        res.json({ clips, edges, presets });
    } catch(err) {
        console.error('Error fetching story data:', err);
        res.status(500).json({ error: 'Failed to fetch story data' });
    }
});

app.post('/api/story/diagnostics', async (req, res) => {
    const { projectId, sequence } = req.body;

    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (sequence !== undefined && !Array.isArray(sequence)) {
        return res.status(400).json({ error: 'Invalid story sequence' });
    }

    try {
        const clips = await db.all('SELECT * FROM clips WHERE project_id = ?', [projectId]);
        const edges = await db.all('SELECT * FROM edges WHERE project_id = ? ORDER BY trigger_time ASC', [projectId]);
        const analyticsRows = await db.all(
            "SELECT target_clip_id, COUNT(*) as count FROM analytics WHERE project_id = ? AND source = ? AND event_type = 'scene_view' GROUP BY target_clip_id",
            [projectId, 'published']
        );

        const diagnostics = buildStoryDiagnostics({
            clips,
            edges,
            analyticsRows,
            sequence: Array.isArray(sequence) ? sequence : []
        });

        res.json(diagnostics);
    } catch (err) {
        console.error('Error building story diagnostics:', err);
        res.status(500).json({ error: 'Failed to build story diagnostics' });
    }
});

app.post('/api/save_logic_block', async (req, res) => {
    const { projectId, fromId, logicId, triggerTime, choices, bgMusic, muteAudio, behaviorType, timeoutSeconds, timeoutToId } = req.body;

    // FIX: Add input validation
    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!fromId || typeof fromId !== 'string') {
        return res.status(400).json({ error: 'Invalid from ID' });
    }
    if (isNaN(parseFloat(triggerTime))) {
        return res.status(400).json({ error: 'Invalid trigger time' });
    }

    const newLogicId = logicId || uuidv4();

    try {
        await db.run('UPDATE clips SET bg_music = ?, mute_audio = ? WHERE unique_id = ?', [bgMusic, muteAudio ? 1 : 0, fromId]);

        if(logicId) {
            await db.run('DELETE FROM edges WHERE logic_id = ?', [logicId]);
        } else {
            // --- FIX 7: FLOATING POINT SAFETY ---
            // Rely on range deletion for safety if UUID not present, but broadened slightly
            await db.run('DELETE FROM edges WHERE from_id = ? AND trigger_time BETWEEN ? AND ?', [fromId, triggerTime - 0.05, triggerTime + 0.05]);
        }

        if (choices && Array.isArray(choices)) {
            for (const choice of choices) {
                const resolvedBehaviorType = behaviorType || choice.behaviorType || 'menu';
                const resolvedTimeoutSeconds = Number.isFinite(timeoutSeconds) ? timeoutSeconds : (choice.timeoutSeconds || 0);
                const resolvedTimeoutToId = timeoutToId || choice.timeoutToId || null;
                const overlayMode = normalizeChoiceOverlayMode(choice.overlayMode);
                const overlayAsset = overlayMode === 'hotspot'
                    ? normalizeNullableText(choice.overlayAsset, 500)
                    : null;
                await db.run(`INSERT INTO edges (project_id, from_id, to_id, label, text_color, trigger_time, logic_id, return_to_main, set_var, req_var, timeout_seconds, timeout_to_id, is_dead_end, behavior_type, qte_duration, qte_target_id, character_name, relationship_change, achievement_id, is_hidden, overlay_mode, overlay_asset, overlay_x, overlay_y, overlay_width, overlay_height, overlay_fit, overlay_focus_x, overlay_focus_y)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [projectId, fromId, choice.toId || null, choice.label || 'Choice', choice.color || '#ffffff', triggerTime, newLogicId,
                    choice.return ? 1 : 0, choice.setVar, choice.reqVar,
                    resolvedTimeoutSeconds, resolvedTimeoutToId, choice.isDeadEnd ? 1 : 0,
                    resolvedBehaviorType, choice.qteDuration || 0, choice.qteTargetId || null,
                    choice.characterName || null, choice.relationshipChange || 0, choice.achievementId || null,
                    choice.isHidden ? 1 : 0, overlayMode, overlayAsset,
                    clampNumber(choice.overlayX, 0, 100, 50),
                    clampNumber(choice.overlayY, 0, 100, 50),
                    clampNumber(choice.overlayWidth, 4, 90, 22),
                    clampNumber(choice.overlayHeight, 4, 90, 18),
                    normalizeChoiceOverlayFit(choice.overlayFit),
                    clampNumber(choice.overlayFocusX, 0, 100, 50),
                    clampNumber(choice.overlayFocusY, 0, 100, 50)]);
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Save logic block error:', err);
        // FIX 7: Don't expose err.message in production
        res.status(500).json({ error: 'Failed to save logic block' });
    }
});

app.post('/api/delete_logic_block', async (req, res) => { 
    const { logicId, fromId, triggerTime } = req.body; 
    
    try { 
        // --- FIX 7: PRIORITIZE UUID ---
        if (logicId && !logicId.startsWith('legacy_')) {
            await db.run('DELETE FROM edges WHERE logic_id = ?', [logicId]); 
        } else {
            // Fallback for old data
            await db.run('DELETE FROM edges WHERE from_id = ? AND trigger_time BETWEEN ? AND ?', [fromId, triggerTime - 0.02, triggerTime + 0.02]); 
        }
        res.json({ success: true });
    } catch(err) {
        console.error('Delete logic block error:', err);
        // FIX 7: Don't expose err.message in production
        res.status(500).json({ error: 'Failed to delete logic block' });
    }
});

// --- PUBLISH ENGINE ---
app.post('/api/publish', async (req, res) => {
    const { projectId, title, sequence } = req.body;
    
    // FIX 6: Input validation
    if (!validateProjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!validateTitle(title)) {
        return res.status(400).json({ error: 'Invalid title' });
    }
    if (!sequence || !Array.isArray(sequence) || sequence.length === 0) {
        return res.status(400).json({ error: 'Missing required fields or empty sequence' });
    }

    try {
        const project = await db.get('SELECT * FROM projects WHERE id = ?', [projectId]);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // FIX 1: Escape HTML to prevent XSS in published player
        const safeTitle = escapeHtml(title);
        let themeColor = project.theme_color || '#3b82f6';
        // Validate and sanitize themeColor
        if (!validateColor(themeColor)) {
            themeColor = '#3b82f6';
        }
        themeColor = escapeHtml(themeColor);

        const exportStamp = Date.now();
        const exportName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${projectId}_${exportStamp}`;
        const exportPath = path.join(__dirname, 'public/exports', exportName);
        
        await fs.ensureDir(exportPath); 
        await fs.ensureDir(path.join(exportPath, 'clips')); 
        await fs.ensureDir(path.join(exportPath, 'audio'));
        
        // --- FIX 1: EXPORT BLOAT ---
        // Fetch only used assets
        let allClips = await db.all('SELECT * FROM clips WHERE project_id = ?', [projectId]);
        const edges = await db.all('SELECT * FROM edges WHERE project_id = ? ORDER BY trigger_time ASC', [projectId]);

        const usedClipIds = new Set();
        // 1. Clips in main sequence
        sequence.forEach(item => usedClipIds.add(item.id));
        // 2. Clips referenced in choices (targets)
        edges.forEach(e => {
            if (e.to_id) usedClipIds.add(e.to_id);
            if (e.from_id && usedClipIds.has(e.from_id)) usedClipIds.add(e.from_id); // Validation check
        });
        
        // Filter clips. Explicitly exclude 'FULL:' source clips unless strictly needed
        const clips = allClips.filter(c => usedClipIds.has(c.unique_id));
        // ---------------------------

        // Copy files and update paths
        for (const clip of clips) {
            const src = path.join(__dirname, 'public', clip.filepath); 
            const filename = path.basename(clip.filepath); 
            const dest = path.join(exportPath, 'clips', filename);
            
            if(await fs.pathExists(src)) { 
                await fs.copy(src, dest); 
                clip.filepath = `clips/${filename}`; 
            }
            
            if(clip.thumbnail) { 
                const thumbName = path.basename(clip.thumbnail); 
                const thumbSrc = path.join(__dirname, 'public', clip.thumbnail);
                if(await fs.pathExists(thumbSrc)) { 
                    await fs.copy(thumbSrc, path.join(exportPath, 'clips', thumbName)); 
                    clip.thumbnail = `clips/${thumbName}`; 
                } 
            }
            
            // --- FIX 9: ROBUST PATH HANDLING ---
            if(clip.bg_music) { 
                // Handle cases where path might be absolute or relative or hardcoded
                const cleanPath = clip.bg_music.replace(/^\/+/, ''); // Remove leading slashes
                const audSrc = path.join(__dirname, 'public', cleanPath); 
                const audName = path.basename(clip.bg_music); 
                
                if(await fs.pathExists(audSrc)) { 
                    await fs.copy(audSrc, path.join(exportPath, 'audio', audName)); 
                    clip.bg_music = `audio/${audName}`; 
                } 
            }
        }

        // Fetch achievements
        const achievements = await db.all('SELECT * FROM achievements WHERE project_id = ?', [projectId]);

        // FIX: Color validation helper to prevent XSS in style bindings
        const sanitizeColor = (color) => {
            if (!color || typeof color !== 'string') return '#ffffff';
            // Only allow valid hex colors
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
            return '#ffffff'; // Default to white if invalid
        };

        const logicBlocks = {};
        edges.forEach(e => {
            if(!e.to_id) return;
            const key = e.logic_id || `time_${e.trigger_time}_${e.from_id}`;
            const edgeTimeoutSeconds = Number(e.timeout_seconds) || 0;
            if(!logicBlocks[key]) {
                logicBlocks[key] = {
                    id: key,
                    from: e.from_id,
                    time: e.trigger_time,
                    choices: [],
                    behaviorType: e.behavior_type || 'menu',
                    timeoutSeconds: edgeTimeoutSeconds,
                    timeoutToId: e.timeout_to_id || null
                };
            }
            if ((!logicBlocks[key].behaviorType || logicBlocks[key].behaviorType === 'menu') && e.behavior_type) {
                logicBlocks[key].behaviorType = e.behavior_type;
            }
            if ((!logicBlocks[key].timeoutSeconds || logicBlocks[key].timeoutSeconds <= 0) && edgeTimeoutSeconds > 0) {
                logicBlocks[key].timeoutSeconds = edgeTimeoutSeconds;
            }
            if (!logicBlocks[key].timeoutToId && e.timeout_to_id) {
                logicBlocks[key].timeoutToId = e.timeout_to_id;
            }
            logicBlocks[key].choices.push({
                to: e.to_id, label: e.label, color: sanitizeColor(e.text_color), return: !!e.return_to_main, setVar: e.set_var, reqVar: e.req_var,
                isDeadEnd: !!e.is_dead_end, qteDuration: e.qte_duration || 0, qteTargetId: e.qte_target_id,
                characterName: e.character_name, relationshipChange: e.relationship_change || 0,
                achievementId: e.achievement_id, isHidden: !!e.is_hidden,
                overlayMode: e.overlay_mode || 'card',
                overlayAsset: e.overlay_asset || '',
                overlayX: e.overlay_x ?? 50,
                overlayY: e.overlay_y ?? 50,
                overlayWidth: e.overlay_width ?? 22,
                overlayHeight: e.overlay_height ?? 18,
                overlayFit: e.overlay_fit || 'cover',
                overlayFocusX: e.overlay_focus_x ?? 50,
                overlayFocusY: e.overlay_focus_y ?? 50
            });
        });

        const clipsB64 = Buffer.from(JSON.stringify(clips)).toString('base64');
        const blocksB64 = Buffer.from(JSON.stringify(Object.values(logicBlocks))).toString('base64');
        const playlistB64 = Buffer.from(JSON.stringify(sequence || [])).toString('base64');
        const achievementsB64 = Buffer.from(JSON.stringify(achievements)).toString('base64');

        // PUBLISH TEMPLATE
        const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${safeTitle}</title><script src="https://unpkg.com/vue@3/dist/vue.global.js"></script><script src="https://cdn.tailwindcss.com"></script><style>
        body{background:radial-gradient(circle at top right,#1e1b4b,#020617);color:#fff;font-family:'Inter',sans-serif;overflow:hidden;user-select:none}
        .overlay{background:rgba(0,0,0,0.7);backdrop-filter:blur(10px)}
        .glass-panel{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(12px);border-radius:1rem}
        .choice-card{transition:all 0.3s;cursor:pointer;border:1px solid rgba(255,255,255,0.1);position:relative;overflow:hidden}
        .choice-card:hover{transform:scale(1.05);border-color:${themeColor};box-shadow:0 0 25px ${themeColor}66}
        .choice-card.locked{opacity:0.5;filter:grayscale(1);cursor:not-allowed}
        .choice-live-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.82;transform:scale(1.02);filter:saturate(0.92) contrast(1.04) brightness(0.78);transition:transform .35s ease,opacity .35s ease,filter .35s ease;pointer-events:none}
        .choice-card:hover .choice-live-video{opacity:0.98;transform:scale(1.08);filter:saturate(1) contrast(1.06) brightness(0.94)}
        .choice-live-pill{position:absolute;top:10px;left:10px;z-index:4;padding:5px 8px;border-radius:999px;background:rgba(2,6,23,0.75);border:1px solid rgba(255,255,255,0.12);font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:#e0f2fe;backdrop-filter:blur(12px)}
        .choice-card-copy{position:absolute;left:0;bottom:0;width:100%;padding:14px;background:linear-gradient(to top, rgba(2,6,23,0.94), rgba(2,6,23,0.12));z-index:3}
        .choice-card-caption{margin-top:6px;font-size:11px;line-height:1.35;color:rgba(226,232,240,0.82)}
        .choice-hotspot-stage{position:absolute;pointer-events:none;z-index:52}
        .choice-hotspot{position:absolute;display:block;transform:translate(-50%,-50%);border:none;background:transparent;padding:0;cursor:pointer;pointer-events:auto;transition:transform .24s ease,filter .24s ease,box-shadow .24s ease}
        .choice-hotspot:hover{transform:translate(-50%,-50%) scale(1.04);filter:drop-shadow(0 16px 36px rgba(14,165,233,0.32))}
        .choice-hotspot.locked{cursor:not-allowed;filter:grayscale(1) opacity(0.66)}
        .choice-hotspot-media{position:relative;width:100%;height:100%;overflow:hidden;border-radius:22px;border:2px solid rgba(255,255,255,0.24);background:rgba(15,23,42,0.36);box-shadow:0 18px 48px rgba(2,6,23,0.48)}
        .choice-hotspot-img{width:100%;height:100%;display:block}
        .choice-hotspot-label{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);max-width:calc(100% - 20px);padding:7px 10px;border-radius:999px;background:rgba(2,6,23,0.82);border:1px solid rgba(255,255,255,0.16);font-size:10px;line-height:1.2;font-weight:700;color:#fff;letter-spacing:.04em;backdrop-filter:blur(14px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .choice-hotspot-pill{position:absolute;top:10px;right:10px;padding:5px 8px;border-radius:999px;background:rgba(14,165,233,0.18);border:1px solid rgba(125,211,252,0.28);font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:#dbeafe;backdrop-filter:blur(12px)}
        .choice-hotspot-lock{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,0.58);backdrop-filter:blur(3px);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#fff}
        .choice-overlay-scrim{position:absolute;inset:0;z-index:50}
        .choice-overlay-scrim.is-light{background:linear-gradient(to top, rgba(2,6,23,0.18), rgba(2,6,23,0.04))}
        .choice-overlay-scrim.is-heavy{background:rgba(0,0,0,0.58);backdrop-filter:blur(4px)}
        .choice-card-row{position:absolute;left:0;right:0;bottom:42px;z-index:53;display:flex;flex-wrap:wrap;gap:24px;justify-content:center;padding:0 40px}
        .choice-overlay-header{position:absolute;top:26px;left:50%;transform:translateX(-50%);z-index:54;display:flex;flex-direction:column;align-items:center;gap:14px;pointer-events:none}
        .choice-overlay-status{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
        .choice-overlay-badge{padding:10px 18px;border-radius:999px;background:rgba(2,6,23,0.84);border:1px solid rgba(255,255,255,0.12);font-size:13px;font-weight:700;color:#fff;backdrop-filter:blur(18px)}
        .video-wrapper{position:absolute;inset:0;background:black;display:flex;align-items:center;justify-content:center}
        .video-wrapper.fade-transition { transition: opacity 0.5s ease-in-out; }
        .video-wrapper.fade-out { opacity: 0; }
        .video-wrapper.fade-in { opacity: 1; }
        .controls-bar{position:absolute;bottom:0;left:0;width:100%;background:linear-gradient(to top, rgba(0,0,0,0.9), transparent);padding:20px 20px calc(20px + env(safe-area-inset-bottom, 0px));display:flex;align-items:center;gap:15px;opacity:0;transition:opacity 0.3s; z-index:40}
        .controls-bar:hover, .video-wrapper:hover .controls-bar {opacity:1}
        .timeline-track{flex:1;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;cursor:pointer;position:relative}
        .timeline-fill{height:100%;background:${themeColor};border-radius:3px;position:absolute;top:0;left:0}
        .thumb-knob{width:12px;height:12px;background:white;border-radius:50%;position:absolute;top:-3px;margin-left:-6px;pointer-events:none}
        .timeline-marker{width:8px;height:8px;background:#fbbf24;border-radius:50%;position:absolute;top:-1px;transform:translateX(-50%);z-index:5;pointer-events:none;box-shadow:0 0 4px #fbbf24}
        .vol-slider{width:80px;height:4px;accent-color:${themeColor}}
        .chapter-badge{position:absolute;top:16px;left:16px;z-index:45;border:1px solid rgba(125,211,252,0.35);background:rgba(14,116,144,0.18);padding:10px 14px;border-radius:999px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:#e0f2fe;backdrop-filter:blur(14px)}
        .title-card{position:absolute;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;pointer-events:none}
        .title-card-panel{padding:28px 36px;border-radius:28px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.12);backdrop-filter:blur(18px);text-align:center;box-shadow:0 24px 80px rgba(0,0,0,0.45)}
        .title-card-kicker{font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#94a3b8;font-weight:700}
        .title-card-text{margin-top:10px;font-size:clamp(28px, 4vw, 54px);font-weight:800;color:#fff}
        .subtitle-card{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);z-index:45;width:min(92vw,760px);padding:14px 18px;border-radius:20px;background:rgba(0,0,0,0.64);border:1px solid rgba(255,255,255,0.1);backdrop-filter:blur(16px);text-align:center;font-size:15px;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,0.45)}
        
        .seen-segment { position: absolute; height: 100%; background: rgba(100, 116, 139, 0.5); z-index: 4; pointer-events: none; border-left: 1px solid rgba(255,255,255,0.1); border-right: 1px solid rgba(255,255,255,0.1); }
        .seen-segment::after { content:''; display:block; height:100%; width:100%; background-image: linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.05) 75%, transparent 75%, transparent); background-size: 8px 8px; }

        .loading{position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:1000;flex-direction:column;gap:20px}
        .spinner{width:50px;height:50px;border:4px solid rgba(255,255,255,0.1);border-top-color:${themeColor};border-radius:50%;animation:spin 1s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .game-over{background:rgba(0,0,0,0.9);backdrop-filter:blur(15px);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;animation:fadeIn 1s}
        .glitch{font-size:4rem;font-weight:bold;color:#ef4444;text-shadow:2px 2px #000;animation:glitch 1s infinite}
        .app-banner{position:absolute;top:18px;left:50%;transform:translateX(-50%);z-index:85;display:flex;align-items:flex-start;gap:12px;width:min(92vw,680px);padding:14px 16px;border-radius:18px;background:rgba(15,23,42,0.9);border:1px solid rgba(248,113,113,0.42);box-shadow:0 18px 40px rgba(0,0,0,0.4);backdrop-filter:blur(16px)}
        .app-banner.is-info{border-color:rgba(125,211,252,0.35)}
        .app-banner-body{flex:1;min-width:0}
        .app-banner-title{font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:#fecaca}
        .app-banner.is-info .app-banner-title{color:#bae6fd}
        .app-banner-message{margin-top:6px;font-size:14px;line-height:1.45;color:#f8fafc}
        .app-banner-close{border:none;background:rgba(255,255,255,0.08);color:#e2e8f0;border-radius:999px;width:32px;height:32px;display:grid;place-items:center;font-size:16px;cursor:pointer;flex-shrink:0}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes glitch{0%{transform:translate(0)}20%{transform:translate(-2px,2px)}40%{transform:translate(-2px,-2px)}60%{transform:translate(2px,2px)}80%{transform:translate(2px,-2px)}100%{transform:translate(0)}}
        @media (max-width: 768px){
            .controls-bar{opacity:1;flex-wrap:wrap;gap:12px;padding-left:14px;padding-right:14px}
            .timeline-track{order:3;width:100%;flex-basis:100%}
            .choice-card{width:min(92vw,340px)!important;height:auto!important;min-height:150px}
            .choice-card-row{bottom:26px;padding:0 18px}
            .choice-overlay-header{top:18px;gap:10px}
            .choice-overlay-badge{padding:8px 14px;font-size:12px}
            .choice-hotspot-label{bottom:8px;font-size:9px}
            .subtitle-card{bottom:132px;font-size:13px}
            .chapter-badge{top:12px;left:12px}
            .app-banner{top:12px;padding:12px 14px}
            .app-banner-message{font-size:13px}
        }
        [v-cloak]{display:none}
        </style></head><body class="h-screen w-screen flex items-center justify-center">
        <div id="app" class="w-full h-full relative" v-cloak>
            <div v-if="loading" class="loading"><div class="spinner"></div><div class="text-white text-lg">Loading...</div></div>
            <div v-if="banner.show" class="app-banner" :class="'is-' + banner.type" role="status" aria-live="polite">
                <div class="app-banner-body">
                    <div class="app-banner-title">{{ banner.type === 'info' ? 'Notice' : 'Playback Issue' }}</div>
                    <div class="app-banner-message">{{ banner.text }}</div>
                </div>
                <button @click="clearBanner" class="app-banner-close" aria-label="Dismiss message">X</button>
            </div>
            <div v-if="!started && !loading" class="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center gap-6"><h1 class="text-4xl font-bold mb-4 drop-shadow-lg">${safeTitle}</h1><button @click="startMovie(false)" class="px-8 py-4 bg-white text-black font-bold rounded-full hover:scale-105 transition text-xl shadow-xl w-64">Start Movie</button><button v-if="hasSave" @click="startMovie(true)" class="px-8 py-4 bg-gray-800 text-white border border-gray-600 font-bold rounded-full hover:scale-105 transition text-xl shadow-xl w-64">Resume</button></div>
            <div class="video-wrapper">
                <video ref="player" class="max-w-full max-h-full object-contain" @timeupdate="onTimeUpdate" @durationchange="onDurationChange" @ended="onClipEnded" @click="togglePlay" @error="handleVideoError" playsinline webkit-playsinline></video>
                <div v-if="currentClip && currentClip.chapter_name" class="chapter-badge">{{ currentClip.chapter_name }}</div>
                <div v-if="titleCardText" class="title-card">
                    <div class="title-card-panel">
                        <div class="title-card-kicker">Title Card</div>
                        <div class="title-card-text">{{ titleCardText }}</div>
                    </div>
                </div>
                <div class="controls-bar" v-if="started && !showChoices && !isGameOver">
                    <button @click="togglePlay" class="text-xs w-16 hover:text-blue-400">{{ isPaused ? 'Play' : 'Pause' }}</button>
                    <div class="timeline-track" @click="seek">
                        <div class="timeline-fill" :style="{width: progress+'%'}"></div>
                        <div class="thumb-knob" :style="{left: progress+'%'}"></div>
                        
                        <div v-for="(seg, idx) in seenSegments" :key="'pseen-'+idx" class="seen-segment" 
                              :style="{left: (seg.start/duration*100) + '%', width: ((seg.end-seg.start)/duration*100) + '%'}" 
                              title="Skipped Segment">
                         </div>
                        
                        <div v-for="m in markers" class="timeline-marker" :style="{left: m.pct+'%'}" :title="m.count+' choices'"></div>
                    </div>
                    <div class="text-xs font-mono">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</div>
                    
                    <button @click="smartSkipEnabled = !smartSkipEnabled" class="text-[9px] font-bold px-2 py-0.5 rounded transition border border-white/10 ml-2" :class="smartSkipEnabled ? 'bg-purple-600 text-white' : 'bg-white/5 text-slate-400'">Skip</button>

                    <span class="text-xs ml-2">Vol</span>
                    <input type="range" min="0" max="1" step="0.1" v-model="volume" @input="updateVolume" class="vol-slider">
                </div>
                <div v-if="currentClip && currentClip.subtitle_text && !isGameOver && !showChoices" class="subtitle-card">{{ currentClip.subtitle_text }}</div>
            </div>
            <audio ref="bgm" loop></audio>
            
            <div v-if="isGameOver" class="absolute inset-0 game-over">
                <h1 class="glitch mb-8">GAME OVER</h1>
                <p class="text-slate-400 mb-8 text-xl">Fate has chosen.</p>
                <button @click="restartFromFail" class="px-8 py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition text-lg shadow-[0_0_20px_rgba(255,255,255,0.3)]">Try Again</button>
            </div>

            <div v-if="showAchievement" class="absolute inset-0 z-[60] flex items-center justify-center bg-black/50" @click="showAchievement=null">
                <div class="glass-panel p-8 text-center animate-bounce">
                    <div class="text-6xl mb-4">{{ showAchievement.icon || '*' }}</div>
                    <div class="text-yellow-400 text-xl font-bold mb-2">ACHIEVEMENT UNLOCKED!</div>
                    <div class="text-white text-2xl font-bold">{{ showAchievement.name }}</div>
                    <div class="text-slate-400 text-sm mt-2">{{ showAchievement.description }}</div>
                </div>
            </div>

            <div v-if="showRelationship" class="absolute top-4 right-4 z-[60] glass-panel p-4">
                <div class="text-xs text-slate-400">Relationship</div>
                <div class="font-bold text-white">{{ showRelationship.name }}</div>
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
                        <div class="h-full transition-all" :class="showRelationship.value >= 50 ? 'bg-green-500' : 'bg-red-500'" :style="{width: showRelationship.value + '%'}"></div>
                    </div>
                    <span class="text-xs" :class="showRelationship.change > 0 ? 'text-green-400' : 'text-red-400'">{{ showRelationship.change > 0 ? '+' : ''}}{{ showRelationship.change }}</span>
                </div>
            </div>

            <div v-if="isQTE" class="absolute top-4 left-4 z-[60] glass-panel p-4 bg-red-900/50 border-red-500">
                <div class="text-red-400 font-bold text-xl">QTE! Press {{ qteKey }} Now!</div>
            </div>

            <div v-if="showChoices" class="absolute inset-0 z-50 animate-fade-in">
                <div class="choice-overlay-scrim" :class="overlayChoices.length ? 'is-light' : 'is-heavy'"></div>
                <div v-if="timeRemaining !== null || isQTE" class="choice-overlay-header">
                    <div class="choice-overlay-status">
                        <div v-if="timeRemaining !== null" class="choice-overlay-badge" :class="timeRemaining <= 3 ? 'bg-red-600 animate-pulse' : ''">
                            Timer {{ timeRemaining.toFixed(1) }}s
                        </div>
                        <div v-if="isQTE" class="choice-overlay-badge">
                            QTE {{ qteKey || 'Space' }}
                        </div>
                    </div>
                </div>
                <div v-if="overlayChoices.length" class="choice-hotspot-stage" :style="getOverlayFrameStyle()">
                    <button
                        v-for="(ch, idx) in overlayChoices"
                        :key="'hotspot-'+idx"
                        @click="makeChoice(ch)"
                        class="choice-hotspot"
                        :class="{locked: isLocked(ch)}"
                        :style="getHotspotStyle(ch)"
                    >
                        <div class="choice-hotspot-media">
                            <img :src="ch.overlayAsset" class="choice-hotspot-img" :style="getHotspotImageStyle(ch)" @error="handleImageError">
                            <div class="choice-hotspot-pill">Hotspot</div>
                            <div class="choice-hotspot-label">{{ ch.label || getClipName(ch.to) }}</div>
                            <div v-if="isLocked(ch)" class="choice-hotspot-lock">Locked</div>
                        </div>
                    </button>
                </div>
                <div v-if="cardChoices.length" class="choice-card-row">
                    <div v-for="ch in cardChoices" @click="makeChoice(ch)" @mouseenter="playChoicePreview($event)" @mouseleave="stopChoicePreview($event)" class="glass-panel choice-card w-64 h-36 md:w-80 md:h-48 group" :class="{locked: isLocked(ch)}">
                        <video v-if="getPreview(ch.to)" :src="getPreview(ch.to)" :poster="getThumb(ch.to)" class="choice-live-video" muted loop playsinline preload="metadata" @loadedmetadata="primeChoicePreview"></video>
                        <img v-else-if="getThumb(ch.to)" :src="getThumb(ch.to)" class="choice-live-video" @error="handleImageError">
                        <div v-else class="absolute inset-0 bg-gray-800 flex items-center justify-center text-gray-500">No Preview</div>
                        <div class="choice-live-pill">Hover Preview</div>
                        <div class="choice-card-copy">
                            <div class="text-center font-bold text-lg tracking-wide" :style="{color: ch.color || '#fff'}">{{ch.label}}</div>
                            <div class="choice-card-caption text-center">{{ getClipName(ch.to) }}</div>
                        </div>
                        <div v-if="isLocked(ch)" class="absolute inset-0 flex items-center justify-center bg-black/60"><span class="text-sm font-bold">LOCKED</span></div>
                        <div v-if="ch.isHidden" class="absolute top-2 right-2 text-xs bg-purple-600 px-2 py-1 rounded">Secret</div>
                        <div v-if="ch.characterName" class="absolute top-2 left-2 text-xs bg-blue-600 px-2 py-1 rounded">Rel {{ ch.characterName }}</div>
                    </div>
                </div>
            </div>
        </div>
        <script>
        const CLIPS=JSON.parse(atob('${clipsB64}'));
        const BLOCKS=JSON.parse(atob('${blocksB64}'));
        const PLAYLIST=JSON.parse(atob('${playlistB64}'));
        const ACHIEVEMENTS=JSON.parse(atob('${achievementsB64}'));
        const PROJECT_ID=${projectId};
        const {createApp}=Vue; createApp({
            data(){return{
                loading:false,started:false, currentClip:null, activeBlocks:[], currentOptions:null, showChoices:false, historyStack:[], gameState:{}, isPlayingSubClip:false, hasSave:false, playlistIndex: 0, currentTime:0, duration:0, isPaused:false, volume:1, triggeredBlocks:new Set(), isGameOver:false, failSafeState: null,
                seenSegments: [], smartSkipEnabled: true, isManualSeeking: false,
                // NEW FEATURES
                relationships: {}, achievements: [], unlockedAchievements: new Set(), showAchievement: null,
                choiceTimer: null, timeRemaining: null, isQTE: false, qteKey: null, qtePressed: false,
                qteKeyHandler: null, showRelationship: null,
                titleCardText: '', titleCardTimer: null,
                banner:{show:false,text:'',type:'error'}, bannerTimer:null,
                // TRANSITION SETTING
                enableTransitions: true, transitionDuration: 500,
                layoutTick: 0
            }},
            computed:{
                currentChoices(){return this.currentOptions?this.currentOptions.choices:[]},
                overlayChoices(){return this.currentChoices.filter(choice => choice.overlayMode === 'hotspot' && choice.overlayAsset)},
                cardChoices(){return this.currentChoices.filter(choice => choice.overlayMode !== 'hotspot' || !choice.overlayAsset)},
                progress(){return this.duration ? (this.currentTime/this.duration)*100 : 0},
                markers(){
                    if(!this.duration) return [];
                    return this.activeBlocks.map(b => ({ pct: (b.time/this.duration)*100, count: b.choices.length }));
                }
            },
            mounted(){ 
                if(localStorage.getItem('studio_save_'+PROJECT_ID)) this.hasSave=true; 
                this.qteKeyHandler = (event) => this.handleQTE(event);
                window.addEventListener('beforeunload', this.saveGame);
                window.addEventListener('resize', this.refreshOverlayLayout);
            },
            beforeUnmount() {
                window.removeEventListener('beforeunload', this.saveGame);
                window.removeEventListener('resize', this.refreshOverlayLayout);
                this.closeChoiceOverlay();
                this.cleanupVideo();
                this.clearTitleCard();
                this.clearBanner();
            },
            methods:{
                handleVideoError(e){
                    console.error('Video error:', e);
                    this.loading = false;
                    this.showBanner('Error loading video. Please check your connection and try again.');
                },
                handleImageError(e){ e.target.style.display = 'none'; },
                refreshOverlayLayout(){
                    this.layoutTick += 1;
                },
                getChoicePreviewVideo(target){
                    const root = target?.currentTarget || target?.target || target;
                    if(!root) return null;
                    if(typeof root.matches === 'function' && root.matches('video.choice-live-video')) {
                        return root;
                    }
                    return root.querySelector?.('video.choice-live-video') || null;
                },
                primeChoicePreview(event){
                    const player = event?.target;
                    if(!player) return;
                    const seekTime = Math.min(0.35, player.duration || 0);
                    if(Number.isFinite(seekTime) && seekTime > 0) {
                        player.currentTime = seekTime;
                    }
                    player.pause?.();
                },
                playChoicePreview(event){
                    const player = this.getChoicePreviewVideo(event);
                    if(!player) return;
                    const seekTime = Math.min(0.35, player.duration || 0);
                    if(Number.isFinite(seekTime) && seekTime > 0 && player.currentTime < 0.01) {
                        player.currentTime = seekTime;
                    }
                    player.play?.().catch(() => {});
                },
                stopChoicePreview(event){
                    const player = this.getChoicePreviewVideo(event);
                    if(!player) return;
                    const seekTime = Math.min(0.35, player.duration || 0);
                    player.pause?.();
                    if(Number.isFinite(seekTime) && seekTime > 0) {
                        try {
                            player.currentTime = seekTime;
                        } catch(e) {}
                    }
                },
                showBanner(message, type='error', duration=5000){
                    if(this.bannerTimer){
                        clearTimeout(this.bannerTimer);
                        this.bannerTimer = null;
                    }
                    this.banner = { show: true, text: message, type: type === 'info' ? 'info' : 'error' };
                    if(duration > 0){
                        this.bannerTimer = setTimeout(() => {
                            this.clearBanner();
                        }, duration);
                    }
                },
                clearBanner(){
                    if(this.bannerTimer){
                        clearTimeout(this.bannerTimer);
                        this.bannerTimer = null;
                    }
                    this.banner = { show: false, text: '', type: 'error' };
                },
                trackAnalyticsEvent(eventType, label, target){
                    if(typeof target !== 'string' || !target || !navigator.onLine) return;
                    const payload = {
                        projectId: PROJECT_ID,
                        label: typeof label === 'string' && label.trim() ? label.trim() : undefined,
                        target,
                        source: 'published',
                        eventType
                    };
                    try {
                        fetch('/api/analytics/track', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            keepalive: eventType !== 'choice',
                            body: JSON.stringify(payload)
                        }).catch(() => {});
                    } catch(e) {}
                },
                closeChoiceOverlay(){
                    if(this.choiceTimer) {
                        clearInterval(this.choiceTimer);
                        this.choiceTimer = null;
                    }
                    this.timeRemaining = null;
                    const keyHandler = this.qteKeyHandler || this.handleQTE;
                    window.removeEventListener('keydown', keyHandler);
                    this.showChoices = false;
                    this.currentOptions = null;
                    this.isQTE = false;
                    this.qteKey = null;
                    this.qtePressed = false;
                },
                clearTitleCard(){
                    if(this.titleCardTimer){
                        clearTimeout(this.titleCardTimer);
                        this.titleCardTimer = null;
                    }
                    this.titleCardText = '';
                },
                showTitleCard(text){
                    this.clearTitleCard();
                    const normalized = typeof text === 'string' ? text.trim() : '';
                    if(!normalized) return;
                    this.titleCardText = normalized;
                    this.titleCardTimer = setTimeout(() => {
                        this.titleCardText = '';
                        this.titleCardTimer = null;
                    }, 2800);
                },
                normalizeQTEInput(input){
                    if(input === undefined || input === null) return '';
                    let normalized = String(input).trim().toLowerCase();
                    if(!normalized) return 'space';
                    if(normalized === ' ' || normalized === 'space' || normalized === 'spacebar') return 'space';
                    if(/^key[a-z]$/.test(normalized)) return normalized.slice(3);
                    if(/^digit[0-9]$/.test(normalized)) return normalized.slice(5);
                    return normalized;
                },
                cleanupVideo(){
                    this.clearTitleCard();
                    const v = this.$refs.player;
                    if(v) { v.pause(); v.removeAttribute('src'); v.load(); }
                    const a = this.$refs.bgm;
                    if(a) { a.pause(); a.removeAttribute('src'); }
                },
                startMovie(resume){
                    this.started=true;
                    if(resume){
                        try {
                            const save = JSON.parse(localStorage.getItem('studio_save_'+PROJECT_ID));
                            this.gameState=save.gameState || {};
                            this.historyStack=save.historyStack || [];
                            this.playlistIndex=save.playlistIndex||0;
                            this.failSafeState = save.failSafeState || null;
                            this.seenSegments = save.seenSegments || [];
                            this.smartSkipEnabled = save.smartSkipEnabled !== undefined ? save.smartSkipEnabled : true;
                            this.relationships = save.relationships || {};
                            this.unlockedAchievements = new Set(save.unlockedAchievements || []);
                            this.loadClip(save.currentId, save.currentTime || 0);
                        } catch(err) {
                            console.error('Error loading save:', err);
                            this.startMovie(false);
                        }
                    } else {
                        localStorage.removeItem('studio_save_'+PROJECT_ID);
                        this.playlistIndex = 0;
                        this.historyStack = [];
                        this.gameState = {};
                        this.failSafeState = null;
                        this.seenSegments = [];
                        this.relationships = {};
                        this.unlockedAchievements = new Set();
                        if(PLAYLIST.length > 0) this.loadClip(PLAYLIST[0].id);
                    }
                },
                togglePlay(){
                    if(this.isGameOver) return;
                    const v = this.$refs.player;
                    if(!v) return;
                    if(v.paused){ v.play().catch(e => console.error('Play error:', e)); this.isPaused=false; } else { v.pause(); this.isPaused=true; }
                },
                seek(e){
                    if(!this.duration || this.isGameOver) return;
                    
                    this.isManualSeeking = true;
                    setTimeout(() => this.isManualSeeking = false, 1500);

                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.currentTarget.getBoundingClientRect().width > 0) ? (e.clientX - rect.left) / rect.width : 0;
                    const v = this.$refs.player;
                    if(v) v.currentTime = pct * v.duration;
                },
                updateVolume(){ 
                    const v = this.$refs.player;
                    const a = this.$refs.bgm;
                    if(v) v.volume = this.volume; 
                    if(a) a.volume = this.volume * 0.3; 
                },
                getOverlayFrameStyle(){
                    void this.layoutTick;
                    const player = this.$refs.player;
                    if(!player) return { left:'50%', top:'50%', width:'100%', height:'100%', transform:'translate(-50%,-50%)' };
                    const width = player.clientWidth || player.videoWidth || 1;
                    const height = player.clientHeight || player.videoHeight || 1;
                    let frameWidth = width;
                    let frameHeight = height;
                    const sourceWidth = player.videoWidth || width;
                    const sourceHeight = player.videoHeight || height;
                    if(sourceWidth > 0 && sourceHeight > 0 && width > 0 && height > 0) {
                        const sourceRatio = sourceWidth / sourceHeight;
                        const boxRatio = width / height;
                        if(sourceRatio > boxRatio) {
                            frameWidth = width;
                            frameHeight = width / sourceRatio;
                        } else {
                            frameHeight = height;
                            frameWidth = height * sourceRatio;
                        }
                    }
                    return {
                        left:'50%',
                        top:'50%',
                        width: frameWidth + 'px',
                        height: frameHeight + 'px',
                        transform:'translate(-50%,-50%)'
                    };
                },
                getHotspotStyle(choice){
                    return {
                        left: Math.min(100, Math.max(0, Number(choice.overlayX ?? 50))) + '%',
                        top: Math.min(100, Math.max(0, Number(choice.overlayY ?? 50))) + '%',
                        width: Math.min(90, Math.max(4, Number(choice.overlayWidth ?? 22))) + '%',
                        height: Math.min(90, Math.max(4, Number(choice.overlayHeight ?? 18))) + '%'
                    };
                },
                getHotspotImageStyle(choice){
                    return {
                        objectFit: choice.overlayFit === 'contain' ? 'contain' : 'cover',
                        objectPosition: Math.min(100, Math.max(0, Number(choice.overlayFocusX ?? 50))) + '% ' + Math.min(100, Math.max(0, Number(choice.overlayFocusY ?? 50))) + '%'
                    };
                },
                formatTime(t){ const m=Math.floor(t/60); const s=Math.floor(t%60); return m+':'+s.toString().padStart(2,'0'); },
                saveGame(){
                    if(!this.started || !this.currentClip || this.isGameOver) return;
                    try {
                        const data = {
                            currentId: this.currentClip.unique_id,
                            currentTime: this.$refs.player?.currentTime || 0,
                            gameState: this.gameState,
                            historyStack: this.historyStack,
                            playlistIndex: this.playlistIndex,
                            failSafeState: this.failSafeState,
                            seenSegments: this.seenSegments,
                            smartSkipEnabled: this.smartSkipEnabled,
                            relationships: this.relationships,
                            unlockedAchievements: Array.from(this.unlockedAchievements)
                        };
                        localStorage.setItem('studio_save_'+PROJECT_ID, JSON.stringify(data));
                    } catch(err) { console.error('Error saving game:', err); }
                },
                
                // --- SMART SKIP LOGIC (PATCHED) ---
                mergeSeenSegments() {
                    if (this.seenSegments.length < 2) return;
                    this.seenSegments.sort((a, b) => a.start - b.start);
                    const merged = [];
                    let current = this.seenSegments[0];
                    for (let i = 1; i < this.seenSegments.length; i++) {
                        const next = this.seenSegments[i];
                        if (current.end >= next.start - 0.5) { 
                            current.end = Math.max(current.end, next.end);
                        } else {
                            merged.push(current);
                            current = next;
                        }
                    }
                    merged.push(current);
                    this.seenSegments = merged;
                },
                recordClipAsSeen(clipId, fromSourceId) {
                    const subClip = CLIPS.find(c => c.unique_id === clipId);
                    if(subClip && subClip.source_video_id === fromSourceId && !subClip.name.startsWith("FULL:")) {
                        this.seenSegments.push({ start: subClip.start_time, end: subClip.end_time });
                        this.mergeSeenSegments();
                        this.saveGame();
                    }
                },
                performSmartSkip(currentTime, player) {
                    if(!this.smartSkipEnabled || this.isManualSeeking) return;

                    for(const seg of this.seenSegments) {
                        // FIX 2: Dynamic buffer for short clips
                        const buffer = Math.min(0.5, (seg.end - seg.start) / 2);

                        if(currentTime >= seg.start && currentTime < seg.end - buffer) {
                            let targetTime = seg.end;

                            // FIX 3: Check for interactions inside the skipped area
                            // Find any active blocks (choices) that occur within this segment
                            const interactionInSegment = this.activeBlocks.find(b =>
                                b.time > currentTime && b.time < seg.end
                            );

                            if (interactionInSegment) {
                                // Do NOT skip past the choice. Stop just before it.
                                targetTime = Math.max(currentTime, interactionInSegment.time - 0.5);
                            }

                            // Only skip if the jump is significant
                            if (Math.abs(player.currentTime - targetTime) > 0.5) {
                                player.currentTime = targetTime;
                            }
                            return;
                        }
                    }

                    // NEW: Smart skip for source video - check if this clip's source has watched segments
                    if(this.currentClip && this.currentClip.source_video_id) {
                        for(const seg of this.seenSegments) {
                            if(seg.sourceId === this.currentClip.source_video_id) {
                                const buffer = Math.min(0.5, (seg.end - seg.start) / 2);
                                if(currentTime >= seg.start && currentTime < seg.end - buffer) {
                                    // Check for interactions in this segment
                                    const interactionInSegment = this.activeBlocks.find(b =>
                                        b.time > currentTime && b.time < seg.end
                                    );
                                    let targetTime = seg.end;
                                    if(interactionInSegment) {
                                        targetTime = Math.max(currentTime, interactionInSegment.time - 0.5);
                                    }
                                    if(Math.abs(player.currentTime - targetTime) > 0.5) {
                                        player.currentTime = targetTime;
                                    }
                                    return;
                                }
                            }
                        }
                    }
                },
                // -------------------------

                loadClip(id, forceTime=0){
                    const nextClip = CLIPS.find(c => c.unique_id === id);
                    const _this = this;

                    // FIX 4: Handle missing clips gracefully
                    if(!nextClip) {
                        console.warn('Clip not found, skipping:', id);
                        // Auto-advance to next playlist item if possible
                        if (this.playlistIndex < PLAYLIST.length - 1) {
                            this.playlistIndex++;
                            this.loadClip(PLAYLIST[this.playlistIndex].id);
                        } else {
                             this.showBanner('Scene missing. Game cannot continue.');
                        }
                        return;
                    }

                    this.loading = true;
                    this.closeChoiceOverlay();
                    const v = this.$refs.player;
                    if(!v) return;

                    this.isGameOver = false;
                    this.triggeredBlocks.clear();
                    this.seenSegments = this.seenSegments || [];

                    // NEW: Auto-mark clip ranges as seen for source video (Smart Skip for source video)
                    if(nextClip.source_video_id && nextClip.start_time !== undefined && nextClip.end_time !== undefined) {
                        const clipRange = { start: nextClip.start_time, end: nextClip.end_time, sourceId: nextClip.source_video_id };
                        // Check if this range is already in seenSegments
                        const alreadySeen = this.seenSegments.some(seg => seg.start === clipRange.start && seg.end === clipRange.end);
                        if(!alreadySeen) {
                            this.seenSegments.push(clipRange);
                            this.mergeSeenSegments();
                        }
                    }

                    // SCENE TRANSITION: Fade out current video before loading new clip
                    const performTransition = function() {
                        const wrapper = document.querySelector('.video-wrapper');
                        if(_this.enableTransitions && wrapper && _this.currentClip) {
                            wrapper.classList.add('fade-transition', 'fade-out');
                            return new Promise(resolve => setTimeout(resolve, _this.transitionDuration));
                        }
                        return Promise.resolve();
                    };

                    // Run transition then load clip
                    performTransition().then(function() {
                        setTimeout(function() {
                            _this.currentClip = nextClip;
                            _this.showTitleCard(nextClip.title_card);
                            _this.activeBlocks = BLOCKS.filter(b => b.from === id).sort((a,b)=>a.time-b.time);
                            if(forceTime > 0) _this.activeBlocks = _this.activeBlocks.filter(b => b.time > forceTime + 0.1);

                            v.src = nextClip.filepath;
                            // FIX 8: Force video element reload
                            v.load();

                            v.onloadedmetadata = function() {
                                v.muted = !!nextClip.mute_audio;
                                v.currentTime = forceTime;
                                v.volume = _this.volume;
                                _this.refreshOverlayLayout();
                                _this.loading = false;
                                _this.trackAnalyticsEvent('scene_view', nextClip.name || 'Scene view', nextClip.unique_id);
                                if(nextClip.is_game_over == 1 || nextClip.is_game_over === true) {
                                    _this.trackAnalyticsEvent('ending', nextClip.name || 'Ending reached', nextClip.unique_id);
                                }

                                // SCENE TRANSITION: Fade in the new video
                                const wrapper = document.querySelector('.video-wrapper');
                                if(_this.enableTransitions && wrapper) {
                                    wrapper.classList.remove('fade-out');
                                    wrapper.classList.add('fade-in');
                                }

                                v.play().then(function() {
                                    _this.isPaused=false;
                                    if(nextClip.bg_music) _this.playMusic(nextClip.bg_music);
                                    else _this.$refs.bgm.pause();
                                    _this.saveGame();

                                    // Remove fade-in class after transition completes
                                    if(_this.enableTransitions && wrapper) {
                                        setTimeout(function() {
                                            wrapper.classList.remove('fade-in');
                                        }, _this.transitionDuration);
                                    }
                                }).catch(function(e) {
                                    console.error("Play error:", e);
                                    _this.loading = false;
                                    _this.showBanner('Playback could not start automatically. Tap play to continue.', 'info');
                                });
                            };
                            v.onerror = function() {
                                _this.loading = false;
                                console.error('Error loading video:', nextClip.filepath);
                                _this.showBanner('Unable to load this scene. Please refresh and try again.');
                            };
                        }, _this.enableTransitions ? 50 : 100);
                    });
                },
                onDurationChange(){ this.duration = this.$refs.player?.duration || 0; },
                onTimeUpdate(){
                    const v=this.$refs.player;
                    if(!v) return;
                    this.currentTime = v.currentTime;

                    if(!this.isPlayingSubClip) {
                        this.performSmartSkip(this.currentTime, v);
                    }

                    if(this.showChoices || this.isGameOver || !this.activeBlocks.length) return;

                    const block = this.activeBlocks.find(b =>
                        v.currentTime >= b.time &&
                        v.currentTime < b.time + 1.5 &&
                        !this.triggeredBlocks.has(b.id)
                    );

                    if(block){
                        this.triggeredBlocks.add(block.id);
                        v.pause();
                        this.isPaused = true;
                        this.closeChoiceOverlay();
                        this.currentOptions = block;
                        this.showChoices=true;

                        // Timer-based choice
                        if(block.timeoutSeconds && block.timeoutSeconds > 0) {
                            this.timeRemaining = block.timeoutSeconds;
                            this.choiceTimer = setInterval(() => {
                                this.timeRemaining -= 0.1;
                                if(this.timeRemaining <= 0) {
                                    clearInterval(this.choiceTimer);
                                    this.choiceTimer = null;
                                    // Respect explicit timeout target before falling back.
                                    const unlocked = block.choices.filter(c => !this.isLocked(c));
                                    const timeoutChoice = block.timeoutToId
                                        ? unlocked.find(c => c.to === block.timeoutToId)
                                        : null;
                                    if(timeoutChoice) {
                                        this.makeChoice(timeoutChoice);
                                    } else if(unlocked.length > 0) {
                                        this.makeChoice(unlocked[Math.floor(Math.random() * unlocked.length)]);
                                    }
                                    this.timeRemaining = null;
                                }
                            }, 100);
                        }

                        // Check for QTE mode
                        if(block.behaviorType === 'qte' && block.choices.some(c => c.qteDuration > 0)) {
                            this.isQTE = true;
                            const qteChoice = block.choices.find(c => c.qteDuration > 0);
                            this.qteKey = qteChoice.qteTargetId || 'Space';
                            const keyHandler = this.qteKeyHandler || this.handleQTE;
                            window.removeEventListener('keydown', keyHandler);
                            window.addEventListener('keydown', keyHandler);
                        }
                    }
                },
                onClipEnded(){
                    if(this.showChoices) return;
                    
                    if(this.currentClip && (this.currentClip.is_game_over == 1 || this.currentClip.is_game_over === true)) {
                        this.isGameOver = true;
                        if(this.$refs.bgm) this.$refs.bgm.pause();
                        return;
                    }

                    if (this.historyStack.length > 0) { 
                        if (this.currentClip && this.historyStack[this.historyStack.length-1].clipId) {
                             const parentClip = CLIPS.find(c => c.unique_id === this.historyStack[this.historyStack.length-1].clipId);
                             if (parentClip) {
                                 this.recordClipAsSeen(this.currentClip.unique_id, parentClip.source_video_id);
                             }
                        }

                        this.finishSubClip(); 
                        return; 
                    }
                    this.playlistIndex++;
                    if(this.playlistIndex < PLAYLIST.length){ 
                        this.historyStack = []; 
                        this.failSafeState = null; 
                        this.seenSegments = []; 
                        this.loadClip(PLAYLIST[this.playlistIndex].id); 
                    }
                },
                playMusic(src){
                    const a=this.$refs.bgm; 
                    if(!a) return;
                    if(!src){a.pause();return;} 
                    if(!a.src.includes(src)){
                        a.src=src;
                        a.volume=this.volume*0.3;
                        a.play().catch(e=>console.error('Music play error:', e));
                    }
                },
                isLocked(ch){if(!ch.reqVar)return false;return !this.gameState[ch.reqVar]},
                makeChoice(choice){
                    if(this.isLocked(choice))return;
                    const returnTime = (this.currentOptions && this.currentOptions.time) ? this.currentOptions.time : 0;
                    this.closeChoiceOverlay();

                    // Analytics
                    this.trackAnalyticsEvent('choice', choice.label, choice.to);

                    if(choice.setVar)this.gameState[choice.setVar]=true;

                    // Relationship tracking
                    if(choice.characterName) {
                        if(!this.relationships[choice.characterName]) this.relationships[choice.characterName] = 50;
                        this.relationships[choice.characterName] = Math.max(0, Math.min(100, this.relationships[choice.characterName] + (choice.relationshipChange || 0)));
                        this.showRelationship = { name: choice.characterName, value: this.relationships[choice.characterName], change: choice.relationshipChange };
                        setTimeout(() => this.showRelationship = null, 3000);
                    }

                    // Achievement unlock
                    if(choice.achievementId && !this.unlockedAchievements.has(choice.achievementId)) {
                        const ach = ACHIEVEMENTS.find(a => a.achievement_id === choice.achievementId);
                        if(ach) {
                            this.unlockedAchievements.add(choice.achievementId);
                            this.showAchievement = ach;
                            this.trackAnalyticsEvent('achievement', ach.name || choice.achievementId, choice.achievementId);
                            setTimeout(() => this.showAchievement = null, 4000);
                        } else {
                            this.unlockedAchievements.add(choice.achievementId);
                            this.trackAnalyticsEvent('achievement', choice.achievementId, choice.achievementId);
                        }
                    }

                    const targetClip=CLIPS.find(c=>c.unique_id===choice.to);
                    if(!targetClip) {
                        this.showBanner('Target scene not found. Please review the published story graph.');
                        return;
                    }

                    if(targetClip.is_game_over == 1 || targetClip.is_game_over === true) {
                        this.failSafeState = { clipId: this.currentClip.unique_id, time: 0 };
                        this.saveGame();
                    }

                    if(choice.return){
                        this.historyStack.push({clipId:this.currentClip.unique_id, time: returnTime});
                    } else if (!targetClip.is_game_over) {
                        this.historyStack = [];
                    }
                    this.loadClip(choice.to, 0);
                },
                handleQTE(event) {
                    if(!this.isQTE) return;
                    if(event && event.repeat) return;
                    const pressedInputs = [];
                    if(event && typeof event === 'object') {
                        pressedInputs.push(this.normalizeQTEInput(event.key));
                        pressedInputs.push(this.normalizeQTEInput(event.code));
                    } else {
                        pressedInputs.push(this.normalizeQTEInput(event));
                    }
                    const choice = this.currentChoices.find(c => {
                        const targetInput = this.normalizeQTEInput(c.qteTargetId || 'Space');
                        return pressedInputs.includes(targetInput);
                    });
                    if(choice) {
                        if(event && typeof event.preventDefault === 'function') event.preventDefault();
                        this.qtePressed = true;
                        this.makeChoice(choice);
                    }
                },
                restartFromFail() {
                    if(this.failSafeState) {
                        this.loadClip(this.failSafeState.clipId, 0);
                        this.failSafeState = null;
                    } else {
                        try {
                            const save = JSON.parse(localStorage.getItem('studio_save_'+PROJECT_ID));
                            if(save && save.failSafeState) {
                                this.loadClip(save.failSafeState.clipId, 0);
                                return;
                            }
                        } catch(e){}
                        this.showBanner('No fail-safe save was found. Restarting from the beginning…', 'info', 1200);
                        setTimeout(() => {
                            location.reload();
                        }, 1200);
                    }
                },
                finishSubClip(){
                    if(this.historyStack.length>0){ 
                        const prev=this.historyStack.pop(); 
                        this.loadClip(prev.clipId, prev.time); 
                    }
                },
                getThumb(id){const c=CLIPS.find(x=>x.unique_id===id);return c?c.thumbnail:''},
                getPreview(id){const c=CLIPS.find(x=>x.unique_id===id);return c?c.filepath:''},
                getClipName(id){const c=CLIPS.find(x=>x.unique_id===id);return c?c.name:'Unknown Scene'}
            }
        }).mount('#app');<\/script></body></html>`;
        
        await fs.writeFile(path.join(exportPath, 'index.html'), htmlContent);
        res.json({ success: true, url: `/exports/${exportName}/index.html` });
    } catch (err) {
        console.error('Publish error:', err);
        // FIX 7: Don't expose err.message in production
        res.status(500).json({ error: 'Failed to publish project' });
    }
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    // FIX 7: Don't expose err.message in production
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Studio Infinity v20.13 (Optimized) Running: http://localhost:${PORT}`));
