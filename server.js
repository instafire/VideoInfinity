const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const multer = require('multer');

const PORT = 3000;
const app = express();

app.use(cors());
app.use(express.json());
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
    await db.exec(`CREATE TABLE IF NOT EXISTS clips (id INTEGER PRIMARY KEY AUTOINCREMENT, unique_id TEXT UNIQUE, project_id INTEGER, name TEXT, filepath TEXT, thumbnail TEXT, source_video_id INTEGER, duration REAL, start_time REAL DEFAULT 0, end_time REAL, logic_name TEXT, timeout_to_id TEXT, timeout_seconds REAL, bg_music TEXT, bg_music_url TEXT, mute_audio INTEGER DEFAULT 0, is_event_clip INTEGER DEFAULT 0, x REAL DEFAULT 0, y REAL DEFAULT 0);`);
    
    // Edges (Logic) Table
    await db.exec(`CREATE TABLE IF NOT EXISTS edges (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, from_id TEXT, to_id TEXT, label TEXT, text_color TEXT DEFAULT '#ffffff', trigger_time REAL, logic_id TEXT, return_to_main INTEGER DEFAULT 0, set_var TEXT, req_var TEXT);`);
    
    // Stats Table
    await db.exec(`CREATE TABLE IF NOT EXISTS analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, choice_label TEXT, target_clip_id TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);`);

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
        `ALTER TABLE clips ADD COLUMN x REAL DEFAULT 0`,
        `ALTER TABLE clips ADD COLUMN y REAL DEFAULT 0`
    ];
    for(let m of migrations) { try { await db.exec(m); } catch(e){} }
    
    const proj = await db.get('SELECT * FROM projects');
    if(!proj) await db.run("INSERT INTO projects (title) VALUES ('Default Project')");
    console.log("✅ Studio Infinity Final v20.7 Ready");
})();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = file.mimetype.startsWith('audio') ? 'public/audio' : 'public/videos';
        cb(null, path.join(__dirname, dest));
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

const generateThumbnail = (inputPath, filename, timestamp = '20%') => {
    return new Promise((resolve) => {
        const thumbFilename = filename.replace(path.extname(filename), '') + `_${Date.now()}.jpg`;
        const outputFolder = path.join(__dirname, 'public/thumbnails');
        ffmpeg(inputPath).screenshots({ timestamps: [timestamp], filename: thumbFilename, folder: outputFolder, size: '640x360' })
            .on('end', () => resolve(`/thumbnails/${thumbFilename}`)).on('error', () => resolve(null));
    });
};

// --- ROUTES ---
app.get('/api/projects', async (req, res) => { const rows = await db.all('SELECT * FROM projects ORDER BY id DESC'); res.json(rows); });
app.post('/api/projects', async (req, res) => { await db.run('INSERT INTO projects (title) VALUES (?)', [req.body.title]); res.json({success:true}); });
app.post('/api/project/settings', async (req, res) => { await db.run('UPDATE projects SET theme_color = ? WHERE id = ?', [req.body.color, req.body.id]); res.json({success:true}); });

// --- STATS ROUTES ---
app.post('/api/analytics/track', async (req, res) => { await db.run('INSERT INTO analytics (project_id, choice_label, target_clip_id) VALUES (?, ?, ?)', [req.body.projectId, req.body.label, req.body.target]); res.json({success: true}); });
app.get('/api/analytics/:projectId', async (req, res) => { const rows = await db.all('SELECT choice_label, COUNT(*) as count FROM analytics WHERE project_id = ? GROUP BY choice_label ORDER BY count DESC', [req.params.projectId]); res.json(rows); });
app.post('/api/analytics/reset', async (req, res) => { 
    try { await db.run('DELETE FROM analytics WHERE project_id = ?', [req.body.projectId]); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/exports', async (req, res) => {
    try {
        const exportDir = path.join(__dirname, 'public/exports');
        const dirs = await fs.readdir(exportDir);
        const builds = [];
        for (const dir of dirs) {
            const dirPath = path.join(exportDir, dir);
            if ((await fs.stat(dirPath)).isDirectory() && await fs.pathExists(path.join(dirPath, 'index.html'))) {
                builds.push({ name: dir, url: `/exports/${dir}/index.html` });
            }
        }
        res.json(builds.reverse());
    } catch (e) { res.json([]); }
});
app.post('/api/delete_export', async (req, res) => { try { await fs.remove(path.join(__dirname, 'public/exports', req.body.name)); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/upload', upload.single('file'), async (req, res) => {
    const projectId = req.body.projectId || 1;
    if (!req.file) return res.status(400).json({ error: "No file" });
    if(req.file.mimetype.startsWith('audio')) return res.json({ success: true, type: 'audio', path: `/audio/${req.file.filename}`, name: req.file.originalname });

    const filename = req.file.filename; const webPath = `/videos/${filename}`;
    ffmpeg.ffprobe(req.file.path, async (err, metadata) => {
        const duration = metadata ? metadata.format.duration : 0;
        const thumbnail = await generateThumbnail(req.file.path, filename);
        const result = await db.run('INSERT INTO videos (project_id, filename, filepath, thumbnail, duration) VALUES (?, ?, ?, ?, ?)', [projectId, req.file.originalname, webPath, thumbnail, duration]);
        const clipId = uuidv4();
        await db.run('INSERT INTO clips (unique_id, project_id, name, filepath, thumbnail, source_video_id, duration, x, y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [clipId, projectId, `FULL: ${req.file.originalname}`, webPath, thumbnail, result.lastID, duration, 100, 100]);
        res.json({ success: true, type: 'video' });
    });
});

app.get('/api/videos', async (req, res) => { const projectId = req.query.projectId || 1; const videos = await db.all('SELECT * FROM videos WHERE project_id = ? ORDER BY id DESC', [projectId]); res.json(videos); });
app.get('/api/audio', async (req, res) => { try{ const files = await fs.readdir(path.join(__dirname, 'public/audio')); res.json(files.map(f => ({ name: f, path: `/audio/${f}` }))); }catch(e){res.json([])} });

app.post('/api/delete_video', async (req, res) => { 
    const { id } = req.body; 
    const vid = await db.get('SELECT * FROM videos WHERE id = ?', [id]); 
    if(vid) { 
        try { fs.unlinkSync(path.join(__dirname, 'public', vid.filepath)); } catch(e){} 
        await db.run('DELETE FROM videos WHERE id = ?', [id]); 
        await db.run('DELETE FROM clips WHERE source_video_id = ?', [id]); 
    } 
    res.json({ success: true }); 
});

app.post('/api/clip', async (req, res) => {
    const { projectId, sourceId, start, end, name, filter, speed, volume } = req.body;
    try {
        const video = await db.get('SELECT * FROM videos WHERE id = ?', [sourceId]);
        const sourcePath = path.join(__dirname, 'public', video.filepath);
        const clipId = uuidv4();
        const outputFilename = `clip_${clipId}.mp4`;
        const outputPath = path.join(__dirname, 'public/clips', outputFilename);
        
        let duration = parseFloat(end) - parseFloat(start);
        if(duration < 0) duration = 0.5;

        let command = ffmpeg(sourcePath).setStartTime(start).setDuration(duration);
        if(speed && parseFloat(speed)!==1.0) { command.audioFilters(`atempo=${parseFloat(speed)}`); duration=duration/parseFloat(speed); command.videoFilters(`setpts=${1/parseFloat(speed)}*PTS`); }
        if(filter && filter!=='none') { if(filter==='bw') command.videoFilters('hue=s=0'); if(filter==='sepia') command.videoFilters('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'); if(filter==='vivid') command.videoFilters('eq=saturation=2'); }
        if(volume && parseFloat(volume)!==1.0) { command.audioFilters(`volume=${parseFloat(volume)}`); }
        
        command.videoCodec('libx264').audioCodec('aac').outputOptions('-preset ultrafast').output(outputPath).on('end', async () => {
            const thumbnail = await generateThumbnail(outputPath, outputFilename); 
            const webPath = `/clips/${outputFilename}`;
            await db.run('INSERT INTO clips (unique_id, project_id, name, filepath, thumbnail, source_video_id, duration, start_time, end_time, x, y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [clipId, projectId, name, webPath, thumbnail, sourceId, duration, start, end, 150, 150]);
            res.json({ success: true });
        }).on('error', (err) => res.status(500).json({ error: "Render Failed" })).run();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/update_event_logic', async (req, res) => {
    const { projectId, clipId, name, choices } = req.body;
    try {
        if(name) await db.run('UPDATE clips SET name = ? WHERE unique_id = ?', [name, clipId]);
        await db.run('DELETE FROM edges WHERE from_id = ?', [clipId]);

        const clip = await db.get('SELECT * FROM clips WHERE unique_id = ?', [clipId]);
        if(!clip) throw new Error("Clip not found");

        const triggerTime = Math.max(0, clip.duration - 0.2);
        const logicId = uuidv4();

        if (choices && Array.isArray(choices)) {
            for (const choice of choices) {
                if (choice.label) { 
                    await db.run(`INSERT INTO edges (project_id, from_id, to_id, label, text_color, trigger_time, logic_id, return_to_main, set_var, req_var) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [projectId, clipId, choice.toId || null, choice.label, choice.color || '#ffffff', triggerTime, logicId, choice.returnToMain ? 1 : 0, choice.setVar, choice.reqVar]); 
                }
            }
        }
        res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/create_event_clip', async (req, res) => {
    const { projectId, sourceId, start, end, name, choices } = req.body;
    try {
        const video = await db.get('SELECT * FROM videos WHERE id = ?', [sourceId]);
        const sourcePath = path.join(__dirname, 'public', video.filepath);
        const clipId = uuidv4();
        const outputFilename = `event_${clipId}.mp4`;
        const outputPath = path.join(__dirname, 'public/clips', outputFilename);
        
        let duration = parseFloat(end) - parseFloat(start);
        if(duration < 0.2) duration = 0.5;

        let command = ffmpeg(sourcePath).setStartTime(start).setDuration(duration);
        
        command.videoCodec('libx264').audioCodec('aac').outputOptions('-preset ultrafast').output(outputPath).on('end', async () => {
            const thumbnail = await generateThumbnail(outputPath, outputFilename); 
            const webPath = `/clips/${outputFilename}`;
            
            await db.run('INSERT INTO clips (unique_id, project_id, name, filepath, thumbnail, source_video_id, duration, start_time, end_time, is_event_clip, x, y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)', 
                [clipId, projectId, name, webPath, thumbnail, sourceId, duration, start, end, 200, 200]);
            
            const logicId = uuidv4();
            const triggerTime = Math.max(0, duration - 0.2); 
            
            if (choices && choices.length > 0) {
                for (const choice of choices) {
                    if (choice.label) {
                        await db.run('INSERT INTO edges (project_id, from_id, to_id, label, text_color, trigger_time, logic_id, return_to_main, set_var, req_var) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                        [projectId, clipId, choice.toId || null, choice.label, choice.color || '#ffffff', triggerTime, logicId, choice.returnToMain ? 1 : 0, choice.setVar, choice.reqVar]); 
                    }
                }
            }
            res.json({ success: true, clipId });
        }).on('error', (err) => { console.error(err); res.status(500).json({ error: "Render Failed" }); }).run();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clip/positions', async (req, res) => {
    const { updates } = req.body;
    try {
        for(const u of updates) {
            await db.run('UPDATE clips SET x = ?, y = ? WHERE unique_id = ?', [u.x, u.y, u.id]);
        }
        res.json({ success: true });
    } catch(err) { res.status(500).json({error: err.message}); }
});

app.post('/api/delete_clip', async (req, res) => { const { unique_id } = req.body; const clip = await db.get('SELECT * FROM clips WHERE unique_id = ?', [unique_id]); if(clip && !clip.name.startsWith('FULL:')) { try { fs.unlinkSync(path.join(__dirname, 'public', clip.filepath)); } catch(e){} await db.run('DELETE FROM clips WHERE unique_id = ?', [unique_id]); await db.run('DELETE FROM edges WHERE from_id = ? OR to_id = ?', [unique_id, unique_id]); await db.run('DELETE FROM analytics WHERE target_clip_id = ?', [unique_id]); } res.json({ success: true }); });
app.post('/api/clip/update', async (req, res) => { await db.run('UPDATE clips SET name = ? WHERE unique_id = ?', [req.body.name, req.body.id]); res.json({ success: true }); });
app.post('/api/clip/thumbnail', async (req, res) => { const { id, time } = req.body; try { const clip = await db.get('SELECT * FROM clips WHERE unique_id = ?', [id]); if(!clip) return res.status(404).json({error: "Clip not found"}); const fullPath = path.join(__dirname, 'public', clip.filepath); const filename = path.basename(clip.filepath); const newThumb = await generateThumbnail(fullPath, filename, time); await db.run('UPDATE clips SET thumbnail = ? WHERE unique_id = ?', [newThumb, id]); res.json({ success: true, thumbnail: newThumb }); } catch(err) { res.status(500).json({ error: err.message }); } });

app.get('/api/story', async (req, res) => { 
    const projectId = req.query.projectId || 1; 
    const clips = await db.all('SELECT * FROM clips WHERE project_id = ? ORDER BY id DESC', [projectId]); 
    const edges = await db.all('SELECT * FROM edges WHERE project_id = ? ORDER BY trigger_time ASC', [projectId]); 
    res.json({ clips, edges }); 
});

app.post('/api/save_logic_block', async (req, res) => {
    const { projectId, fromId, logicId, triggerTime, choices, bgMusic, muteAudio } = req.body; 
    const newLogicId = logicId || uuidv4();
    try {
        await db.run('UPDATE clips SET bg_music = ?, mute_audio = ? WHERE unique_id = ?', [bgMusic, muteAudio ? 1 : 0, fromId]);
        if(logicId) await db.run('DELETE FROM edges WHERE logic_id = ?', [logicId]);
        for (const choice of choices) { 
            if (choice.toId) { 
                await db.run('INSERT INTO edges (project_id, from_id, to_id, label, text_color, trigger_time, logic_id, return_to_main, set_var, req_var) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                [projectId, fromId, choice.toId, choice.label || 'Choice', choice.color || '#ffffff', triggerTime, newLogicId, choice.return ? 1 : 0, choice.setVar, choice.reqVar]); 
            } 
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/delete_logic_block', async (req, res) => { const { logicId, fromId, triggerTime } = req.body; try { if (logicId && !logicId.startsWith('legacy_')) await db.run('DELETE FROM edges WHERE logic_id = ?', [logicId]); else await db.run('DELETE FROM edges WHERE from_id = ? AND trigger_time BETWEEN ? AND ?', [fromId, triggerTime - 0.01, triggerTime + 0.01]); res.json({ success: true }); } catch(err) { res.status(500).json({error: err.message}); } });

// --- PUBLISH ENGINE ---
app.post('/api/publish', async (req, res) => {
    const { projectId, title, sequence } = req.body;
    try {
        const project = await db.get('SELECT * FROM projects WHERE id = ?', [projectId]);
        const themeColor = project.theme_color || '#3b82f6';
        const exportName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const exportPath = path.join(__dirname, 'public/exports', exportName);
        await fs.emptyDir(exportPath); await fs.ensureDir(path.join(exportPath, 'clips')); await fs.ensureDir(path.join(exportPath, 'audio'));
        
        const clips = await db.all('SELECT * FROM clips WHERE project_id = ?', [projectId]);
        const edges = await db.all('SELECT * FROM edges WHERE project_id = ? ORDER BY trigger_time ASC', [projectId]);

        for (const clip of clips) {
            const src = path.join(__dirname, 'public', clip.filepath); const filename = path.basename(clip.filepath); const dest = path.join(exportPath, 'clips', filename);
            if(await fs.pathExists(src)) { await fs.copy(src, dest); clip.filepath = `clips/${filename}`; }
            if(clip.thumbnail) { const thumbName = path.basename(clip.thumbnail); if(await fs.pathExists(path.join(__dirname, 'public', clip.thumbnail))) { await fs.copy(path.join(__dirname, 'public', clip.thumbnail), path.join(exportPath, 'clips', thumbName)); clip.thumbnail = `clips/${thumbName}`; } }
            if(clip.bg_music) { const audSrc = path.join(__dirname, 'public', clip.bg_music); const audName = path.basename(clip.bg_music); if(await fs.pathExists(audSrc)) { await fs.copy(audSrc, path.join(exportPath, 'audio', audName)); clip.bg_music = `audio/${audName}`; } }
        }

        const logicBlocks = {};
        edges.forEach(e => {
            if(!logicBlocks[e.logic_id]) logicBlocks[e.logic_id] = { id: e.logic_id, from: e.from_id, time: e.trigger_time, choices: [] };
            logicBlocks[e.logic_id].choices.push({ 
                to: e.to_id, 
                label: e.label, 
                color: e.text_color, 
                return: !!e.return_to_main,
                setVar: e.set_var, 
                reqVar: e.req_var 
            });
        });

        const escapeJSON = (obj) => JSON.stringify(obj).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');

        const manifest = { name: title, short_name: title, start_url: "./index.html", display: "fullscreen", background_color: "#000", theme_color: themeColor, icons: [] };
        await fs.writeFile(path.join(exportPath, 'manifest.json'), JSON.stringify(manifest));

        const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title><link rel="manifest" href="manifest.json"><script src="https://unpkg.com/vue@3/dist/vue.global.js"></script><script src="https://cdn.tailwindcss.com"></script><style>body{background:radial-gradient(circle at top right,#1e1b4b,#020617);color:#fff;font-family:'Inter',sans-serif;overflow:hidden}.overlay{background:rgba(0,0,0,0.7);backdrop-filter:blur(10px)}.glass-panel{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(12px);border-radius:1rem}.choice-card{transition:all 0.3s;cursor:pointer;border:1px solid rgba(255,255,255,0.1);position:relative;overflow:hidden}.choice-card:hover{transform:scale(1.05);border-color:${themeColor};box-shadow:0 0 25px ${themeColor}66}.choice-card.locked{opacity:0.5;filter:grayscale(1);cursor:not-allowed}.fade-enter-active,.fade-leave-active{transition:opacity 0.5s ease}.fade-enter-from,.fade-leave-to{opacity:0}.video-wrapper{position:absolute;inset:0;background:black;transition:opacity 0.3s ease-in-out;display:flex;align-items:center;justify-content:center}.faded-out{opacity:0}[v-cloak]{display:none}</style></head><body class="h-screen w-screen flex items-center justify-center"><div id="app" class="w-full h-full relative" v-cloak><div v-if="!started" class="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center gap-6"><h1 class="text-4xl font-bold mb-4 drop-shadow-lg">${title}</h1><button @click="startMovie(false)" class="px-8 py-4 bg-white text-black font-bold rounded-full hover:scale-105 transition text-xl shadow-xl w-64">▶ Start Movie</button><button v-if="hasSave" @click="startMovie(true)" class="px-8 py-4 bg-gray-800 text-white border border-gray-600 font-bold rounded-full hover:scale-105 transition text-xl shadow-xl w-64">💾 Resume</button></div><div class="video-wrapper" :class="{'faded-out': isFading}"><video ref="player" class="max-w-full max-h-full object-contain" @timeupdate="checkTime" @ended="onClipEnded" playsinline webkit-playsinline></video></div><audio ref="bgm" loop></audio><div v-if="showChoices" class="absolute inset-0 overlay flex flex-col justify-center items-center z-50 animate-fade-in"><h1 class="text-4xl font-bold mb-10 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">Make Your Choice</h1><div class="flex flex-wrap gap-8 justify-center px-10"><div v-for="ch in currentChoices" @click="makeChoice(ch)" class="glass-panel choice-card w-64 h-36 md:w-80 md:h-48 group" :class="{locked: isLocked(ch)}"><img :src="getThumb(ch.to)" class="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition duration-300"><div class="absolute bottom-0 left-0 w-full p-3 text-center font-bold text-lg tracking-wide bg-black/60 backdrop-blur-sm" :style="{color: ch.color || '#fff'}">{{ch.label}}</div><div v-if="isLocked(ch)" class="absolute inset-0 flex items-center justify-center bg-black/60"><span class="text-4xl">🔒</span></div></div></div></div></div><script>
        const CLIPS=JSON.parse('${escapeJSON(clips)}'); 
        const BLOCKS=JSON.parse('${escapeJSON(Object.values(logicBlocks))}'); 
        const PLAYLIST=JSON.parse('${escapeJSON(sequence || [])}'); 
        const PROJECT_ID=${projectId};
        const {createApp}=Vue; createApp({
            data(){return{started:false, currentClip:null, activeBlocks:[], currentOptions:null, showChoices:false, historyStack:[], gameState:{}, isPlayingSubClip:false, hasSave:false, isFading:false, playlistIndex: 0}},
            computed:{currentChoices(){return this.currentOptions?this.currentOptions.choices:[]}},
            mounted(){ if(localStorage.getItem('studio_save_'+PROJECT_ID)) this.hasSave=true; },
            methods:{
                startMovie(resume){
                    this.started=true;
                    if(resume){
                        const save = JSON.parse(localStorage.getItem('studio_save_'+PROJECT_ID));
                        this.gameState=save.gameState; this.historyStack=save.historyStack; this.playlistIndex=save.playlistIndex||0;
                        this.loadClip(save.currentId, save.currentTime);
                    } else {
                        localStorage.removeItem('studio_save_'+PROJECT_ID);
                        this.playlistIndex = 0;
                        if(PLAYLIST.length > 0) this.loadClip(PLAYLIST[0].id);
                    }
                },
                saveGame(){
                    const data = { currentId: this.currentClip.unique_id, currentTime: this.$refs.player.currentTime, gameState: this.gameState, historyStack: this.historyStack, playlistIndex: this.playlistIndex };
                    localStorage.setItem('studio_save_'+PROJECT_ID, JSON.stringify(data));
                },
                loadClip(id, forceTime=0){
                    const nextClip = CLIPS.find(c => c.unique_id === id); if(!nextClip) return;
                    const v = this.$refs.player;
                    this.isFading = true; this.showChoices = false;
                    setTimeout(() => {
                        this.currentClip = nextClip;
                        // Always reload ALL blocks for the current clip
                        this.activeBlocks = BLOCKS.filter(b => b.from === id).sort((a,b)=>a.time-b.time);
                        // If resuming, remove blocks we've already passed (plus small buffer)
                        if(forceTime > 0) {
                            this.activeBlocks = this.activeBlocks.filter(b => b.time > forceTime + 0.1);
                        }
                        
                        v.src = nextClip.filepath;
                        v.oncanplay = () => {
                            v.muted = !!nextClip.mute_audio;
                            v.currentTime = forceTime; 
                            v.play().then(() => {
                                this.isFading = false;
                                if(nextClip.bg_music) {
                                    this.playMusic(nextClip.bg_music);
                                } else {
                                    this.$refs.bgm.pause();
                                }
                                this.saveGame();
                            }).catch(e => console.error("Play error:", e));
                            v.oncanplay = null;
                        };
                    }, 300);
                },
                onClipEnded(){
                    if(this.showChoices) return;
                    if (this.historyStack.length > 0) { 
                        this.finishSubClip(); 
                        return; 
                    }
                    this.playlistIndex++;
                    if(this.playlistIndex < PLAYLIST.length){ 
                        this.loadClip(PLAYLIST[this.playlistIndex].id); 
                    }
                },
                playMusic(src){const a=this.$refs.bgm; if(!src){a.pause();return;} if(!a.src.includes(src)){a.src=src;a.volume=0.3;a.play().catch(e=>{});}},
                checkTime(){
                    if(this.showChoices || !this.activeBlocks.length) return; 
                    const v=this.$refs.player; 
                    if(v.currentTime >= this.activeBlocks[0].time && v.currentTime < this.activeBlocks[0].time + 1.0){
                        v.pause();
                        this.currentOptions=this.activeBlocks.shift();
                        this.showChoices=true;
                    }
                },
                isLocked(ch){if(!ch.reqVar)return false;return !this.gameState[ch.reqVar]},
                makeChoice(choice){
                    if(this.isLocked(choice))return;
                    if(choice.setVar)this.gameState[choice.setVar]=true;
                    fetch('/api/analytics/track', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:PROJECT_ID, label:choice.label, target:choice.to})}).catch(e=>{});
                    
                    const targetClip=CLIPS.find(c=>c.unique_id===choice.to);
                    if(targetClip){
                        if(choice.return){ 
                            if(this.currentClip.is_event_clip === 1) {
                                // EVENT CLIP LOGIC: Return to START (0) - Replay the event loop
                                this.historyStack.push({clipId:this.currentClip.unique_id, time: 0});
                            } else {
                                // STANDARD LOGIC CLIP: Resume from TRIGGER POINT
                                this.historyStack.push({clipId:this.currentClip.unique_id, time: (this.currentOptions.time||0) + 0.1});
                            }
                        } 
                        this.loadClip(choice.to, 0);
                    }
                },
                finishSubClip(){
                    if(this.historyStack.length>0){ 
                        const prev=this.historyStack.pop(); 
                        this.loadClip(prev.clipId, prev.time); 
                    }
                },
                getThumb(id){const c=CLIPS.find(x=>x.unique_id===id);return c?c.thumbnail:''}
            }
        }).mount('#app');<\/script></body></html>`;
        await fs.writeFile(path.join(exportPath, 'index.html'), htmlContent);
        res.json({ success: true, url: `/exports/${exportName}/index.html` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`🎬 Studio Infinity v20.7 Running: http://localhost:${PORT}`));