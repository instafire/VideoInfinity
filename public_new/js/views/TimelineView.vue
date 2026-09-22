<template>
  <div class="timeline-editor">
    <!-- Header -->
    <div class="view-header">
      <div>
        <h1>Timeline</h1>
        <p>Add interactive choices at any point in your videos</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" :class="{ active: isTestMode }" @click="toggleTestMode">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          {{ isTestMode ? 'Exit Test' : 'LIVE SIM' }}
        </button>
        <button class="btn btn-secondary" @click="switchToGraph">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9"/>
          </svg>
          Graph View
        </button>
      </div>
    </div>

    <div class="editor-layout" v-if="clips.length > 0">
      <!-- Left: Video Player -->
      <div class="video-section">
        <!-- Video Source Selector -->
        <div class="source-selector">
          <label>Video:</label>
          <select v-model="selectedClipId" @change="loadSelectedClip">
            <option value="">Select a clip...</option>
            <option v-for="clip in clips" :key="clip.id" :value="clip.id">
              {{ clip.name }}
            </option>
          </select>
        </div>

        <!-- Video Player -->
        <div class="video-container" v-if="selectedClip">
          <video
            ref="videoPlayer"
            :src="selectedClip.filepath"
            @loadedmetadata="onVideoLoaded"
            @timeupdate="onTimeUpdate"
            @ended="onVideoEnded"
          ></video>
          <!-- Test Overlay -->
          <div class="video-overlay" v-if="showChoiceOverlay" @click="handleOverlayClick">
            <div class="choice-overlay-content">
              <h3>Make Your Choice</h3>
              <div class="choice-buttons">
                <button
                  v-for="(choice, i) in activeChoices"
                  :key="i"
                  class="choice-btn"
                  :style="{ borderColor: choice.text_color, background: choice.text_color + '20' }"
                  @click.stop="makeChoice(choice)"
                >
                  <span :style="{ color: choice.text_color }">{{ choice.label }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Video Controls -->
        <div class="video-controls" v-if="selectedClip">
          <button class="btn-icon" @click="togglePlay">
            <svg v-if="!isPlaying" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
          </button>
          <span class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
        </div>

        <!-- Timeline with Zoom -->
        <div class="timeline-wrapper" v-if="selectedClip">
          <div class="timeline-header">
            <span>Timeline (Zoom: {{ zoomLevel }}%)</span>
            <span>{{ formatTime(currentTime) }}</span>
          </div>
          <input type="range" min="100" max="500" v-model="zoomLevel" class="zoom-slider" />
          <div class="timeline-canvas" ref="timelineRef" @click="seekTimeline">
            <div class="timeline-track">
              <div class="timeline-playhead" :style="{ left: playheadPercent + '%' }"></div>
              <!-- Trigger Markers -->
              <div
                v-for="block in logicBlocks"
                :key="block.id"
                class="trigger-marker"
                :style="{ left: (block.trigger_time / duration * 100) + '%' }"
                :title="block.choices.length + ' choices at ' + formatTime(block.trigger_time)"
                @click.stop="editBlock(block)"
              ></div>
            </div>
          </div>
          <div class="timeline-actions">
            <button class="btn btn-secondary btn-sm" @click="addChoiceAtCurrentTime">
              + Add Choice at {{ formatTime(currentTime) }}
            </button>
          </div>
        </div>

        <!-- Audio Controls -->
        <div class="audio-controls" v-if="selectedClip">
          <label>Background Music:</label>
          <select v-model="selectedClip.bg_music" @change="updateClipAudio">
            <option value="">None</option>
            <option v-for="audio in audioFiles" :key="audio" :value="audio.filename">{{ audio.filename }}</option>
          </select>
          <label class="checkbox-label">
            <input type="checkbox" v-model="selectedClip.mute_audio" @change="updateClipAudio" />
            Mute
          </label>
        </div>
      </div>

      <!-- Right: Choice Blocks Panel -->
      <div class="blocks-panel">
        <h3>Choice Points</h3>
        <p class="text-muted text-sm mb-4">Click markers on timeline to edit choices</p>

        <div class="blocks-list">
          <div
            v-for="block in logicBlocks"
            :key="block.id"
            class="block-card"
            @click="editBlock(block)"
          >
            <div class="block-time">{{ formatTime(block.trigger_time) }}</div>
            <div class="block-info">
              <span class="block-choices">{{ block.choices.length }} choices</span>
            </div>
            <button class="btn-icon" @click.stop="deleteBlock(block)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <div v-if="logicBlocks.length === 0" class="empty-blocks">
          <p>No choice points yet</p>
          <p class="text-sm text-muted">Click "+ Add Choice" to create one</p>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div class="empty-state" v-else>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
      </svg>
      <h3>No clips available</h3>
      <p>Create clips in the Scenes view first</p>
    </div>

    <!-- Edit Block Modal -->
    <div class="modal-overlay" v-if="editingBlock" @click.self="editingBlock = null">
      <div class="modal" style="max-width: 600px;">
        <div class="modal-header">
          <h3>Choices at {{ formatTime(editingBlock.trigger_time) }}</h3>
          <button class="btn-icon" @click="editingBlock = null">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="choices-editor">
            <div v-for="(choice, index) in editingBlock.choices" :key="index" class="choice-row">
              <input type="color" v-model="choice.text_color" class="color-picker" />
              <input
                type="text"
                v-model="choice.label"
                placeholder="Button text"
                class="choice-input"
              />
              <select v-model="choice.to_id" class="choice-target">
                <option value="">Go to...</option>
                <option v-for="clip in clips" :key="clip.id" :value="clip.id">{{ clip.name }}</option>
              </select>
              <label class="checkbox-label">
                <input type="checkbox" v-model="choice.return_to_main" />
                Return
              </label>
              <input
                type="text"
                v-model="choice.set_var"
                placeholder="Set var"
                class="var-input"
              />
              <button class="btn-icon" @click="removeChoiceFromBlock(index)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <button class="btn btn-secondary" @click="addChoiceToBlock" v-if="editingBlock.choices.length < 4">
              + Add Choice
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="editingBlock = null">Cancel</button>
          <button class="btn btn-primary" @click="saveBlock">Save Choices</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { useRouter } from 'vue-router'

export default {
  name: 'TimelineView',
  setup() {
    const showToast = inject('showToast')
    const router = useRouter()
    const videoPlayer = ref(null)
    const timelineRef = ref(null)

    const clips = ref([])
    const edges = ref([])
    const audioFiles = ref([])

    const selectedClipId = ref('')
    const selectedClip = ref(null)
    const isPlaying = ref(false)
    const currentTime = ref(0)
    const duration = ref(0)
    const zoomLevel = ref(100)

    const isTestMode = ref(false)
    const showChoiceOverlay = ref(false)
    const activeChoices = ref([])
    const choiceHistory = ref([])

    const editingBlock = ref(null)
    const logicBlocks = computed(() => {
      if (!selectedClip.value) return []
      const clipId = selectedClip.value.id
      const blockMap = new Map()

      edges.value
        .filter(e => e.from_id === clipId && e.trigger_time)
        .forEach(edge => {
          const time = edge.trigger_time
          if (!blockMap.has(time)) {
            blockMap.set(time, {
              trigger_time: time,
              choices: []
            })
          }
          blockMap.get(time).choices.push({
            id: edge.id,
            label: edge.label,
            to_id: edge.to_id,
            text_color: edge.text_color || '#ffffff',
            return_to_main: edge.return_to_main,
            set_var: edge.set_var
          })
        })

      return Array.from(blockMap.values()).sort((a, b) => a.trigger_time - b.trigger_time)
    })

    const playheadPercent = computed(() => {
      if (!duration.value) return 0
      return (currentTime.value / duration.value) * 100
    })

    const loadData = async () => {
      try {
        const [storyRes, audioRes] = await Promise.all([
          fetch('/api/story'),
          fetch('/api/audio')
        ])
        const storyData = await storyRes.json()
        clips.value = storyData.clips || []
        edges.value = storyData.edges || []
        audioFiles.value = await audioRes.json()

        if (clips.value.length > 0 && !selectedClipId.value) {
          selectedClipId.value = clips.value[0].id
          loadSelectedClip()
        }
      } catch (e) {
        console.error('Failed to load data:', e)
      }
    }

    const loadSelectedClip = () => {
      const clip = clips.value.find(c => c.id === selectedClipId.value)
      if (clip) {
        selectedClip.value = { ...clip }
        currentTime.value = 0
      }
    }

    const onVideoLoaded = () => {
      if (videoPlayer.value) {
        duration.value = videoPlayer.value.duration
      }
    }

    const onTimeUpdate = () => {
      if (videoPlayer.value) {
        currentTime.value = videoPlayer.value.currentTime

        // Check for choice triggers in test mode
        if (isTestMode.value) {
          checkChoiceTriggers()
        }
      }
    }

    const onVideoEnded = () => {
      isPlaying.value = false
      if (isTestMode.value && choiceHistory.value.length > 0) {
        // Return to previous clip
        const prev = choiceHistory.value.pop()
        if (prev) {
          loadClipById(prev.clipId)
          if (videoPlayer.value) {
            videoPlayer.value.currentTime = prev.returnTime || 0
          }
        }
      }
    }

    const checkChoiceTriggers = () => {
      const triggers = logicBlocks.value.map(b => b.trigger_time)
      for (const trigger of triggers) {
        if (Math.abs(currentTime.value - trigger) < 0.1) {
          const block = logicBlocks.value.find(b => Math.abs(b.trigger_time - trigger) < 0.1)
          if (block && block.choices.length > 0) {
            showChoices(block.choices)
            break
          }
        }
      }
    }

    const showChoices = (choices) => {
      if (choices.length > 0) {
        videoPlayer.value?.pause()
        isPlaying.value = false
        activeChoices.value = choices
        showChoiceOverlay.value = true
      }
    }

    const makeChoice = async (choice) => {
      choiceHistory.value.push({
        clipId: selectedClip.value.id,
        returnTime: editingBlock.value?.trigger_time || 0
      })

      const targetClip = clips.value.find(c => c.id === choice.to_id)
      if (targetClip) {
        selectedClip.value = { ...targetClip }
        selectedClipId.value = targetClip.id
        currentTime.value = 0

        if (videoPlayer.value) {
          videoPlayer.value.src = targetClip.filepath
          videoPlayer.value.load()
          videoPlayer.value.play()
          isPlaying.value = true
        }
      }

      showChoiceOverlay.value = false
      activeChoices.value = []
    }

    const handleOverlayClick = () => {
      // Let video continue
    }

    const togglePlay = () => {
      if (!videoPlayer.value) return
      if (isPlaying.value) {
        videoPlayer.value.pause()
      } else {
        videoPlayer.value.play()
      }
      isPlaying.value = !isPlaying.value
    }

    const seekTimeline = (e) => {
      if (!videoPlayer.value || !duration.value) return
      const rect = timelineRef.value.getBoundingClientRect()
      const percent = (e.clientX - rect.left) / rect.width
      videoPlayer.value.currentTime = percent * duration.value
    }

    const toggleTestMode = () => {
      isTestMode.value = !isTestMode.value
      showChoiceOverlay.value = false
      activeChoices.value = []
      choiceHistory.value = []

      if (isTestMode.value && videoPlayer.value) {
        videoPlayer.value.currentTime = 0
        videoPlayer.value.play()
        isPlaying.value = true
      }
    }

    const switchToGraph = () => {
      router.push('/branches')
    }

    const addChoiceAtCurrentTime = () => {
      const triggerTime = currentTime.value
      editingBlock.value = {
        trigger_time: triggerTime,
        choices: [
          { label: '', to_id: '', text_color: '#ffffff', return_to_main: false, set_var: '' },
          { label: '', to_id: '', text_color: '#ffffff', return_to_main: false, set_var: '' }
        ]
      }
    }

    const editBlock = (block) => {
      editingBlock.value = {
        trigger_time: block.trigger_time,
        choices: [...block.choices.map(c => ({ ...c }))]
      }
    }

    const deleteBlock = async (block) => {
      if (!confirm('Delete all choices at ' + formatTime(block.trigger_time) + '?')) return

      try {
        // Delete all edges at this trigger time
        const edgesToDelete = edges.value.filter(
          e => e.from_id === selectedClip.value.id && Math.abs(e.trigger_time - block.trigger_time) < 0.1
        )

        for (const edge of edgesToDelete) {
          await fetch('/api/delete_logic_block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: edge.id })
          })
        }

        showToast('Choice point deleted', 'success')
        loadData()
      } catch (e) {
        showToast('Failed to delete', 'error')
      }
    }

    const addChoiceToBlock = () => {
      if (editingBlock.value.choices.length < 4) {
        editingBlock.value.choices.push({
          label: '',
          to_id: '',
          text_color: '#ffffff',
          return_to_main: false,
          set_var: ''
        })
      }
    }

    const removeChoiceFromBlock = (index) => {
      editingBlock.value.choices.splice(index, 1)
    }

    const saveBlock = async () => {
      if (!selectedClip.value || !editingBlock.value) return

      try {
        // Delete existing edges at this trigger time
        const existingEdges = edges.value.filter(
          e => e.from_id === selectedClip.value.id &&
               Math.abs(e.trigger_time - editingBlock.value.trigger_time) < 0.1
        )

        for (const edge of existingEdges) {
          await fetch('/api/delete_logic_block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: edge.id })
          })
        }

        // Create new edges
        for (const choice of editingBlock.value.choices) {
          if (choice.to_id) {
            await fetch('/api/save_logic_block', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                project_id: 1,
                from_id: selectedClip.value.id,
                to_id: choice.to_id,
                label: choice.label,
                text_color: choice.text_color,
                return_to_main: choice.return_to_main ? 1 : 0,
                set_var: choice.set_var,
                trigger_time: editingBlock.value.trigger_time
              })
            })
          }
        }

        showToast('Choices saved', 'success')
        editingBlock.value = null
        loadData()
      } catch (e) {
        showToast('Failed to save', 'error')
      }
    }

    const loadClipById = (clipId) => {
      const clip = clips.value.find(c => c.id === clipId)
      if (clip) {
        selectedClip.value = { ...clip }
        selectedClipId.value = clip.id
      }
    }

    const updateClipAudio = async () => {
      if (!selectedClip.value) return
      try {
        await fetch('/api/clip/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedClip.value.id,
            bg_music: selectedClip.value.bg_music,
            mute_audio: selectedClip.value.mute_audio ? 1 : 0
          })
        })
      } catch (e) {
        console.error('Failed to update audio:', e)
      }
    }

    const formatTime = (seconds) => {
      if (!seconds || isNaN(seconds)) return '0:00'
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    onMounted(loadData)

    return {
      videoPlayer,
      timelineRef,
      clips,
      edges,
      audioFiles,
      selectedClipId,
      selectedClip,
      isPlaying,
      currentTime,
      duration,
      zoomLevel,
      isTestMode,
      showChoiceOverlay,
      activeChoices,
      editingBlock,
      logicBlocks,
      playheadPercent,
      loadSelectedClip,
      onVideoLoaded,
      onTimeUpdate,
      onVideoEnded,
      togglePlay,
      seekTimeline,
      toggleTestMode,
      switchToGraph,
      addChoiceAtCurrentTime,
      editBlock,
      deleteBlock,
      addChoiceToBlock,
      removeChoiceFromBlock,
      saveBlock,
      makeChoice,
      handleOverlayClick,
      updateClipAudio,
      formatTime
    }
  }
}
</script>

<style scoped>
.timeline-editor {
  height: calc(100vh - var(--topbar-height) - 48px);
  display: flex;
  flex-direction: column;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.view-header h1 {
  margin-bottom: 4px;
}

.view-header p {
  color: var(--text-muted);
}

.header-actions {
  display: flex;
  gap: 12px;
}

.header-actions .btn.active {
  background: var(--accent-blue);
  color: white;
}

.editor-layout {
  flex: 1;
  display: flex;
  gap: 20px;
  overflow: hidden;
}

.video-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  overflow-y: auto;
}

.source-selector {
  display: flex;
  align-items: center;
  gap: 12px;
}

.source-selector select {
  flex: 1;
}

.video-container {
  position: relative;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 16/9;
}

.video-container video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.video-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.choice-overlay-content {
  text-align: center;
}

.choice-overlay-content h3 {
  color: white;
  margin-bottom: 20px;
}

.choice-buttons {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.choice-btn {
  padding: 16px 32px;
  border: 2px solid;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.choice-btn:hover {
  transform: scale(1.05);
}

.video-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.time-display {
  font-size: 14px;
  font-family: monospace;
}

.timeline-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
}

.zoom-slider {
  width: 100%;
}

.timeline-canvas {
  height: 48px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 8px;
  position: relative;
  cursor: pointer;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.timeline-track {
  position: relative;
  height: 100%;
}

.timeline-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ef4444;
  z-index: 10;
  box-shadow: 0 0 8px #ef4444;
}

.trigger-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #fbbf24;
  z-index: 5;
  cursor: pointer;
  box-shadow: 0 0 6px #fbbf24;
}

.trigger-marker:hover {
  background: #fff;
}

.timeline-actions {
  display: flex;
  justify-content: center;
}

.audio-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}

.blocks-panel {
  width: 320px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  overflow-y: auto;
}

.blocks-panel h3 {
  margin-bottom: 4px;
}

.blocks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.block-card:hover {
  border-color: var(--accent-blue);
}

.block-time {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-blue);
  font-family: monospace;
}

.block-info {
  flex: 1;
}

.block-choices {
  font-size: 12px;
  color: var(--text-muted);
}

.empty-blocks {
  text-align: center;
  padding: 20px;
  color: var(--text-muted);
}

.choices-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.choice-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.color-picker {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.choice-input {
  flex: 1;
  min-width: 100px;
}

.choice-target {
  flex: 1;
  min-width: 100px;
}

.var-input {
  width: 80px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.empty-state svg {
  margin-bottom: 16px;
}

.empty-state h3 {
  margin-bottom: 8px;
}
</style>
