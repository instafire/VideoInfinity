import {
    createChoice,
    createChoiceBlock,
    groupEdgesIntoBlocks,
    serializeBlockChoices,
    formatClock
} from './js/story-utils.js';
import {
    PRIMARY_WORKSPACE_ITEMS,
    SECONDARY_WORKSPACE_ITEMS,
    WORKSPACE_VIEW_GROUPS,
    getWorkspaceItem,
    getWorkspaceGroup
} from './js/workspace-config.js';

const { createApp, nextTick } = window.Vue;

const DEFAULT_THEME_COLOR = '#3b82f6';
const DEFAULT_EVENT_CHOICES = 2;
const GRAPH_NODE_WIDTH = 180;
const GRAPH_NODE_HEIGHT = 100;

function createEventChoice(overrides = {}) {
    return {
        label: '',
        toId: null,
        color: '#ffffff',
        returnToMain: false,
        setVar: '',
        reqVar: '',
        ...overrides
    };
}

function defaultAchievement() {
    return {
        id: '',
        name: '',
        description: '',
        icon: ''
    };
}

function defaultToast() {
    return {
        show: false,
        msg: '',
        type: 'success'
    };
}

function defaultConfirmModal() {
    return {
        show: false,
        title: '',
        message: '',
        onConfirm: () => {}
    };
}

function defaultStoryDiagnostics() {
    return {
        issues: [],
        summary: {
            sceneCount: 0,
            sequenceCount: 0,
            reachableCount: 0,
            chapterCount: 0,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0
        },
        chapters: [],
        nodeStats: []
    };
}

function defaultAnalyticsSummary() {
    return {
        totalChoices: 0,
        totalSceneViews: 0,
        scenesReached: 0,
        endingsReached: 0,
        achievementsUnlocked: 0
    };
}

function deepClone(value) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch (error) {
            // Vue proxies and browser-backed objects are not always structured-cloneable.
        }
    }
    return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function asNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function asBool(value) {
    return value === true || value === 1 || value === '1';
}

function isHexColor(value) {
    return /^#[0-9A-Fa-f]{6}$/.test(String(value || ''));
}

function choiceTargetId(choice) {
    return choice?.to || choice?.toId || choice?.to_id || null;
}

function choiceUsesHotspot(choice) {
    return choice?.overlayMode === 'hotspot' && Boolean(String(choice?.overlayAsset || '').trim());
}

function splitChoicePresentation(choices = []) {
    const hotspotChoices = [];
    const cardChoices = [];
    choices.forEach((choice) => {
        if (choiceUsesHotspot(choice)) {
            hotspotChoices.push(choice);
            return;
        }
        cardChoices.push(choice);
    });
    return { hotspotChoices, cardChoices };
}

function getRenderedVideoFrame(player) {
    if (!player) {
        return { width: 0, height: 0 };
    }
    const boxWidth = player.clientWidth || 0;
    const boxHeight = player.clientHeight || 0;
    const sourceWidth = player.videoWidth || boxWidth;
    const sourceHeight = player.videoHeight || boxHeight;
    if (!boxWidth || !boxHeight || !sourceWidth || !sourceHeight) {
        return { width: boxWidth, height: boxHeight };
    }

    const sourceRatio = sourceWidth / sourceHeight;
    const boxRatio = boxWidth / boxHeight;

    if (sourceRatio > boxRatio) {
        return {
            width: boxWidth,
            height: boxWidth / sourceRatio
        };
    }

    return {
        width: boxHeight * sourceRatio,
        height: boxHeight
    };
}

function clipDisplayName(name = '') {
    return name.startsWith('FULL: ') ? name.slice(6) : name;
}

function buildChoiceSet(count = DEFAULT_EVENT_CHOICES) {
    return Array.from({ length: count }, () => createEventChoice());
}

function mergeRanges(ranges) {
    if (!ranges.length) return [];
    const sorted = ranges
        .map((range) => ({
            start: asNumber(range.start, 0),
            end: asNumber(range.end, 0)
        }))
        .sort((a, b) => a.start - b.start);

    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
        const current = sorted[i];
        const last = merged[merged.length - 1];
        if (current.start <= last.end + 0.25) {
            last.end = Math.max(last.end, current.end);
            continue;
        }
        merged.push(current);
    }
    return merged;
}

function parseVarTokens(expression) {
    return String(expression || '')
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean);
}

function applyVarExpression(target, expression) {
    const next = { ...target };
    parseVarTokens(expression).forEach((token) => {
        if (token.startsWith('!')) {
            delete next[token.slice(1)];
            return;
        }
        const [key, rawValue] = token.split('=');
        if (!key) return;
        next[key.trim()] = rawValue === undefined ? true : rawValue.trim();
    });
    return next;
}

function satisfiesRequirement(gameState, expression) {
    const tokens = parseVarTokens(expression);
    if (!tokens.length) return true;
    return tokens.every((token) => {
        if (token.startsWith('!')) {
            return !gameState[token.slice(1)];
        }
        const [key, rawValue] = token.split('=');
        const current = gameState[key?.trim()];
        if (rawValue === undefined) {
            return Boolean(current);
        }
        return String(current) === rawValue.trim();
    });
}

function keyedById(items, idKey = 'unique_id') {
    const map = new Map();
    items.forEach((item) => {
        map.set(item[idKey], item);
    });
    return map;
}

function normalizeClipMeta(clip) {
    return {
        ...clip,
        chapter_name: clip?.chapter_name || '',
        title_card: clip?.title_card || '',
        subtitle_text: clip?.subtitle_text || '',
        scene_notes: clip?.scene_notes || '',
        preset_id: clip?.preset_id || ''
    };
}

function normalizeClipRows(rows) {
    return rows.map((clip, index) => ({
        ...clip,
        x: Number.isFinite(Number(clip.x)) ? Number(clip.x) : 140 + (index % 5) * 230,
        y: Number.isFinite(Number(clip.y)) ? Number(clip.y) : 100 + Math.floor(index / 5) * 170,
        duration: asNumber(clip.duration, 0),
        start_time: asNumber(clip.start_time, 0),
        end_time: asNumber(clip.end_time, asNumber(clip.duration, 0)),
        chapter_name: clip.chapter_name || '',
        title_card: clip.title_card || '',
        subtitle_text: clip.subtitle_text || '',
        scene_notes: clip.scene_notes || '',
        preset_id: clip.preset_id || ''
    }));
}

function groupClipsByChapter(clips) {
    const groups = new Map();
    clips.forEach((clip) => {
        const chapter = String(clip.chapter_name || '').trim() || 'Unassigned';
        if (!groups.has(chapter)) {
            groups.set(chapter, {
                chapter,
                clips: []
            });
        }
        groups.get(chapter).clips.push(clip);
    });
    return Array.from(groups.values())
        .map((group) => ({
            ...group,
            clips: group.clips.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        }))
        .sort((a, b) => a.chapter.localeCompare(b.chapter));
}

async function parseResponse(response) {
    if (response.ok) {
        return response.status === 204 ? null : response.json();
    }

    let payload = null;
    try {
        payload = await response.json();
    } catch (error) {
        payload = null;
    }

    throw new Error(payload?.error || `Request failed (${response.status})`);
}

async function apiGet(url) {
    const response = await fetch(url, { credentials: 'same-origin' });
    return parseResponse(response);
}

async function apiPost(url, body, init = {}) {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        ...init
    });
    return parseResponse(response);
}

async function apiUpload(url, formData) {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
    });
    return parseResponse(response);
}

const app = createApp({
    data() {
        return {
            view: 'projects',
            projects: [],
            currentProject: null,
            projectColor: DEFAULT_THEME_COLOR,
            publishTitle: '',
            projectModalOpen: false,
            projectDraftTitle: '',
            selectedFile: null,
            uploading: false,
            isUploadDragOver: false,
            videos: [],
            clips: [],
            edges: [],
            audioFiles: [],
            imageFiles: [],
            editorBin: 'scenes',
            editorSelectedInteractionKey: null,
            selectedVidId: null,
            videoUrl: null,
            clipStart: 0,
            clipEnd: 0,
            clipName: '',
            clipFilter: 'none',
            clipSpeed: 1,
            clipVolume: 1,
            creatingClip: false,
            eventChoices: buildChoiceSet(),
            isEditingEvent: false,
            editingEventId: null,
            previewEventClip: null,
            showTestChoices: false,
            testChoices: [],
            testBlocks: [],
            testTriggeredBlocks: new Set(),
            selectionMode: false,
            selectedClipIds: [],
            librarySelectedClip: null,
            libraryBaselineSignature: '',
            savingClip: false,
            scenePresets: [],
            presetDraftName: '',
            librarySearch: '',
            libraryChapterFilter: 'all',
            libraryTypeFilter: 'all',
            batchChapterName: '',
            batchPresetId: '',
            batchEndingState: 'keep',
            logicSourceId: null,
            logicSourceClip: null,
            logicActiveClip: null,
            logicBgMusic: null,
            logicMuteVideo: false,
            existingLogicBlocks: [],
            currentEditingBlock: null,
            showLogicOverlay: false,
            isGraphMode: false,
            isTestMode: false,
            isPlayingSubClip: false,
            logicCurrentTime: 0,
            logicTriggeredBlocks: new Set(),
            logicHistoryStack: [],
            logicGameState: {},
            zoomLevel: 100,
            pan: { x: 0, y: 0 },
            zoom: 1,
            isPanning: false,
            panStart: { x: 0, y: 0 },
            dragNodeId: null,
            dragOffset: { x: 0, y: 0 },
            seenSegments: [],
            smartSkipEnabled: true,
            statsData: [],
            statsSummary: defaultAnalyticsSummary(),
            storyDiagnostics: defaultStoryDiagnostics(),
            diagnosticsLoading: false,
            achievementsList: [],
            newAchievement: defaultAchievement(),
            storySequence: [],
            isPublishGraphMode: false,
            publishing: false,
            publishUrl: '',
            exportsList: [],
            previewMode: false,
            previewCurrentClip: null,
            previewCurrentClipId: null,
            previewBlocks: [],
            previewCurrentChoices: [],
            previewShowChoices: false,
            previewIsPaused: false,
            previewCurrentTime: 0,
            previewDuration: 0,
            previewProgress: 0,
            previewVolume: 1,
            previewIsGameOver: false,
            previewPlaylistIndex: 0,
            previewHistoryStack: [],
            previewGameState: {},
            previewRelationships: {},
            previewUnlockedAchievements: [],
            previewRoute: [],
            previewSeenByClip: {},
            previewTriggeredBlocks: new Set(),
            previewChoiceTimer: null,
            previewTimeRemaining: null,
            previewIsQte: false,
            previewQteKey: null,
            previewQtePressed: false,
            previewQteKeyHandler: null,
            previewIsManualSeeking: false,
            previewFailSafeState: null,
            previewTitleCardText: '',
            previewTitleCardTimer: null,
            previewDisplayMode: 'debugger',
            layoutTick: 0,
            toast: defaultToast(),
            toastTimer: null,
            confirmModal: defaultConfirmModal()
        };
    },
    computed: {
        primaryWorkspaceItems() {
            return PRIMARY_WORKSPACE_ITEMS;
        },
        secondaryWorkspaceItems() {
            return SECONDARY_WORKSPACE_ITEMS;
        },
        currentWorkspaceGroup() {
            return getWorkspaceGroup(this.view);
        },
        currentWorkspaceMeta() {
            return getWorkspaceItem(this.view) || getWorkspaceItem(this.currentWorkspaceGroup);
        },
        activeWorkspaceViews() {
            return WORKSPACE_VIEW_GROUPS[this.currentWorkspaceGroup] || [];
        },
        editorSelectedSceneClip() {
            const clipId = this.librarySelectedClip?.unique_id;
            if (!clipId) return null;
            return this.clips.find((clip) => clip.unique_id === clipId) || this.librarySelectedClip || null;
        },
        editorSelectedSourceVideo() {
            return this.videos.find((video) => Number(video.id) === Number(this.selectedVidId)) || null;
        },
        editorTimelineTotalDuration() {
            const clipMap = keyedById(this.clips);
            const total = this.storySequence.reduce((sum, item) => {
                const clip = clipMap.get(item.id);
                return sum + Math.max(asNumber(clip?.duration, 0), 0.5);
            }, 0);
            return total || 1;
        },
        editorSequenceTimelineItems() {
            const clipMap = keyedById(this.clips);
            const total = this.editorTimelineTotalDuration;
            let cursor = 0;

            return this.storySequence.map((item, index) => {
                const clip = clipMap.get(item.id);
                const duration = Math.max(asNumber(clip?.duration, 0), 0.5);
                const timelineItem = {
                    index,
                    id: item.id,
                    clip,
                    name: clip?.name || item.name || 'Missing Scene',
                    duration,
                    start: cursor,
                    left: (cursor / total) * 100,
                    width: Math.max((duration / total) * 100, 8),
                    isMissing: !clip
                };
                cursor += duration;
                return timelineItem;
            });
        },
        editorInteractionTimelineItems() {
            const total = this.editorTimelineTotalDuration;
            const items = [];

            this.editorSequenceTimelineItems.forEach((sequenceItem) => {
                if (!sequenceItem.clip) return;
                const blocks = groupEdgesIntoBlocks(this.edges, sequenceItem.clip.unique_id);
                blocks.forEach((block) => {
                    const duration = Math.max(asNumber(block.timeoutSeconds, 0), block.behaviorType === 'qte' ? 1.2 : 0.8);
                    const absoluteStart = sequenceItem.start + asNumber(block.triggerTime, 0);
                    items.push({
                        key: `${sequenceItem.clip.unique_id}:${block.id}`,
                        clipId: sequenceItem.clip.unique_id,
                        blockId: block.id,
                        clipName: sequenceItem.clip.name,
                        triggerTime: asNumber(block.triggerTime, 0),
                        absoluteStart,
                        left: (absoluteStart / total) * 100,
                        width: Math.max((duration / total) * 100, 3),
                        choiceCount: block.choices?.length || 0,
                        behaviorType: block.behaviorType || 'menu',
                        timeoutSeconds: asNumber(block.timeoutSeconds, 0),
                        usesHotspot: (block.choices || []).some((choice) => choiceUsesHotspot(choice))
                    });
                });
            });

            return items;
        },
        editorGraphicsTimelineItems() {
            const total = this.editorTimelineTotalDuration;
            return this.editorSequenceTimelineItems
                .map((sequenceItem) => {
                    if (!sequenceItem.clip) return null;
                    const hotspotCount = this.edges.filter((edge) => edge.from_id === sequenceItem.clip.unique_id && edge.overlay_mode === 'hotspot' && edge.overlay_asset).length;
                    const parts = [];
                    if (sequenceItem.clip.title_card) parts.push('Title');
                    if (sequenceItem.clip.subtitle_text) parts.push('Subtitle');
                    if (hotspotCount) parts.push(`${hotspotCount} Hotspot${hotspotCount === 1 ? '' : 's'}`);
                    if (!parts.length) return null;
                    return {
                        id: `gfx-${sequenceItem.id}`,
                        label: parts.join(' • '),
                        left: (sequenceItem.start / total) * 100,
                        width: Math.max((sequenceItem.duration / total) * 100, 8)
                    };
                })
                .filter(Boolean);
        },
        editorSelectedInteractionBlock() {
            if (!this.editorSelectedInteractionKey) return null;
            const [clipId, blockId] = this.editorSelectedInteractionKey.split(':');
            return groupEdgesIntoBlocks(this.edges, clipId).find((block) => String(block.id) === String(blockId)) || null;
        },
        editorSelectedInteractionSourceClip() {
            const clipId = this.editorSelectedInteractionKey?.split(':')?.[0];
            return clipId ? this.clips.find((clip) => clip.unique_id === clipId) || null : null;
        },
        sceneCount() {
            return this.subClips.length;
        },
        branchCount() {
            return this.edges.length;
        },
        endingCount() {
            return this.clips.filter((clip) => asBool(clip.is_game_over)).length;
        },
        masterClips() {
            return this.clips.filter((clip) => String(clip.name || '').startsWith('FULL:'));
        },
        eventClips() {
            return this.clips.filter((clip) => asBool(clip.is_event_clip));
        },
        subClips() {
            return this.clips.filter((clip) => !String(clip.name || '').startsWith('FULL:') && !asBool(clip.is_event_clip));
        },
        filteredPublishClips() {
            return [...this.eventClips, ...this.subClips].sort((a, b) => {
                if (asBool(a.is_event_clip) !== asBool(b.is_event_clip)) {
                    return asBool(b.is_event_clip) - asBool(a.is_event_clip);
                }
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
        },
        libraryAvailableChapters() {
            return [...new Set(this.clips
                .map((clip) => String(clip.chapter_name || '').trim())
                .filter(Boolean))]
                .sort((a, b) => a.localeCompare(b));
        },
        libraryVisibleClips() {
            const search = this.librarySearch.trim().toLowerCase();
            return this.clips.filter((clip) => {
                if (this.libraryChapterFilter !== 'all') {
                    const chapter = String(clip.chapter_name || '').trim() || 'Unassigned';
                    if (chapter !== this.libraryChapterFilter) return false;
                }

                if (this.libraryTypeFilter === 'events' && !asBool(clip.is_event_clip)) return false;
                if (this.libraryTypeFilter === 'scenes' && (String(clip.name || '').startsWith('FULL:') || asBool(clip.is_event_clip))) return false;
                if (this.libraryTypeFilter === 'sources' && !String(clip.name || '').startsWith('FULL:')) return false;
                if (this.libraryTypeFilter === 'endings' && !asBool(clip.is_game_over)) return false;

                if (!search) return true;

                return [
                    clip.name,
                    clip.chapter_name,
                    clip.title_card,
                    clip.subtitle_text,
                    clip.scene_notes
                ].some((value) => String(value || '').toLowerCase().includes(search));
            });
        },
        libraryClipGroups() {
            return groupClipsByChapter(this.libraryVisibleClips);
        },
        selectedVideoRecord() {
            return this.videos.find((video) => Number(video.id) === Number(this.selectedVidId)) || null;
        },
        playheadPercent() {
            const player = this.view === 'eventCreator' ? this.$refs.eventVideo : this.$refs.video;
            const duration = player?.duration || this.selectedVideoRecord?.duration || 0;
            return duration ? (asNumber(player?.currentTime, 0) / duration) * 100 : 0;
        },
        startPercent() {
            const duration = this.selectedVideoRecord?.duration || this.logicActiveClip?.duration || 0;
            return duration ? (this.clipStart / duration) * 100 : 0;
        },
        endPercent() {
            const duration = this.selectedVideoRecord?.duration || this.logicActiveClip?.duration || 0;
            return duration ? (this.clipEnd / duration) * 100 : 0;
        },
        logicPlayheadPercent() {
            const player = this.$refs.logicPlayer;
            const duration = player?.duration || this.logicActiveClip?.duration || 0;
            return duration ? (asNumber(player?.currentTime, 0) / duration) * 100 : 0;
        },
        maxStatCount() {
            return this.statsData.reduce((max, row) => Math.max(max, asNumber(row.count, 0)), 0) || 1;
        },
        maxNodeVisitCount() {
            return this.storyDiagnostics.nodeStats.reduce((max, row) => Math.max(max, asNumber(row.visits, 0)), 0) || 1;
        },
        previewMarkers() {
            if (!this.previewDuration) return [];
            return this.previewBlocks.map((block) => ({
                id: block.id,
                pct: (asNumber(block.time, 0) / this.previewDuration) * 100,
                count: block.choices?.length || 0
            }));
        },
        currentEditingHotspotChoices() {
            return splitChoicePresentation(this.currentEditingBlock?.choices || []).hotspotChoices;
        },
        currentEditingCardChoices() {
            return splitChoicePresentation(this.currentEditingBlock?.choices || []).cardChoices;
        },
        previewHotspotChoices() {
            return splitChoicePresentation(this.previewCurrentChoices || []).hotspotChoices;
        },
        previewCardChoices() {
            return splitChoicePresentation(this.previewCurrentChoices || []).cardChoices;
        },
        publishChapterGroups() {
            return groupClipsByChapter(this.filteredPublishClips);
        },
        sequenceChapterSummary() {
            const clipMap = keyedById(this.clips);
            return this.storySequence.reduce((summary, item) => {
                const clip = clipMap.get(item.id);
                if (!clip) return summary;
                const chapter = String(clip.chapter_name || '').trim() || 'Unassigned';
                summary[chapter] = (summary[chapter] || 0) + 1;
                return summary;
            }, {});
        },
        totalPublishedDecisions() {
            return this.statsSummary.totalChoices || this.statsData.reduce((total, row) => total + asNumber(row.count, 0), 0);
        },
        trackedSceneCount() {
            return this.statsSummary.scenesReached || this.storyDiagnostics.nodeStats.filter((node) => asNumber(node.visits, 0) > 0).length;
        },
        libraryHasUnsavedChanges() {
            if (!this.librarySelectedClip || !this.libraryBaselineSignature) return false;
            return this.clipSignature(this.librarySelectedClip) !== this.libraryBaselineSignature;
        },
        achievementReferenceCounts() {
            return this.edges.reduce((counts, edge) => {
                if (!edge.achievement_id) return counts;
                counts[edge.achievement_id] = (counts[edge.achievement_id] || 0) + 1;
                return counts;
            }, {});
        },
        showPreviewDebugger() {
            return this.previewDisplayMode === 'debugger';
        },
        displayedGraphNodes() {
            if (this.isPublishGraphMode || this.view === 'publish') {
                const publishIds = new Set([
                    ...this.storySequence.map((item) => item.id),
                    ...this.filteredPublishClips.map((clip) => clip.unique_id)
                ]);
                return this.clips.filter((clip) => publishIds.has(clip.unique_id));
            }

            if (!this.logicSourceId) {
                return [];
            }

            const nodeIds = new Set([this.logicSourceId]);
            this.edges
                .filter((edge) => edge.from_id === this.logicSourceId && edge.to_id)
                .forEach((edge) => nodeIds.add(edge.to_id));

            return this.clips.filter((clip) => nodeIds.has(clip.unique_id));
        },
        displayedGraphEdges() {
            const nodeMap = keyedById(this.displayedGraphNodes);
            const edges = [];

            if (this.isPublishGraphMode || this.view === 'publish') {
                for (let i = 0; i < this.storySequence.length - 1; i += 1) {
                    const from = nodeMap.get(this.storySequence[i].id);
                    const to = nodeMap.get(this.storySequence[i + 1].id);
                    if (!from || !to) continue;
                    edges.push(this.buildGraphEdge({
                        id: `seq-${from.unique_id}-${to.unique_id}-${i}`,
                        from,
                        to,
                        label: 'Sequence',
                        isSequence: true
                    }));
                }
            }

            this.edges.forEach((edge) => {
                if (!edge.to_id) return;
                const from = nodeMap.get(edge.from_id);
                const to = nodeMap.get(edge.to_id);
                if (!from || !to) return;
                edges.push(this.buildGraphEdge({
                    id: edge.id,
                    from,
                    to,
                    label: edge.label || 'Choice',
                    isReturn: asBool(edge.return_to_main),
                    isSequence: false
                }));
            });

            return edges;
        }
    },
    watch: {
        clipSpeed() {
            this.syncEditorMedia();
        },
        clipVolume() {
            this.syncEditorMedia();
        },
        logicMuteVideo(value) {
            if (this.$refs.logicPlayer) {
                this.$refs.logicPlayer.muted = !!value;
            }
        },
        previewVolume() {
            this.updatePreviewVolume();
        },
        storySequence: {
            handler() {
                this.refreshDiagnosticsIfVisible();
            },
            deep: true
        },
        view(nextView) {
            if (nextView === 'stats') this.fetchStats();
            if (nextView === 'achievements') this.fetchAchievements();
            if (nextView === 'publish') {
                this.fetchExports();
                this.refreshData();
            }
        }
    },
    async mounted() {
        this.previewQteKeyHandler = (event) => this.handlePreviewQte(event);
        window.addEventListener('resize', this.refreshOverlayLayout);
        await this.fetchProjects();
    },
    beforeUnmount() {
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        window.removeEventListener('resize', this.refreshOverlayLayout);
        this.cleanupPreviewInteractions();
    },
    methods: {
        showToast(message, type = 'success') {
            if (this.toastTimer) {
                clearTimeout(this.toastTimer);
            }
            this.toast = {
                show: true,
                msg: message,
                type
            };
            this.toastTimer = setTimeout(() => {
                this.toast.show = false;
            }, 2600);
        },
        showError(error) {
            console.error(error);
            this.showToast(error?.message || 'Something went wrong.', 'error');
        },
        refreshOverlayLayout() {
            this.layoutTick += 1;
        },
        confirmAction(title, message, onConfirm) {
            this.confirmModal = {
                show: true,
                title,
                message,
                onConfirm
            };
        },
        clipSignature(clip) {
            if (!clip) return '';
            return JSON.stringify({
                id: clip.unique_id,
                name: clip.name || '',
                chapter_name: clip.chapter_name || '',
                title_card: clip.title_card || '',
                subtitle_text: clip.subtitle_text || '',
                scene_notes: clip.scene_notes || '',
                preset_id: clip.preset_id || '',
                is_game_over: asBool(clip.is_game_over),
                bg_music: clip.bg_music || '',
                mute_audio: asBool(clip.mute_audio)
            });
        },
        syncLibraryBaseline(clip) {
            this.libraryBaselineSignature = clip ? this.clipSignature(clip) : '';
        },
        async fetchProjects() {
            try {
                this.projects = await apiGet('/api/projects');
            } catch (error) {
                this.showError(error);
            }
        },
        async createProject() {
            this.projectDraftTitle = '';
            this.projectModalOpen = true;
        },
        async submitProject() {
            const title = this.projectDraftTitle.trim();
            if (!title) {
                this.showToast('Project title is required.', 'error');
                return;
            }
            try {
                const response = await apiPost('/api/projects', { title });
                this.projectModalOpen = false;
                await this.fetchProjects();
                const created = this.projects.find((project) => Number(project.id) === Number(response?.projectId))
                    || this.projects.find((project) => project.title === title)
                    || this.projects[0];
                if (created) {
                    await this.selectProject(created);
                }
                this.showToast('Project created.');
            } catch (error) {
                this.showError(error);
            }
        },
        async selectProject(project) {
            this.currentProject = project;
            this.projectColor = project.theme_color || DEFAULT_THEME_COLOR;
            this.publishTitle = project.title || 'Untitled Movie';
            this.storySequence = [];
            this.storyDiagnostics = defaultStoryDiagnostics();
            this.statsSummary = defaultAnalyticsSummary();
            this.scenePresets = [];
            this.librarySelectedClip = null;
            this.syncLibraryBaseline(null);
            this.view = 'editor';
            await this.refreshData();
            await this.ensureEditorSelection(true);
        },
        async refreshData() {
            if (!this.currentProject) return;
            try {
                const projectId = this.currentProject.id;
                const [videos, story, audio, images] = await Promise.all([
                    apiGet(`/api/videos?projectId=${projectId}`),
                    apiGet(`/api/story?projectId=${projectId}`),
                    apiGet('/api/audio'),
                    apiGet('/api/images')
                ]);

                this.videos = videos;
                this.audioFiles = audio;
                this.imageFiles = images;
                this.clips = normalizeClipRows(story.clips || []);
                this.edges = story.edges || [];
                this.scenePresets = story.presets || [];

                if (this.selectedVidId && !this.videos.some((video) => Number(video.id) === Number(this.selectedVidId))) {
                    this.selectedVidId = null;
                    this.videoUrl = null;
                }

                if (this.librarySelectedClip) {
                    const current = this.clips.find((clip) => clip.unique_id === this.librarySelectedClip.unique_id);
                    this.librarySelectedClip = current ? normalizeClipMeta(deepClone(current)) : null;
                    this.syncLibraryBaseline(this.librarySelectedClip);
                }

                this.syncStorySequence();
                this.refreshDiagnosticsIfVisible();

                if (this.logicSourceId && !this.clips.some((clip) => clip.unique_id === this.logicSourceId)) {
                    this.logicSourceId = null;
                    this.logicSourceClip = null;
                    this.logicActiveClip = null;
                    this.existingLogicBlocks = [];
                } else if (this.logicSourceId) {
                    await this.loadLogicSource();
                }

                if (this.view === 'editor') {
                    await this.ensureEditorSelection(!this.subClips.length && !this.eventClips.length);
                }
            } catch (error) {
                this.showError(error);
            }
        },
        syncStorySequence() {
            if (!this.storySequence.length) return;
            const clipMap = keyedById(this.clips);
            this.storySequence = this.storySequence
                .map((item) => {
                    const clip = clipMap.get(item.id);
                    return clip ? { ...item, name: clip.name } : null;
                })
                .filter(Boolean);
        },
        async ensureEditorSelection(preferSource = false) {
            if (this.librarySelectedClip?.unique_id) return;
            if (!preferSource && this.subClips.length) {
                this.selectEditorClip(this.subClips[0]);
                return;
            }
            if (this.eventClips.length && !preferSource) {
                this.selectEditorClip(this.eventClips[0]);
                return;
            }
            if (this.videos.length) {
                await this.selectEditorSource(this.videos[0]);
            }
        },
        setView(viewId) {
            this.view = viewId;
        },
        editorBinClass(binId) {
            return this.editorBin === binId
                ? 'workspace-chip workspace-chip-active'
                : 'workspace-chip';
        },
        navClass(viewId) {
            const isActive = this.view === viewId;
            return [
                'glass-btn px-3 py-1.5 rounded-lg font-bold',
                isActive ? 'bg-blue-600 text-white border-blue-400 shadow-lg' : ''
            ].join(' ');
        },
        workspaceNavClass(item) {
            const active = this.currentWorkspaceGroup === item.id || this.view === item.id;
            return [
                'workspace-nav-btn',
                active ? 'workspace-nav-btn-active' : ''
            ].join(' ').trim();
        },
        workspaceChipClass(viewId) {
            return this.view === viewId ? 'workspace-chip workspace-chip-active' : 'workspace-chip';
        },
        workspaceItem(viewId) {
            return getWorkspaceItem(viewId);
        },
        async selectEditorSource(video) {
            if (!video) return;
            this.editorSelectedInteractionKey = null;
            this.librarySelectedClip = null;
            this.syncLibraryBaseline(null);
            this.selectedVidId = video.id;
            if (!this.clipName.trim()) {
                this.clipName = clipDisplayName(video.filename || 'New Scene');
            }
            await this.loadVideo();
        },
        selectEditorClip(clip) {
            if (!clip) return;
            this.editorSelectedInteractionKey = null;
            this.librarySelectedClip = normalizeClipMeta(deepClone(clip));
            this.presetDraftName = `${clipDisplayName(clip.name)} Preset`.trim();
            this.syncLibraryBaseline(this.librarySelectedClip);
            if (!String(clip.name || '').startsWith('FULL:')) {
                this.logicSourceId = clip.unique_id;
            }
        },
        editorTimelineItemStyle(item) {
            return {
                left: `${item.left}%`,
                width: `${item.width}%`
            };
        },
        editorSequenceItemClass(item) {
            const selected = this.editorSelectedSceneClip?.unique_id === item.id;
            return [
                'timeline-segment-card',
                selected ? 'is-selected' : '',
                item.isMissing ? 'is-missing' : ''
            ].join(' ').trim();
        },
        editorInteractionClass(item) {
            const selected = this.editorSelectedInteractionKey === item.key;
            return [
                'timeline-interaction-card',
                selected ? 'is-selected' : '',
                item.usesHotspot ? 'is-hotspot' : ''
            ].join(' ').trim();
        },
        selectEditorInteraction(item) {
            if (!item) return;
            this.editorSelectedInteractionKey = item.key;
            const sourceClip = this.clips.find((clip) => clip.unique_id === item.clipId);
            if (sourceClip) {
                this.selectEditorClip(sourceClip);
                this.editorSelectedInteractionKey = item.key;
            }
        },
        clearEditorInteractionSelection() {
            this.editorSelectedInteractionKey = null;
        },
        async openEditorBranches(clipId = null, blockId = null) {
            const targetClipId = clipId || this.editorSelectedSceneClip?.unique_id || this.logicSourceId;
            if (!targetClipId) {
                this.showToast('Select a scene first.', 'error');
                return;
            }
            this.view = 'logic';
            this.logicSourceId = targetClipId;
            await nextTick();
            await this.loadLogicSource();
            if (blockId) {
                const block = this.existingLogicBlocks.find((item) => String(item.id) === String(blockId));
                if (block) {
                    this.currentEditingBlock = deepClone(block);
                    this.showLogicOverlay = true;
                }
            }
        },
        async openEditorClipper(videoId = null) {
            if (videoId) {
                this.selectedVidId = videoId;
            }
            this.view = 'clipper';
            await nextTick();
            if (this.selectedVidId) {
                await this.loadVideo();
            }
        },
        editorInteractionSummary(block) {
            if (!block) return 'Select a choice pod from the interaction track.';
            const parts = [
                `${block.choices?.length || 0} option${(block.choices?.length || 0) === 1 ? '' : 's'}`
            ];
            if (block.behaviorType === 'qte') parts.push('QTE');
            if (asNumber(block.timeoutSeconds, 0) > 0) parts.push(`${asNumber(block.timeoutSeconds, 0)}s timer`);
            if ((block.choices || []).some((choice) => choiceUsesHotspot(choice))) parts.push('Hotspots');
            return parts.join(' • ');
        },
        editorClipBlockCount(clipId) {
            if (!clipId) return 0;
            return groupEdgesIntoBlocks(this.edges, clipId).length;
        },
        handleFileSelect(event) {
            this.selectedFile = event.target.files?.[0] || null;
        },
        setSelectedFile(file) {
            if (!file) return;
            this.selectedFile = file;
            this.isUploadDragOver = false;
        },
        onUploadDragOver(event) {
            event.preventDefault();
            this.isUploadDragOver = true;
        },
        onUploadDragLeave() {
            this.isUploadDragOver = false;
        },
        onUploadDrop(event) {
            event.preventDefault();
            const file = event.dataTransfer?.files?.[0];
            if (file) {
                this.setSelectedFile(file);
            }
            this.isUploadDragOver = false;
        },
        async uploadVideo() {
            if (!this.selectedFile || !this.currentProject) return;
            this.uploading = true;
            try {
                const formData = new FormData();
                formData.append('file', this.selectedFile);
                formData.append('projectId', this.currentProject.id);
                await apiUpload('/api/upload', formData);
                this.selectedFile = null;
                if (this.$refs.fileInput) {
                    this.$refs.fileInput.value = '';
                }
                await this.refreshData();
                if (this.videos.length) {
                    this.selectedVidId = this.videos[0].id;
                    await this.loadVideo();
                }
                this.view = 'editor';
                await this.ensureEditorSelection(true);
                this.showToast('Media imported.');
            } catch (error) {
                this.showError(error);
            } finally {
                this.uploading = false;
            }
        },
        syncEditorMedia() {
            ['video', 'eventVideo'].forEach((refName) => {
                const player = this.$refs[refName];
                if (!player) return;
                player.playbackRate = asNumber(this.clipSpeed, 1);
                player.volume = clamp(asNumber(this.clipVolume, 1), 0, 2);
            });
        },
        async loadVideo() {
            const video = this.selectedVideoRecord;
            this.videoUrl = video?.filepath || null;
            this.clipStart = 0;
            this.clipEnd = video?.duration || 0;
            if (!this.isEditingEvent) {
                this.clipName = video ? `${clipDisplayName(video.filename)} Scene` : '';
            }
            await nextTick();
            this.syncEditorMedia();
        },
        async deleteVideo() {
            if (!this.selectedVidId) return;
            this.confirmAction(
                'Delete Source',
                'Delete this imported video and every derived clip from it?',
                async () => {
                    try {
                        await apiPost('/api/delete_video', { id: this.selectedVidId });
                        this.selectedVidId = null;
                        this.videoUrl = null;
                        await this.refreshData();
                        this.showToast('Source video deleted.');
                    } catch (error) {
                        this.showError(error);
                    }
                }
            );
        },
        updateProgress() {
            const player = this.$refs.video;
            if (!player) return;
            this.syncEditorMedia();
        },
        updateEventProgress() {
            const player = this.$refs.eventVideo;
            if (!player) return;
            this.syncEditorMedia();
        },
        seekTimeline(event) {
            const player = this.$refs.video;
            if (!player?.duration) return;
            this.seekPlayerTo(event, player);
        },
        seekEventTimeline(event) {
            const player = this.$refs.eventVideo;
            if (!player?.duration) return;
            this.seekPlayerTo(event, player);
        },
        seekPlayerTo(event, player) {
            const rect = event.currentTarget.getBoundingClientRect();
            const pct = clamp((event.clientX - rect.left) / rect.width, 0, 1);
            player.currentTime = pct * player.duration;
        },
        nudge(edge, delta) {
            if (edge === 'start') {
                this.clipStart = clamp(asNumber(this.clipStart, 0) + delta, 0, Math.max(asNumber(this.clipEnd, 0) - 0.1, 0));
                return;
            }
            const maxDuration = this.selectedVideoRecord?.duration || this.logicActiveClip?.duration || asNumber(this.clipEnd, 0);
            this.clipEnd = clamp(asNumber(this.clipEnd, 0) + delta, Math.max(asNumber(this.clipStart, 0) + 0.1, 0.1), maxDuration || asNumber(this.clipEnd, 0) + delta);
        },
        setStart() {
            const player = this.view === 'eventCreator' ? this.$refs.eventVideo : this.$refs.video;
            if (!player) return;
            this.clipStart = clamp(player.currentTime, 0, Math.max(this.clipEnd - 0.1, 0));
        },
        setEnd() {
            const player = this.view === 'eventCreator' ? this.$refs.eventVideo : this.$refs.video;
            if (!player) return;
            const maxDuration = this.selectedVideoRecord?.duration || player.duration || this.clipEnd;
            this.clipEnd = clamp(player.currentTime, Math.max(this.clipStart + 0.1, 0.1), maxDuration);
        },
        formatDuration(seconds) {
            return formatClock(asNumber(seconds, 0));
        },
        formatTime(seconds) {
            return formatClock(asNumber(seconds, 0));
        },
        async cutClip() {
            if (!this.currentProject || !this.selectedVidId) return;
            this.creatingClip = true;
            try {
                const response = await apiPost('/api/clip', {
                    projectId: this.currentProject.id,
                    sourceId: this.selectedVidId,
                    start: this.clipStart,
                    end: this.clipEnd,
                    name: this.clipName || `Scene ${this.subClips.length + 1}`,
                    filter: this.clipFilter,
                    speed: this.clipSpeed,
                    volume: this.clipVolume
                });
                await this.refreshData();
                const createdClip = this.clips.find((clip) => clip.unique_id === response.clipId) || this.clips[0] || null;
                this.librarySelectedClip = createdClip ? normalizeClipMeta(deepClone(createdClip)) : null;
                this.syncLibraryBaseline(this.librarySelectedClip);
                this.view = 'editor';
                this.showToast('Scene created.');
            } catch (error) {
                this.showError(error);
            } finally {
                this.creatingClip = false;
            }
        },
        resetEventEditor() {
            this.isEditingEvent = false;
            this.editingEventId = null;
            this.eventChoices = buildChoiceSet();
            this.showTestChoices = false;
            this.previewEventClip = null;
            this.testChoices = [];
            this.testBlocks = [];
            this.testTriggeredBlocks = new Set();
        },
        buildEventChoicesFromClip(clipId) {
            const block = groupEdgesIntoBlocks(this.edges, clipId)[0];
            if (!block) {
                return buildChoiceSet();
            }
            return block.choices.map((choice) => createEventChoice({
                label: choice.label,
                toId: choice.toId,
                color: choice.color,
                returnToMain: choice.return || choice.returnToMain,
                setVar: choice.setVar,
                reqVar: choice.reqVar
            }));
        },
        async createEventClip() {
            if (!this.currentProject || !this.selectedVidId) return;
            this.creatingClip = true;
            try {
                await apiPost('/api/create_event_clip', {
                    projectId: this.currentProject.id,
                    sourceId: this.selectedVidId,
                    start: this.clipStart,
                    end: this.clipEnd,
                    name: this.clipName || `Event ${this.eventClips.length + 1}`,
                    choices: this.eventChoices
                });
                await this.refreshData();
                this.resetEventEditor();
                this.showToast('Event clip created.');
            } catch (error) {
                this.showError(error);
            } finally {
                this.creatingClip = false;
            }
        },
        async saveEventChanges() {
            if (!this.currentProject || !this.editingEventId) return;
            try {
                await apiPost('/api/update_event_logic', {
                    projectId: this.currentProject.id,
                    clipId: this.editingEventId,
                    name: this.clipName,
                    choices: this.eventChoices
                });
                await this.refreshData();
                this.showToast('Event updated.');
            } catch (error) {
                this.showError(error);
                throw error;
            }
        },
        async saveAndTestEvent() {
            await this.saveEventChanges();
            const clip = this.clips.find((item) => item.unique_id === this.editingEventId);
            if (clip) {
                this.testEventClip(clip);
            }
        },
        cancelEventEdit() {
            this.resetEventEditor();
            this.clipName = '';
            if (this.selectedVidId) {
                this.loadVideo();
            }
        },
        editEvent(clip) {
            this.isEditingEvent = true;
            this.editingEventId = clip.unique_id;
            this.clipName = clip.name;
            this.videoUrl = clip.filepath;
            this.eventChoices = this.buildEventChoicesFromClip(clip.unique_id);
            this.previewEventClip = null;
            this.showTestChoices = false;
        },
        testEventClip(clip) {
            this.previewEventClip = clip;
            this.showTestChoices = false;
            this.testChoices = [];
            this.testBlocks = groupEdgesIntoBlocks(this.edges, clip.unique_id, { forPreview: true });
            this.testTriggeredBlocks = new Set();
            nextTick(() => {
                const player = this.$refs.testPlayer;
                if (!player) return;
                player.currentTime = 0;
                player.play().catch(() => {});
            });
        },
        closeTestEvent() {
            const player = this.$refs.testPlayer;
            if (player) {
                player.pause();
            }
            this.previewEventClip = null;
            this.showTestChoices = false;
            this.testChoices = [];
            this.testBlocks = [];
            this.testTriggeredBlocks = new Set();
        },
        checkTestLogic() {
            const player = this.$refs.testPlayer;
            if (!player || !this.previewEventClip || this.showTestChoices) return;
            const block = this.testBlocks.find((item) => (
                player.currentTime >= item.time
                && player.currentTime < item.time + 1.5
                && !this.testTriggeredBlocks.has(item.id)
            ));
            if (!block) return;
            this.testTriggeredBlocks.add(block.id);
            player.pause();
            this.testChoices = block.choices;
            this.showTestChoices = true;
        },
        handleTestEnd() {
            if (this.showTestChoices) return;
            if (this.previewEventClip?.is_game_over) {
                this.showToast('Event test ended on a game-over branch.', 'error');
            }
            this.closeTestEvent();
        },
        simulateChoice(choice) {
            const targetId = choiceTargetId(choice);
            this.showTestChoices = false;
            if (!targetId) {
                this.closeTestEvent();
                return;
            }
            const nextClip = this.clips.find((clip) => clip.unique_id === targetId);
            if (!nextClip) {
                this.closeTestEvent();
                return;
            }
            this.testEventClip(nextClip);
        },
        async copyToClipboard(value) {
            try {
                await navigator.clipboard.writeText(value);
                this.showToast('Copied to clipboard.');
            } catch (error) {
                this.showError(error);
            }
        },
        toggleSelectionMode() {
            this.selectionMode = !this.selectionMode;
            this.selectedClipIds = [];
            this.batchChapterName = '';
            this.batchPresetId = '';
            this.batchEndingState = 'keep';
            if (this.selectionMode) {
                this.librarySelectedClip = null;
                this.syncLibraryBaseline(null);
            }
        },
        handleClipClick(clip) {
            if (this.selectionMode) {
                if (this.selectedClipIds.includes(clip.unique_id)) {
                    this.selectedClipIds = this.selectedClipIds.filter((id) => id !== clip.unique_id);
                } else {
                    this.selectedClipIds = [...this.selectedClipIds, clip.unique_id];
                }
                return;
            }
            this.librarySelectedClip = normalizeClipMeta(deepClone(clip));
            this.presetDraftName = `${clipDisplayName(clip.name)} Preset`.trim();
            this.syncLibraryBaseline(this.librarySelectedClip);
        },
        getItemClass(clip) {
            if (this.selectionMode) {
                return this.selectedClipIds.includes(clip.unique_id)
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-white/5 hover:bg-white/5';
            }
            return this.librarySelectedClip?.unique_id === clip.unique_id
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-white/5 hover:bg-white/5';
        },
        async deleteSelectedClips() {
            if (!this.selectedClipIds.length) return;
            this.confirmAction(
                'Delete Selected Clips',
                `Delete ${this.selectedClipIds.length} selected clips?`,
                async () => {
                    try {
                        await apiPost('/api/delete_clips_bulk', { ids: this.selectedClipIds });
                        this.selectedClipIds = [];
                        await this.refreshData();
                        this.showToast('Selected clips deleted.');
                    } catch (error) {
                        this.showError(error);
                    }
                }
            );
        },
        async batchUpdateSelectedClips(transform) {
            const clipMap = keyedById(this.clips);
            for (const clipId of this.selectedClipIds) {
                const clip = clipMap.get(clipId);
                if (!clip) continue;
                const next = transform(normalizeClipMeta(deepClone(clip)));
                await apiPost('/api/clip/update', {
                    id: next.unique_id,
                    name: next.name,
                    isGameOver: asBool(next.is_game_over),
                    chapterName: next.chapter_name,
                    titleCard: next.title_card,
                    subtitleText: next.subtitle_text,
                    sceneNotes: next.scene_notes,
                    presetId: next.preset_id || null,
                    bgMusic: next.bg_music || null,
                    muteAudio: next.mute_audio
                });
            }
        },
        async applyBatchChapter() {
            if (!this.selectedClipIds.length || !this.batchChapterName.trim()) return;
            try {
                await this.batchUpdateSelectedClips((clip) => ({
                    ...clip,
                    chapter_name: this.batchChapterName.trim()
                }));
                await this.refreshData();
                this.showToast('Chapter applied to selected scenes.');
            } catch (error) {
                this.showError(error);
            }
        },
        async applyBatchPreset() {
            if (!this.selectedClipIds.length || !this.batchPresetId) return;
            try {
                for (const clipId of this.selectedClipIds) {
                    await apiPost('/api/presets/apply', {
                        projectId: this.currentProject.id,
                        presetId: this.batchPresetId,
                        clipId
                    });
                }
                await this.refreshData();
                this.showToast('Preset applied to selected scenes.');
            } catch (error) {
                this.showError(error);
            }
        },
        async applyBatchEndingState() {
            if (!this.selectedClipIds.length || this.batchEndingState === 'keep') return;
            try {
                const nextValue = this.batchEndingState === 'ending';
                await this.batchUpdateSelectedClips((clip) => ({
                    ...clip,
                    is_game_over: nextValue ? 1 : 0
                }));
                await this.refreshData();
                this.showToast('Ending state updated.');
            } catch (error) {
                this.showError(error);
            }
        },
        async saveClipDetails() {
            if (!this.librarySelectedClip) return;
            this.savingClip = true;
            try {
                await apiPost('/api/clip/update', {
                    id: this.librarySelectedClip.unique_id,
                    name: this.librarySelectedClip.name,
                    isGameOver: asBool(this.librarySelectedClip.is_game_over),
                    chapterName: this.librarySelectedClip.chapter_name,
                    titleCard: this.librarySelectedClip.title_card,
                    subtitleText: this.librarySelectedClip.subtitle_text,
                    sceneNotes: this.librarySelectedClip.scene_notes,
                    presetId: this.librarySelectedClip.preset_id || null
                });
                await this.refreshData();
                const clip = this.clips.find((item) => item.unique_id === this.librarySelectedClip.unique_id);
                this.librarySelectedClip = clip ? normalizeClipMeta(deepClone(clip)) : null;
                this.syncLibraryBaseline(this.librarySelectedClip);
                this.showToast('Clip updated.');
            } catch (error) {
                this.showError(error);
            } finally {
                this.savingClip = false;
            }
        },
        async captureThumbnail() {
            if (!this.librarySelectedClip || !this.$refs.libraryPlayer) return;
            try {
                const response = await apiPost('/api/clip/thumbnail', {
                    id: this.librarySelectedClip.unique_id,
                    time: this.$refs.libraryPlayer.currentTime
                });
                this.librarySelectedClip.thumbnail = response.thumbnail;
                await this.refreshData();
                this.showToast('Thumbnail updated.');
            } catch (error) {
                this.showError(error);
            }
        },
        async deleteClip(uniqueId) {
            this.confirmAction(
                'Delete Clip',
                'Delete this clip and all of its links?',
                async () => {
                    try {
                        await apiPost('/api/delete_clip', { unique_id: uniqueId });
                        await this.refreshData();
                        if (this.librarySelectedClip?.unique_id === uniqueId) {
                            this.librarySelectedClip = null;
                        }
                        this.showToast('Clip deleted.');
                    } catch (error) {
                        this.showError(error);
                    }
                }
            );
        },
        presetLabel(presetId) {
            return this.scenePresets.find((preset) => preset.preset_id === presetId)?.name || 'Custom';
        },
        async saveScenePreset() {
            if (!this.currentProject || !this.librarySelectedClip) return;
            const presetName = String(this.presetDraftName || '').trim();
            if (!presetName) {
                this.showToast('Preset name is required.', 'error');
                return;
            }
            try {
                const response = await apiPost('/api/presets', {
                    projectId: this.currentProject.id,
                    presetId: this.librarySelectedClip.preset_id || null,
                    name: presetName,
                    chapterName: this.librarySelectedClip.chapter_name,
                    titleCard: this.librarySelectedClip.title_card,
                    subtitleText: this.librarySelectedClip.subtitle_text,
                    sceneNotes: this.librarySelectedClip.scene_notes,
                    bgMusic: this.librarySelectedClip.bg_music,
                    muteAudio: this.librarySelectedClip.mute_audio,
                    isGameOver: this.librarySelectedClip.is_game_over
                });
                this.librarySelectedClip.preset_id = response.presetId;
                await this.saveClipDetails();
                this.showToast('Scene preset saved.');
            } catch (error) {
                this.showError(error);
            }
        },
        async applyScenePreset() {
            if (!this.currentProject || !this.librarySelectedClip?.preset_id) return;
            try {
                await apiPost('/api/presets/apply', {
                    projectId: this.currentProject.id,
                    presetId: this.librarySelectedClip.preset_id,
                    clipId: this.librarySelectedClip.unique_id
                });
                await this.refreshData();
                const clip = this.clips.find((item) => item.unique_id === this.librarySelectedClip.unique_id);
                this.librarySelectedClip = clip ? normalizeClipMeta(deepClone(clip)) : null;
                this.syncLibraryBaseline(this.librarySelectedClip);
                this.showToast('Preset applied to scene.');
            } catch (error) {
                this.showError(error);
            }
        },
        async deleteScenePreset(presetId) {
            if (!this.currentProject || !presetId) return;
            this.confirmAction(
                'Delete Scene Preset',
                'Delete this reusable scene preset?',
                async () => {
                    try {
                        await apiPost('/api/delete_preset', {
                            projectId: this.currentProject.id,
                            presetId
                        });
                        await this.refreshData();
                        if (this.librarySelectedClip?.preset_id === presetId) {
                            this.librarySelectedClip.preset_id = '';
                        }
                        this.showToast('Scene preset deleted.');
                    } catch (error) {
                        this.showError(error);
                    }
                }
            );
        },
        async loadLogicSource() {
            if (!this.logicSourceId) return;
            const clip = this.clips.find((item) => item.unique_id === this.logicSourceId);
            if (!clip) return;
            this.logicSourceClip = clip;
            this.logicActiveClip = clip;
            this.logicBgMusic = clip.bg_music || null;
            this.logicMuteVideo = asBool(clip.mute_audio);
            this.existingLogicBlocks = groupEdgesIntoBlocks(this.edges, clip.unique_id);
            this.currentEditingBlock = null;
            this.showLogicOverlay = false;
            this.logicCurrentTime = 0;
            this.logicTriggeredBlocks = new Set();
            this.logicHistoryStack = [];
            this.logicGameState = {};
            this.isPlayingSubClip = false;
            this.seenSegments = [];
            await nextTick();
            const player = this.$refs.logicPlayer;
            if (player) {
                player.currentTime = 0;
                player.muted = this.logicMuteVideo;
                this.refreshOverlayLayout();
            }
        },
        async openGraph() {
            if (!this.logicSourceId && this.masterClips[0]) {
                this.logicSourceId = this.masterClips[0].unique_id;
            }
            if (!this.logicSourceId) {
                this.showToast('Select a scene first.', 'error');
                return;
            }
            this.isGraphMode = true;
            await nextTick();
            if (this.graphNeedsAutoLayout()) {
                await this.autoLayout();
                return;
            }
            await this.fitGraphView();
        },
        toggleTestMode() {
            this.isTestMode = !this.isTestMode;
            this.showLogicOverlay = false;
            this.currentEditingBlock = null;
            this.logicTriggeredBlocks = new Set();
            this.logicGameState = {};
            this.logicHistoryStack = [];
            this.isPlayingSubClip = false;
            if (this.logicSourceClip) {
                this.logicActiveClip = this.logicSourceClip;
                nextTick(() => {
                    const player = this.$refs.logicPlayer;
                    if (!player) return;
                    player.currentTime = 0;
                    player.play().catch(() => {});
                });
            }
        },
        playPreviewMusic(path) {
            const bgm = this.$refs.bgmPreview;
            if (!bgm) return;
            if (!path) {
                bgm.pause();
                bgm.removeAttribute('src');
                return;
            }
            if (!bgm.src.includes(path)) {
                bgm.src = path;
                bgm.volume = 0.3;
                bgm.play().catch(() => {});
            }
        },
        async uploadAudio(event) {
            const file = event.target.files?.[0];
            if (!file || !this.currentProject) return;
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('projectId', this.currentProject.id);
                await apiUpload('/api/upload', formData);
                this.audioFiles = await apiGet('/api/audio');
                this.showToast('Audio uploaded.');
            } catch (error) {
                this.showError(error);
            } finally {
                if (this.$refs.audioInput) {
                    this.$refs.audioInput.value = '';
                }
            }
        },
        updateLogicProgress() {
            const player = this.$refs.logicPlayer;
            if (!player || !this.logicActiveClip) return;
            this.logicCurrentTime = player.currentTime;
            if (!this.isTestMode || this.isPlayingSubClip || this.showLogicOverlay) {
                return;
            }

            const block = this.existingLogicBlocks.find((item) => (
                player.currentTime >= item.triggerTime
                && player.currentTime < item.triggerTime + 1.5
                && !this.logicTriggeredBlocks.has(item.id)
            ));

            if (!block) return;

            this.logicTriggeredBlocks.add(block.id);
            player.pause();
            this.currentEditingBlock = deepClone(block);
            this.showLogicOverlay = true;
        },
        handleOptionClick(option) {
            if (!this.isTestMode) return;
            const targetId = choiceTargetId(option);
            if (!targetId) {
                this.showLogicOverlay = false;
                return;
            }
            const targetClip = this.clips.find((clip) => clip.unique_id === targetId);
            if (!targetClip) return;

            if (option.setVar) {
                this.logicGameState = applyVarExpression(this.logicGameState, option.setVar);
            }
            if (option.return) {
                this.logicHistoryStack.push({
                    clipId: this.logicSourceClip.unique_id,
                    time: this.currentEditingBlock?.triggerTime || this.logicCurrentTime
                });
            }

            this.logicActiveClip = targetClip;
            this.isPlayingSubClip = true;
            this.showLogicOverlay = false;

            nextTick(() => {
                const player = this.$refs.logicPlayer;
                if (!player) return;
                player.currentTime = 0;
                player.play().catch(() => {});
            });
        },
        finishSubClip() {
            if (!this.logicSourceClip) return;
            const previous = this.logicHistoryStack.pop();
            this.logicActiveClip = this.logicSourceClip;
            this.isPlayingSubClip = false;
            nextTick(() => {
                const player = this.$refs.logicPlayer;
                if (!player) return;
                player.currentTime = (previous?.time || 0) + 0.15;
                player.play().catch(() => {});
            });
        },
        jumpTime(event) {
            const player = this.$refs.logicPlayer;
            if (!player?.duration) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const pct = clamp((event.clientX - rect.left) / rect.width, 0, 1);
            player.currentTime = pct * player.duration;
        },
        createNewBlockAtCurrentTime() {
            this.currentEditingBlock = createChoiceBlock(this.logicCurrentTime);
            this.showLogicOverlay = true;
        },
        editBlock(block) {
            this.currentEditingBlock = deepClone(block);
            this.showLogicOverlay = true;
        },
        addOption() {
            if (!this.currentEditingBlock) return;
            this.currentEditingBlock.choices.push(createChoice());
        },
        logicBlockSummary(block) {
            const summary = [];
            if ((block.choices?.length || 0) > 0) {
                summary.push(`${block.choices.length} options`);
            }
            if (block.behaviorType === 'qte') {
                summary.push('QTE');
            }
            if (asNumber(block.timeoutSeconds, 0) > 0) {
                summary.push(`${asNumber(block.timeoutSeconds, 0)}s auto-pick`);
            }
            if ((block.choices || []).some((choice) => choice.reqVar)) {
                summary.push('state gate');
            }
            if ((block.choices || []).some((choice) => choice.achievementId)) {
                summary.push('reward');
            }
            if ((block.choices || []).some((choice) => choiceUsesHotspot(choice))) {
                summary.push('hotspots');
            }
            return summary;
        },
        optionImpactSummary(option) {
            const summary = [];
            if (option.reqVar) summary.push(`Requires ${option.reqVar}`);
            if (option.setVar) summary.push(`Sets ${option.setVar}`);
            if (option.characterName) summary.push(`Affects ${option.characterName}`);
            if (option.achievementId) summary.push(`Unlocks ${option.achievementId}`);
            if (option.isDeadEnd) summary.push('Ends route');
            if (choiceUsesHotspot(option)) summary.push('Image hotspot');
            return summary;
        },
        async saveLogicSceneSettings() {
            if (!this.logicSourceClip) return;
            try {
                await apiPost('/api/clip/update', {
                    id: this.logicSourceClip.unique_id,
                    name: this.logicSourceClip.name,
                    isGameOver: asBool(this.logicSourceClip.is_game_over),
                    chapterName: this.logicSourceClip.chapter_name,
                    titleCard: this.logicSourceClip.title_card,
                    subtitleText: this.logicSourceClip.subtitle_text,
                    sceneNotes: this.logicSourceClip.scene_notes,
                    presetId: this.logicSourceClip.preset_id || null,
                    bgMusic: this.logicBgMusic || null,
                    muteAudio: this.logicMuteVideo
                });
                await this.refreshData();
                this.showToast('Scene playback settings saved.');
            } catch (error) {
                this.showError(error);
            }
        },
        async saveLogicBlock() {
            if (!this.currentProject || !this.logicSourceId || !this.currentEditingBlock) return;
            try {
                const payload = {
                    projectId: this.currentProject.id,
                    fromId: this.logicSourceId,
                    logicId: this.currentEditingBlock.id,
                    triggerTime: this.currentEditingBlock.triggerTime,
                    choices: serializeBlockChoices(this.currentEditingBlock),
                    bgMusic: this.logicBgMusic,
                    muteAudio: this.logicMuteVideo,
                    behaviorType: this.currentEditingBlock.behaviorType,
                    timeoutSeconds: asNumber(this.currentEditingBlock.timeoutSeconds, 0),
                    timeoutToId: this.currentEditingBlock.timeoutToId || null
                };
                await apiPost('/api/save_logic_block', payload);
                await this.refreshData();
                this.existingLogicBlocks = groupEdgesIntoBlocks(this.edges, this.logicSourceId);
                this.currentEditingBlock = null;
                this.showLogicOverlay = false;
                this.showToast('Logic saved.');
            } catch (error) {
                this.showError(error);
            }
        },
        async deleteLogicBlock() {
            if (!this.currentEditingBlock) return;
            try {
                await apiPost('/api/delete_logic_block', {
                    logicId: this.currentEditingBlock.id,
                    fromId: this.logicSourceId,
                    triggerTime: this.currentEditingBlock.triggerTime
                });
                await this.refreshData();
                this.existingLogicBlocks = groupEdgesIntoBlocks(this.edges, this.logicSourceId);
                this.currentEditingBlock = null;
                this.showLogicOverlay = false;
                this.showToast('Logic block deleted.');
            } catch (error) {
                this.showError(error);
            }
        },
        buildGraphEdge({ id, from, to, label, isReturn = false, isSequence = false }) {
            const startX = asNumber(from.x, 0) + 90;
            const startY = asNumber(from.y, 0) + 50;
            const endX = asNumber(to.x, 0) + 90;
            const endY = asNumber(to.y, 0) + 50;
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            const controlX = (startX + endX) / 2;
            const path = `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
            return {
                id,
                path,
                label,
                midX,
                midY,
                isReturn,
                isSequence
            };
        },
        async saveNodePositions() {
            try {
                await apiPost('/api/clip/positions', {
                    updates: this.clips.map((clip) => ({
                        id: clip.unique_id,
                        x: asNumber(clip.x, 0),
                        y: asNumber(clip.y, 0)
                    }))
                });
                this.showToast('Node positions saved.');
            } catch (error) {
                this.showError(error);
            }
        },
        graphNeedsAutoLayout() {
            const nodes = this.displayedGraphNodes;
            if (!nodes.length) return false;
            return nodes.every((node) => !asNumber(node.x, 0) && !asNumber(node.y, 0));
        },
        getActiveGraphViewport() {
            if (this.isPublishGraphMode || this.view === 'publish') {
                return this.$refs.publishGraphViewport || null;
            }
            return this.$refs.logicGraphViewport || null;
        },
        async fitGraphView(padding = 120) {
            await nextTick();
            const viewport = this.getActiveGraphViewport();
            const nodes = this.displayedGraphNodes;
            if (!viewport || !nodes.length) return;

            const bounds = nodes.reduce((acc, node) => {
                const x = asNumber(node.x, 0);
                const y = asNumber(node.y, 0);
                acc.minX = Math.min(acc.minX, x);
                acc.minY = Math.min(acc.minY, y);
                acc.maxX = Math.max(acc.maxX, x + GRAPH_NODE_WIDTH);
                acc.maxY = Math.max(acc.maxY, y + GRAPH_NODE_HEIGHT);
                return acc;
            }, {
                minX: Number.POSITIVE_INFINITY,
                minY: Number.POSITIVE_INFINITY,
                maxX: Number.NEGATIVE_INFINITY,
                maxY: Number.NEGATIVE_INFINITY
            });

            const graphWidth = Math.max(bounds.maxX - bounds.minX, GRAPH_NODE_WIDTH);
            const graphHeight = Math.max(bounds.maxY - bounds.minY, GRAPH_NODE_HEIGHT);
            const availableWidth = Math.max(viewport.clientWidth - padding * 2, 240);
            const availableHeight = Math.max(viewport.clientHeight - padding * 2, 180);
            const nextZoom = clamp(Math.min(availableWidth / graphWidth, availableHeight / graphHeight), 0.5, 1.35);

            this.zoom = nextZoom;
            this.pan = {
                x: Math.round((viewport.clientWidth - graphWidth * nextZoom) / 2 - bounds.minX * nextZoom),
                y: Math.round((viewport.clientHeight - graphHeight * nextZoom) / 2 - bounds.minY * nextZoom)
            };
        },
        async autoLayout() {
            const nodes = [...this.displayedGraphNodes];
            if (!nodes.length) return;

            if (this.isPublishGraphMode || this.view === 'publish') {
                const sequenceIndex = new Map(this.storySequence.map((item, index) => [item.id, index]));
                const sequenceNodes = nodes
                    .filter((node) => sequenceIndex.has(node.unique_id))
                    .sort((a, b) => sequenceIndex.get(a.unique_id) - sequenceIndex.get(b.unique_id));
                const extraNodes = nodes
                    .filter((node) => !sequenceIndex.has(node.unique_id))
                    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

                sequenceNodes.forEach((node, index) => {
                    const column = index % 4;
                    const row = Math.floor(index / 4);
                    node.x = 120 + column * 250;
                    node.y = 120 + row * 180;
                });

                extraNodes.forEach((node, index) => {
                    const column = index % 4;
                    const row = Math.floor(index / 4);
                    node.x = 120 + column * 220;
                    node.y = 420 + row * 170;
                });
            } else {
                const sourceNode = nodes.find((node) => node.unique_id === this.logicSourceId) || nodes[0];
                const targetNodes = nodes.filter((node) => node.unique_id !== sourceNode?.unique_id);
                const visibleRows = Math.max(Math.min(targetNodes.length, 4), 1);

                if (sourceNode) {
                    sourceNode.x = 120;
                    sourceNode.y = 120 + ((visibleRows - 1) * 150) / 2;
                }

                targetNodes.forEach((node, index) => {
                    const column = Math.floor(index / 4);
                    const row = index % 4;
                    node.x = 420 + column * 240;
                    node.y = 120 + row * 150;
                });
            }

            await this.fitGraphView(this.isPublishGraphMode || this.view === 'publish' ? 90 : 120);
        },
        startPan(event) {
            if (event.target.closest('.graph-node')) return;
            this.isPanning = true;
            this.panStart = {
                x: event.clientX - this.pan.x,
                y: event.clientY - this.pan.y
            };
        },
        onGraphMouseMove(event) {
            if (this.dragNodeId) {
                const node = this.clips.find((clip) => clip.unique_id === this.dragNodeId);
                if (!node) return;
                node.x = (event.clientX - this.dragOffset.x - this.pan.x) / this.zoom;
                node.y = (event.clientY - this.dragOffset.y - this.pan.y) / this.zoom;
                return;
            }
            if (!this.isPanning) return;
            this.pan.x = event.clientX - this.panStart.x;
            this.pan.y = event.clientY - this.panStart.y;
        },
        endPan() {
            this.isPanning = false;
            this.dragNodeId = null;
        },
        zoomGraph(event) {
            const direction = Math.sign(event.deltaY);
            this.zoom = clamp(this.zoom - direction * 0.08, 0.5, 2);
        },
        startDragNode(event, node) {
            this.dragNodeId = node.unique_id;
            this.dragOffset = {
                x: event.offsetX,
                y: event.offsetY
            };
        },
        selectNode(node) {
            this.logicSourceId = node.unique_id;
            this.isGraphMode = false;
            this.loadLogicSource();
        },
        focusClipInLibrary(clipId) {
            const clip = this.clips.find((item) => item.unique_id === clipId);
            if (!clip) return;
            this.selectionMode = false;
            this.librarySelectedClip = normalizeClipMeta(deepClone(clip));
            this.syncLibraryBaseline(this.librarySelectedClip);
            this.view = 'library';
        },
        async focusClipInLogic(clipId) {
            const clip = this.clips.find((item) => item.unique_id === clipId);
            if (!clip) return;
            this.logicSourceId = clip.unique_id;
            this.view = 'logic';
            await this.loadLogicSource();
        },
        async jumpToIssue(issue) {
            if (issue.clipId) {
                this.focusClipInLibrary(issue.clipId);
                return;
            }
            if (issue.fromId) {
                await this.focusClipInLogic(issue.fromId);
                return;
            }
            if (issue.toId) {
                this.focusClipInLibrary(issue.toId);
            }
        },
        async fetchStoryDiagnostics() {
            if (!this.currentProject) return;
            this.diagnosticsLoading = true;
            try {
                this.storyDiagnostics = await apiPost('/api/story/diagnostics', {
                    projectId: this.currentProject.id,
                    sequence: this.storySequence
                });
            } catch (error) {
                this.showError(error);
            } finally {
                this.diagnosticsLoading = false;
            }
        },
        refreshDiagnosticsIfVisible() {
            if (!this.currentProject) return;
            if (this.view === 'publish' || this.view === 'stats') {
                this.fetchStoryDiagnostics();
            }
        },
        async fetchStats() {
            if (!this.currentProject) return;
            try {
                const [statsData, statsSummary] = await Promise.all([
                    apiGet(`/api/analytics/${this.currentProject.id}?source=published`),
                    apiGet(`/api/analytics/summary/${this.currentProject.id}?source=published`),
                    this.fetchStoryDiagnostics()
                ]);
                this.statsData = statsData;
                this.statsSummary = statsSummary;
                this.view = 'stats';
            } catch (error) {
                this.showError(error);
            }
        },
        async resetStats() {
            if (!this.currentProject) return;
            this.confirmAction(
                'Reset Analytics',
                'Delete published analytics for this project?',
                async () => {
                    try {
                        await apiPost('/api/analytics/reset', {
                            projectId: this.currentProject.id,
                            source: 'published'
                        });
                        await this.fetchStats();
                        this.showToast('Analytics reset.');
                    } catch (error) {
                        this.showError(error);
                    }
                }
            );
        },
        async fetchAchievements() {
            if (!this.currentProject) return;
            try {
                this.achievementsList = await apiGet(`/api/achievements/${this.currentProject.id}`);
                this.view = 'achievements';
            } catch (error) {
                this.showError(error);
            }
        },
        async createAchievement() {
            if (!this.currentProject) return;
            try {
                await apiPost('/api/achievements', {
                    projectId: this.currentProject.id,
                    achievementId: this.newAchievement.id,
                    name: this.newAchievement.name,
                    description: this.newAchievement.description,
                    icon: this.newAchievement.icon
                });
                this.newAchievement = defaultAchievement();
                await this.fetchAchievements();
                this.showToast('Achievement created.');
            } catch (error) {
                this.showError(error);
            }
        },
        async deleteAchievement(achievementId) {
            if (!this.currentProject) return;
            this.confirmAction(
                'Delete Achievement',
                'Delete this achievement from the project?',
                async () => {
                    try {
                        await apiPost('/api/delete_achievement', {
                            projectId: this.currentProject.id,
                            achievementId
                        });
                        await this.fetchAchievements();
                        this.showToast('Achievement deleted.');
                    } catch (error) {
                        this.showError(error);
                    }
                }
            );
        },
        achievementUsageCount(achievementId) {
            return this.achievementReferenceCounts[achievementId] || 0;
        },
        async openPublishGraph() {
            this.isPublishGraphMode = true;
            await nextTick();
            if (this.graphNeedsAutoLayout()) {
                await this.autoLayout();
                return;
            }
            await this.fitGraphView(90);
        },
        addToSequence(clip) {
            this.storySequence.push({
                id: clip.unique_id,
                name: clip.name
            });
        },
        moveSequence(index, direction) {
            const nextIndex = index + direction;
            if (nextIndex < 0 || nextIndex >= this.storySequence.length) return;
            const copy = [...this.storySequence];
            [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
            this.storySequence = copy;
        },
        removeFromSequence(index) {
            this.storySequence.splice(index, 1);
        },
        async saveSettings() {
            if (!this.currentProject) return;
            try {
                await apiPost('/api/project/settings', {
                    id: this.currentProject.id,
                    color: this.projectColor
                });
                this.currentProject.theme_color = this.projectColor;
                this.showToast('Theme updated.');
            } catch (error) {
                this.showError(error);
            }
        },
        async fetchExports() {
            try {
                this.exportsList = await apiGet('/api/exports');
            } catch (error) {
                this.showError(error);
            }
        },
        async publishProject() {
            if (!this.currentProject || !this.storySequence.length) return;
            await this.fetchStoryDiagnostics();
            if (this.storyDiagnostics.issues.some((issue) => issue.severity === 'error')) {
                this.showToast('Resolve story errors before publishing.', 'error');
                return;
            }
            this.publishing = true;
            try {
                const response = await apiPost('/api/publish', {
                    projectId: this.currentProject.id,
                    title: this.publishTitle || this.currentProject.title,
                    sequence: this.storySequence
                });
                this.publishUrl = response.url;
                await this.fetchExports();
                this.showToast('Build complete.');
            } catch (error) {
                this.showError(error);
            } finally {
                this.publishing = false;
            }
        },
        async deleteExport(name) {
            this.confirmAction(
                'Delete Build',
                'Delete this published export?',
                async () => {
                    try {
                        await apiPost('/api/delete_export', { name });
                        await this.fetchExports();
                        this.showToast('Build deleted.');
                    } catch (error) {
                        this.showError(error);
                    }
                }
            );
        },
        getClipName(id) {
            return this.clips.find((clip) => clip.unique_id === id)?.name || 'Unknown Scene';
        },
        getClipThumb(id) {
            return this.clips.find((clip) => clip.unique_id === id)?.thumbnail || '';
        },
        getClipPreview(id) {
            return this.clips.find((clip) => clip.unique_id === id)?.filepath || '';
        },
        getChoicePreviewVideo(target) {
            const root = target?.currentTarget || target?.target || target;
            if (!root) return null;
            if (typeof root.matches === 'function' && root.matches('video.choice-live-video')) {
                return root;
            }
            return root.querySelector?.('video.choice-live-video') || null;
        },
        getOverlayStageStyle(refName) {
            void this.layoutTick;
            const player = this.$refs[refName];
            const frame = getRenderedVideoFrame(player);
            if (!frame.width || !frame.height) {
                return {
                    left: '50%',
                    top: '50%',
                    width: '100%',
                    height: '100%',
                    transform: 'translate(-50%, -50%)'
                };
            }
            return {
                left: '50%',
                top: '50%',
                width: `${frame.width}px`,
                height: `${frame.height}px`,
                transform: 'translate(-50%, -50%)'
            };
        },
        getHotspotStyle(choice) {
            return {
                left: `${clamp(asNumber(choice?.overlayX, 50), 0, 100)}%`,
                top: `${clamp(asNumber(choice?.overlayY, 50), 0, 100)}%`,
                width: `${clamp(asNumber(choice?.overlayWidth, 22), 4, 90)}%`,
                height: `${clamp(asNumber(choice?.overlayHeight, 18), 4, 90)}%`
            };
        },
        getHotspotImageStyle(choice) {
            return {
                objectFit: choice?.overlayFit === 'contain' ? 'contain' : 'cover',
                objectPosition: `${clamp(asNumber(choice?.overlayFocusX, 50), 0, 100)}% ${clamp(asNumber(choice?.overlayFocusY, 50), 0, 100)}%`
            };
        },
        primeChoicePreview(event) {
            const player = event?.target;
            if (!player) return;
            const seekTime = Math.min(0.35, player.duration || 0);
            if (Number.isFinite(seekTime) && seekTime > 0) {
                player.currentTime = seekTime;
            }
            player.pause?.();
        },
        playChoicePreview(event) {
            const player = this.getChoicePreviewVideo(event);
            if (!player) return;
            const seekTime = Math.min(0.35, player.duration || 0);
            if (Number.isFinite(seekTime) && seekTime > 0 && player.currentTime < 0.01) {
                player.currentTime = seekTime;
            }
            player.play?.().catch(() => {});
        },
        stopChoicePreview(event) {
            const player = this.getChoicePreviewVideo(event);
            if (!player) return;
            const seekTime = Math.min(0.35, player.duration || 0);
            player.pause?.();
            if (Number.isFinite(seekTime) && seekTime > 0) {
                try {
                    player.currentTime = seekTime;
                } catch (error) {
                    // Ignore seek failures during teardown.
                }
            }
        },
        async uploadChoiceOverlayImage(event, choice) {
            const file = event?.target?.files?.[0];
            if (!file || !this.currentProject || !choice) return;
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('projectId', this.currentProject.id);
                const response = await apiUpload('/api/upload', formData);
                if (response?.type === 'image' && response?.path) {
                    choice.overlayMode = 'hotspot';
                    choice.overlayAsset = response.path;
                    if (!this.imageFiles.some((image) => image.path === response.path)) {
                        this.imageFiles = [
                            ...this.imageFiles,
                            { name: response.name || file.name, path: response.path }
                        ].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
                    }
                    this.showToast('Hotspot image uploaded.');
                }
            } catch (error) {
                this.showError(error);
            } finally {
                if (event?.target) {
                    event.target.value = '';
                }
            }
        },
        clearChoiceOverlayAsset(choice) {
            if (!choice) return;
            choice.overlayAsset = '';
            choice.overlayMode = 'card';
        },
        isPreviewLocked(choice) {
            return !satisfiesRequirement(this.previewGameState, choice.reqVar);
        },
        registerPreviewRoute(choice, targetClip) {
            this.previewRoute.push({
                from: this.previewCurrentClip?.name || 'Unknown',
                label: choice.label || 'Choice',
                to: targetClip?.name || 'Unknown'
            });
        },
        previewVarSummary() {
            const keys = Object.keys(this.previewGameState || {});
            return keys.length ? keys.join(', ') : 'None';
        },
        previewRewardSummary() {
            return this.previewUnlockedAchievements.length ? this.previewUnlockedAchievements.join(', ') : 'None';
        },
        previewRouteSteps() {
            return [...this.previewRoute].reverse();
        },
        previewLockSummary() {
            const total = this.previewCurrentChoices.length;
            if (!total) return '0 locked / 0';
            const locked = this.previewCurrentChoices.filter((choice) => this.isPreviewLocked(choice)).length;
            return `${locked} locked / ${total}`;
        },
        recordPreviewClipAsSeen(clipId, duration) {
            if (!clipId || !duration) return;
            const current = this.previewSeenByClip[clipId] || [];
            this.previewSeenByClip = {
                ...this.previewSeenByClip,
                [clipId]: mergeRanges([...current, { start: 0, end: duration }])
            };
            if (this.previewCurrentClipId === clipId) {
                this.seenSegments = this.previewSeenByClip[clipId];
            }
        },
        performPreviewSmartSkip(currentTime, player) {
            if (!this.smartSkipEnabled || this.previewIsManualSeeking) return;
            const ranges = this.previewSeenByClip[this.previewCurrentClipId] || [];
            for (const range of ranges) {
                const buffer = Math.min(0.5, (range.end - range.start) / 2);
                if (currentTime >= range.start && currentTime < range.end - buffer) {
                    const interaction = this.previewBlocks.find((block) => block.time > currentTime && block.time < range.end);
                    const targetTime = interaction ? Math.max(currentTime, interaction.time - 0.5) : range.end;
                    if (Math.abs(player.currentTime - targetTime) > 0.5) {
                        player.currentTime = targetTime;
                    }
                    return;
                }
            }
        },
        normalizeQteInput(input) {
            if (input === undefined || input === null) return '';
            let normalized = String(input).trim().toLowerCase();
            if (!normalized) return 'space';
            if (normalized === 'space' || normalized === 'spacebar' || normalized === ' ') {
                return 'space';
            }
            if (/^key[a-z]$/.test(normalized)) {
                return normalized.slice(3);
            }
            if (/^digit[0-9]$/.test(normalized)) {
                return normalized.slice(5);
            }
            return normalized;
        },
        cleanupPreviewInteractions() {
            if (this.previewChoiceTimer) {
                clearInterval(this.previewChoiceTimer);
                this.previewChoiceTimer = null;
            }
            if (this.previewTitleCardTimer) {
                clearTimeout(this.previewTitleCardTimer);
                this.previewTitleCardTimer = null;
            }
            this.previewTimeRemaining = null;
            window.removeEventListener('keydown', this.previewQteKeyHandler);
            this.previewShowChoices = false;
            this.previewCurrentChoices = [];
            this.previewIsQte = false;
            this.previewQteKey = null;
            this.previewQtePressed = false;
            this.previewTitleCardText = '';
        },
        updatePreviewVolume() {
            const player = this.$refs.previewPlayer;
            const bgm = this.$refs.previewBgm;
            if (player) {
                player.volume = this.previewVolume;
            }
            if (bgm) {
                bgm.volume = this.previewVolume * 0.3;
            }
        },
        async loadPreviewClip(clipId, forceTime = 0) {
            const clip = this.clips.find((item) => item.unique_id === clipId);
            if (!clip) {
                this.showToast('Preview scene missing.', 'error');
                return;
            }

            this.cleanupPreviewInteractions();
            this.previewCurrentClip = clip;
            this.previewCurrentClipId = clipId;
            this.previewBlocks = groupEdgesIntoBlocks(this.edges, clipId, { forPreview: true }).sort((a, b) => a.time - b.time);
            if (forceTime > 0) {
                this.previewBlocks = this.previewBlocks.filter((block) => block.time > forceTime + 0.1);
            }
            this.previewTriggeredBlocks = new Set();
            this.previewIsGameOver = false;
            this.seenSegments = this.previewSeenByClip[clipId] || [];
            this.previewTitleCardText = clip.title_card || '';
            if (this.previewTitleCardText) {
                this.previewTitleCardTimer = setTimeout(() => {
                    this.previewTitleCardText = '';
                    this.previewTitleCardTimer = null;
                }, 2800);
            }

            await nextTick();
            const player = this.$refs.previewPlayer;
            const bgm = this.$refs.previewBgm;
            if (!player) return;

            player.src = clip.filepath;
            player.load();
            player.onloadedmetadata = () => {
                player.currentTime = forceTime;
                player.volume = this.previewVolume;
                player.muted = asBool(clip.mute_audio);
                this.refreshOverlayLayout();
                this.previewDuration = player.duration || clip.duration || 0;
                this.previewProgress = 0;
                this.previewCurrentTime = forceTime;
                player.play().then(() => {
                    this.previewIsPaused = false;
                }).catch(() => {});
                if (clip.bg_music && bgm) {
                    bgm.src = clip.bg_music;
                    bgm.volume = this.previewVolume * 0.3;
                    bgm.play().catch(() => {});
                } else if (bgm) {
                    bgm.pause();
                    bgm.removeAttribute('src');
                }
            };
        },
        async startPreview() {
            if (!this.storySequence.length) {
                this.showToast('Add scenes to the publish sequence first.', 'error');
                return;
            }
            this.previewMode = true;
            this.previewPlaylistIndex = 0;
            this.previewHistoryStack = [];
            this.previewGameState = {};
            this.previewRelationships = {};
            this.previewUnlockedAchievements = [];
            this.previewRoute = [];
            this.previewSeenByClip = {};
            this.previewFailSafeState = null;
            this.previewCurrentChoices = [];
            this.previewShowChoices = false;
            this.previewCurrentClip = null;
            this.previewCurrentClipId = null;
            this.previewBlocks = [];
            this.previewTriggeredBlocks = new Set();
            this.previewDuration = 0;
            this.previewCurrentTime = 0;
            this.previewProgress = 0;
            this.previewIsPaused = false;
            this.previewIsGameOver = false;
            await this.loadPreviewClip(this.storySequence[0].id);
        },
        closePreview() {
            this.previewMode = false;
            this.previewCurrentClip = null;
            this.previewCurrentClipId = null;
            this.cleanupPreviewInteractions();
            const player = this.$refs.previewPlayer;
            const bgm = this.$refs.previewBgm;
            if (player) {
                player.pause();
                player.removeAttribute('src');
                player.load();
            }
            if (bgm) {
                bgm.pause();
                bgm.removeAttribute('src');
            }
            this.previewRoute = [];
            this.previewHistoryStack = [];
            this.previewCurrentChoices = [];
            this.previewBlocks = [];
            this.previewTriggeredBlocks = new Set();
            this.previewIsGameOver = false;
            this.seenSegments = [];
            this.previewTitleCardText = '';
        },
        togglePreviewPlay() {
            if (this.previewIsGameOver) return;
            const player = this.$refs.previewPlayer;
            if (!player) return;
            if (player.paused) {
                player.play().then(() => {
                    this.previewIsPaused = false;
                }).catch(() => {});
                return;
            }
            player.pause();
            this.previewIsPaused = true;
        },
        seekPreview(event) {
            const player = this.$refs.previewPlayer;
            if (!player?.duration) return;
            this.previewIsManualSeeking = true;
            setTimeout(() => {
                this.previewIsManualSeeking = false;
            }, 1200);
            const rect = event.currentTarget.getBoundingClientRect();
            const pct = clamp((event.clientX - rect.left) / rect.width, 0, 1);
            player.currentTime = pct * player.duration;
        },
        onPreviewDurationChange() {
            this.previewDuration = this.$refs.previewPlayer?.duration || 0;
            this.refreshOverlayLayout();
        },
        onPreviewTimeUpdate() {
            const player = this.$refs.previewPlayer;
            if (!player || !this.previewMode) return;

            this.previewCurrentTime = player.currentTime;
            this.previewDuration = player.duration || this.previewDuration;
            this.previewProgress = this.previewDuration ? (player.currentTime / this.previewDuration) * 100 : 0;

            if (!this.previewShowChoices) {
                this.performPreviewSmartSkip(player.currentTime, player);
            }

            if (this.previewShowChoices || this.previewIsGameOver || !this.previewBlocks.length) {
                return;
            }

            const block = this.previewBlocks.find((item) => (
                player.currentTime >= item.time
                && player.currentTime < item.time + 1.5
                && !this.previewTriggeredBlocks.has(item.id)
            ));

            if (!block) return;

            this.previewTriggeredBlocks.add(block.id);
            player.pause();
            this.previewIsPaused = true;
            this.cleanupPreviewInteractions();
            this.previewCurrentChoices = block.choices || [];
            this.previewShowChoices = true;

            if (block.timeoutSeconds && block.timeoutSeconds > 0) {
                this.previewTimeRemaining = block.timeoutSeconds;
                this.previewChoiceTimer = setInterval(() => {
                    this.previewTimeRemaining -= 0.1;
                    if (this.previewTimeRemaining > 0) return;
                    clearInterval(this.previewChoiceTimer);
                    this.previewChoiceTimer = null;
                    const unlocked = block.choices.filter((choice) => !this.isPreviewLocked(choice));
                    const timeoutChoice = block.timeoutToId
                        ? unlocked.find((choice) => choice.to === block.timeoutToId)
                        : null;
                    if (timeoutChoice) {
                        this.makePreviewChoice(timeoutChoice);
                    } else if (unlocked.length) {
                        this.makePreviewChoice(unlocked[Math.floor(Math.random() * unlocked.length)]);
                    }
                }, 100);
            }

            if (block.behaviorType === 'qte' && block.choices.some((choice) => choice.qteDuration > 0)) {
                const qteChoice = block.choices.find((choice) => choice.qteDuration > 0);
                this.previewIsQte = true;
                this.previewQteKey = qteChoice.qteTargetId || 'Space';
                window.removeEventListener('keydown', this.previewQteKeyHandler);
                window.addEventListener('keydown', this.previewQteKeyHandler);
            }
        },
        async onPreviewEnded() {
            if (this.previewShowChoices) return;
            if (this.previewCurrentClip) {
                this.recordPreviewClipAsSeen(this.previewCurrentClip.unique_id, this.previewDuration || this.previewCurrentClip.duration);
            }

            if (this.previewCurrentClip && asBool(this.previewCurrentClip.is_game_over)) {
                this.previewIsGameOver = true;
                const bgm = this.$refs.previewBgm;
                if (bgm) {
                    bgm.pause();
                }
                return;
            }

            if (this.previewHistoryStack.length > 0) {
                const previous = this.previewHistoryStack.pop();
                await this.loadPreviewClip(previous.clipId, previous.time);
                return;
            }

            this.previewPlaylistIndex += 1;
            if (this.previewPlaylistIndex < this.storySequence.length) {
                await this.loadPreviewClip(this.storySequence[this.previewPlaylistIndex].id);
                return;
            }

            this.closePreview();
        },
        handlePreviewQte(event) {
            if (!this.previewIsQte) return;
            if (event?.repeat) return;
            const pressed = [
                this.normalizeQteInput(event?.key),
                this.normalizeQteInput(event?.code)
            ];
            const choice = this.previewCurrentChoices.find((item) => {
                const target = this.normalizeQteInput(item.qteTargetId || 'Space');
                return pressed.includes(target);
            });
            if (!choice) return;
            event?.preventDefault?.();
            this.previewQtePressed = true;
            this.makePreviewChoice(choice);
        },
        makePreviewChoice(choice) {
            if (this.isPreviewLocked(choice)) return;
            const targetId = choiceTargetId(choice);
            if (!targetId) {
                this.cleanupPreviewInteractions();
                return;
            }

            const returnTime = this.previewCurrentTime;
            this.cleanupPreviewInteractions();

            if (choice.setVar) {
                this.previewGameState = applyVarExpression(this.previewGameState, choice.setVar);
            }

            if (choice.characterName) {
                const current = this.previewRelationships[choice.characterName] ?? 50;
                this.previewRelationships = {
                    ...this.previewRelationships,
                    [choice.characterName]: clamp(current + asNumber(choice.relationshipChange, 0), 0, 100)
                };
            }

            if (choice.achievementId && !this.previewUnlockedAchievements.includes(choice.achievementId)) {
                this.previewUnlockedAchievements = [...this.previewUnlockedAchievements, choice.achievementId];
            }

            const targetClip = this.clips.find((clip) => clip.unique_id === targetId);
            if (!targetClip) {
                this.showToast('Target scene missing.', 'error');
                return;
            }

            this.registerPreviewRoute(choice, targetClip);

            if (asBool(targetClip.is_game_over)) {
                this.previewFailSafeState = {
                    clipId: this.previewCurrentClipId,
                    sequenceIndex: this.previewPlaylistIndex
                };
            }

            if (choice.return) {
                this.previewHistoryStack.push({
                    clipId: this.previewCurrentClipId,
                    time: returnTime
                });
            } else if (!asBool(targetClip.is_game_over)) {
                this.previewHistoryStack = [];
            }

            this.loadPreviewClip(targetId, 0);
        },
        previewRestartFromFail() {
            if (!this.previewFailSafeState) {
                this.startPreview();
                return;
            }
            this.previewPlaylistIndex = this.previewFailSafeState.sequenceIndex || 0;
            this.previewIsGameOver = false;
            this.loadPreviewClip(this.previewFailSafeState.clipId, 0);
        }
    }
});

window.__studioApp = app.mount('#app');
