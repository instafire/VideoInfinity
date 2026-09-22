<template>
  <div class="event-editor">
    <!-- Header -->
    <div class="view-header">
      <div>
        <h1>Events</h1>
        <p>Create interactive events with video preview and choices</p>
      </div>
    </div>

    <div class="event-workspace" v-if="clips.length > 0">
      <!-- Left Panel: Video Player & Timeline -->
      <div class="video-panel">
        <!-- Video Source Selector -->
        <div class="source-selector">
          <label>Event Clip:</label>
          <select v-model="selectedClipId" @change="loadSelectedClip">
            <option value="">Select a clip...</option>
            <optgroup label="Event Clips">
              <option v-for="clip in eventClips" :key="clip.id" :value="clip.id">
                {{ clip.name }}
              </option>
            </optgroup>
            <optgroup label="Standard Clips">
              <option v-for="clip in standardClips" :key="clip.id" :value="clip.id">
                {{ clip.name }}
              </option>
            </optgroup>
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
          <div class="video-overlay" v-if="showTestOverlay" @click="handleOverlayClick">
            <div class="test-choices">
              <h3>Make Your Choice</h3>
              <div class="choice-cards">
                <div
                  v-for="(choice, i) in testChoices"
                  :key="i"
                  class="choice-card"
                  :style="{ borderColor: choice.text_color || '#fff' }"
                  @click.stop="selectTestChoice(choice)"
                >
                  <span class="choice-label" :style="{ color: choice.text_color || '#fff' }">
                    {{ choice.label || 'Choice ' + (i + 1) }}
                  </span>
                  <span class="target-name">{{ getClipName(choice.to_id) }}</span>
                </div>
              </div>
              <button class="btn btn-secondary" @click.stop="exitTestMode">Exit Test</button>
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
          <button class="btn btn-secondary btn-sm" @click="testEvent" :disabled="!selectedClip">
            Test Event
          </button>
        </div>

        <!-- Timeline -->
        <div class="timeline-container" v-if="selectedClip" ref="timelineRef" @click="seekTimeline">
          <div class="timeline-playhead" :style="{ left: playheadPercent + '%' }"></div>
          <div class="timeline-fill" :style="{ width: playheadPercent + '%' }"></div>
          <!-- IN Marker -->
          <div class="marker-start" :style="{ left: (selectedClip.start_time / duration * 100) + '%' }">
            <span class="time-label label-start">{{ formatTime(selectedClip.start_time) }}</span>
          </div>
          <!-- OUT Marker -->
          <div class="marker-end" :style="{ left: (selectedClip.end_time / duration * 100) + '%' }">
            <span class="time-label label-end">{{ formatTime(selectedClip.end_time) }}</span>
          </div>
          <!-- Trigger Marker -->
          <div class="marker-trigger" :style="{ left: (triggerTime / duration * 100) + '%' }" title="Choice trigger point"></div>
        </div>

        <!-- Timeline Controls -->
        <div class="timeline-controls" v-if="selectedClip">
          <button class="btn btn-sm btn-secondary" @click="setInPoint">IN</button>
          <button class="btn btn-sm btn-secondary" @click="setOutPoint">OUT</button>
          <button class="btn btn-sm btn-secondary" @click="setTriggerPoint">Set Trigger</button>
          <input type="number" v-model.number="triggerTime" min="0" :max="duration" step="0.1" class="trigger-input" />
          <span class="text-sm text-muted">sec</span>
        </div>

        <!-- Audio Controls -->
        <div class="audio-controls" v-if="selectedClip">
          <label>Background Music:</label>
          <select v-model="selectedClip.bg_music" @change="updateClipAudio">
            <option value="">None</option>
            <option v-for="audio in audioFiles" :key="audio" :value="audio">{{ audio }}</option>
          </select>
          <label class="checkbox-label">
            <input type="checkbox" v-model="selectedClip.mute_audio" @change="updateClipAudio" />
            Mute Video Audio
          </label>
        </div>
      </div>

      <!-- Right Panel: Choices Editor -->
      <div class="choices-panel">
        <h3>Choice Options</h3>
        <p class="text-muted text-sm mb-4">Configure choices that appear at the trigger point</p>

        <div class="choices-list">
          <div v-for="(choice, index) in choices" :key="index" class="choice-item">
            <div class="choice-header">
              <span class="choice-number">Choice {{ index + 1 }}</span>
              <button class="btn-icon" @click="removeChoice(index)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div class="choice-body">
              <input
                type="text"
                v-model="choice.label"
                placeholder="Button text"
                class="choice-text-input"
              />
              <div class="choice-color-row">
                <input type="color" v-model="choice.text_color" class="color-picker" />
                <span class="text-xs text-muted">Color</span>
              </div>
              <select v-model="choice.to_id" class="choice-target-select">
                <option value="">Go to...</option>
                <optgroup label="Event Clips">
                  <option v-for="clip in eventClips" :key="clip.id" :value="clip.id">
                    {{ clip.name }}
                  </option>
                </optgroup>
                <optgroup label="Standard Clips">
                  <option v-for="clip in standardClips" :key="clip.id" :value="clip.id">
                    {{ clip.name }}
                  </option>
                </optgroup>
              </select>
              <label class="checkbox-label">
                <input type="checkbox" v-model="choice.return_to_main" />
                Return to Main
              </label>
              <input
                type="text"
                v-model="choice.set_var"
                placeholder="Set variable (e.g., hasKey=true)"
                class="var-input"
              />
            </div>
          </div>
        </div>

        <button class="btn btn-secondary" @click="addChoice" v-if="choices.length < 4">
          + Add Choice
        </button>

        <!-- Variables Section -->
        <div class="variables-section mt-4">
          <h4>Event Variables</h4>
          <input
            type="text"
            v-model="eventReqVar"
            placeholder="Required variable (reqVar)"
            class="var-input"
          />
          <input
            type="text"
            v-model="eventSetVar"
            placeholder="Set variable on entry"
            class="var-input"
          />
        </div>

        <!-- Timeout Section -->
        <div class="timeout-section mt-4">
          <h4>Timeout Options</h4>
          <label class="checkbox-label">
            <input type="checkbox" v-model="timeoutEnabled" />
            Enable timeout
          </label>
          <div v-if="timeoutEnabled" class="timeout-settings">
            <input type="number" v-model.number="timeoutSeconds" min="1" step="0.5" />
            <span>seconds</span>
            <select v-model="timeoutToId" class="timeout-target">
              <option value="">Go to...</option>
              <option v-for="clip in allClips" :key="clip.id" :value="clip.id">
                {{ clip.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="panel-actions mt-4">
          <button class="btn btn-danger" @click="deleteEvent" v-if="selectedClip && selectedClip.is_event_clip">
            Delete Event
          </button>
          <button class="btn btn-primary" @click="saveEvent" :disabled="!selectedClip">
            Save Changes
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div class="empty-state" v-else>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4l2 2"/>
      </svg>
      <h3>No clips available</h3>
      <p>Create clips in the Scenes view first to add interactive events</p>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, inject } from 'vue'

export default {
  name: 'EventEditorView',
  setup() {
    const showToast = inject('showToast')
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
    const triggerTime = ref(0)

    const choices = ref([])
    const eventReqVar = ref('')
    const eventSetVar = ref('')
    const timeoutEnabled = ref(false)
    const timeoutSeconds = ref(5)
    const timeoutToId = ref('')

    const showTestOverlay = ref(false)
    const testChoices = ref([])
    const testHistory = ref([])

    const eventClips = computed(() => clips.value.filter(c => c.is_event_clip))
    const standardClips = computed(() => clips.value.filter(c => !c.is_event_clip))
    const allClips = computed(() => clips.value)

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
        const audioData = await audioRes.json()

        clips.value = storyData.clips || []
        edges.value = storyData.edges || []
        audioFiles.value = audioData.audio || []

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
        triggerTime.value = clip.trigger_time || clip.duration - 0.5
        loadChoicesForClip(clip.id)
      }
    }

    const loadChoicesForClip = (clipId) => {
      const clipEdges = edges.value.filter(e => e.from_id === clipId)
      choices.value = clipEdges.map(e => ({
        label: e.label || '',
        to_id: e.to_id || '',
        text_color: e.text_color || '#ffffff',
        return_to_main: e.return_to_main || false,
        set_var: e.set_var || ''
      }))

      if (choices.value.length === 0) {
        choices.value = [
          { label: '', to_id: '', text_color: '#ffffff', return_to_main: false, set_var: '' },
          { label: '', to_id: '', text_color: '#ffffff', return_to_main: false, set_var: '' }
        ]
      }

      eventReqVar.value = clipEdges[0]?.req_var || ''
      eventSetVar.value = clipEdges[0]?.set_var || ''
      timeoutEnabled.value = !!clip.timeout_seconds
      timeoutSeconds.value = clip.timeout_seconds || 5
      timeoutToId.value = clip.timeout_to_id || ''
    }

    const onVideoLoaded = () => {
      if (videoPlayer.value) {
        duration.value = videoPlayer.value.duration
        if (selectedClip.value) {
          selectedClip.value.start_time = selectedClip.value.start_time || 0
          selectedClip.value.end_time = selectedClip.value.end_time || duration.value
        }
      }
    }

    const onTimeUpdate = () => {
      if (videoPlayer.value) {
        currentTime.value = videoPlayer.value.currentTime
      }
    }

    const onVideoEnded = () => {
      isPlaying.value = false
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

    const setInPoint = () => {
      if (selectedClip.value) {
        selectedClip.value.start_time = currentTime.value
      }
    }

    const setOutPoint = () => {
      if (selectedClip.value) {
        selectedClip.value.end_time = currentTime.value
      }
    }

    const setTriggerPoint = () => {
      triggerTime.value = currentTime.value
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

    const addChoice = () => {
      if (choices.value.length < 4) {
        choices.value.push({
          label: '',
          to_id: '',
          text_color: '#ffffff',
          return_to_main: false,
          set_var: ''
        })
      }
    }

    const removeChoice = (index) => {
      choices.value.splice(index, 1)
    }

    const getClipName = (clipId) => {
      const clip = clips.value.find(c => c.id === clipId)
      return clip?.name || 'Unknown'
    }

    const testEvent = () => {
      if (!selectedClip.value) return
      testChoices.value = choices.value.filter(c => c.to_id)
      if (testChoices.value.length > 0) {
        showTestOverlay.value = true
        testHistory.value = []
        videoPlayer.value.currentTime = selectedClip.value.start_time || 0
        videoPlayer.value.play()
        isPlaying.value = true
      } else {
        showToast('Add choices with targets first', 'warning')
      }
    }

    const handleOverlayClick = () => {
      // Let video play to trigger point
    }

    const selectTestChoice = async (choice) => {
      testHistory.value.push({
        clipId: selectedClip.value.id,
        returnTime: triggerTime.value
      })

      const targetClip = clips.value.find(c => c.id === choice.to_id)
      if (targetClip) {
        selectedClip.value = { ...targetClip, start_time: 0, end_time: targetClip.duration }
        selectedClipId.value = targetClip.id
        loadChoicesForClip(targetClip.id)

        videoPlayer.value.src = targetClip.filepath
        videoPlayer.value.load()
        videoPlayer.value.play()
        isPlaying.value = true

        showTestOverlay.value = false
      }
    }

    const exitTestMode = () => {
      showTestOverlay.value = false
      if (videoPlayer.value) {
        videoPlayer.value.pause()
        isPlaying.value = false
      }
    }

    const saveEvent = async () => {
      if (!selectedClip.value) return

      try {
        // Update clip settings
        await fetch('/api/clip/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedClip.value.id,
            name: selectedClip.value.name,
            chapter_name: selectedClip.value.chapter_name,
            start_time: selectedClip.value.start_time,
            end_time: selectedClip.value.end_time,
            bg_music: selectedClip.value.bg_music,
            mute_audio: selectedClip.value.mute_audio ? 1 : 0,
            trigger_time: triggerTime.value,
            timeout_seconds: timeoutEnabled.value ? timeoutSeconds.value : null,
            timeout_to_id: timeoutEnabled.value ? timeoutToId.value : null
          })
        })

        // Delete existing edges
        for (const edge of edges.value.filter(e => e.from_id === selectedClip.value.id)) {
          await fetch('/api/delete_logic_block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: edge.id })
          })
        }

        // Create new edges
        for (const choice of choices.value) {
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
                req_var: eventReqVar.value,
                trigger_time: triggerTime.value
              })
            })
          }
        }

        showToast('Event saved successfully', 'success')
        loadData()
      } catch (e) {
        showToast('Failed to save event', 'error')
      }
    }

    const deleteEvent = async () => {
      if (!selectedClip.value || !confirm('Delete this event?')) return

      try {
        await fetch('/api/delete_clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedClip.value.id })
        })
        showToast('Event deleted', 'success')
        selectedClipId.value = ''
        selectedClip.value = null
        loadData()
      } catch (e) {
        showToast('Failed to delete', 'error')
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
      triggerTime,
      choices,
      eventReqVar,
      eventSetVar,
      timeoutEnabled,
      timeoutSeconds,
      timeoutToId,
      showTestOverlay,
      testChoices,
      eventClips,
      standardClips,
      allClips,
      playheadPercent,
      loadSelectedClip,
      onVideoLoaded,
      onTimeUpdate,
      onVideoEnded,
      togglePlay,
      seekTimeline,
      setInPoint,
      setOutPoint,
      setTriggerPoint,
      updateClipAudio,
      addChoice,
      removeChoice,
      getClipName,
      testEvent,
      handleOverlayClick,
      selectTestChoice,
      exitTestMode,
      saveEvent,
      deleteEvent,
      formatTime
    }
  }
}
</script>

<style scoped>
.event-editor {
  height: calc(100vh - var(--topbar-height) - 48px);
  display: flex;
  flex-direction: column;
}

.view-header {
  margin-bottom: 20px;
}

.view-header h1 {
  margin-bottom: 4px;
}

.view-header p {
  color: var(--text-muted);
}

.event-workspace {
  flex: 1;
  display: flex;
  gap: 20px;
  overflow: hidden;
}

.video-panel {
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

.test-choices {
  text-align: center;
}

.test-choices h3 {
  margin-bottom: 20px;
  color: white;
}

.choice-cards {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 20px;
}

.choice-card {
  background: rgba(30, 30, 50, 0.9);
  border: 2px solid;
  border-radius: 12px;
  padding: 20px 30px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 150px;
}

.choice-card:hover {
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
}

.choice-label {
  display: block;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.target-name {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
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

.timeline-container {
  height: 40px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 8px;
  position: relative;
  cursor: pointer;
  border: 1px solid var(--border-color);
}

.timeline-playhead {
  height: 100%;
  width: 2px;
  background: #ef4444;
  position: absolute;
  z-index: 10;
  box-shadow: 0 0 8px #ef4444;
}

.timeline-fill {
  height: 100%;
  background: rgba(59, 130, 246, 0.3);
  position: absolute;
}

.marker-start {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #60a5fa;
  z-index: 5;
}

.marker-end {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #c084fc;
  z-index: 5;
}

.marker-trigger {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #fbbf24;
  z-index: 6;
  cursor: pointer;
  box-shadow: 0 0 6px #fbbf24;
}

.time-label {
  position: absolute;
  top: -20px;
  font-size: 10px;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 4px;
  transform: translateX(-50%);
  white-space: nowrap;
}

.label-start { background: #60a5fa; color: #000; }
.label-end { background: #c084fc; color: #000; }

.timeline-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trigger-input {
  width: 60px;
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

.choices-panel {
  width: 360px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  overflow-y: auto;
}

.choices-panel h3 {
  margin-bottom: 4px;
}

.choices-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.choice-item {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.choice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-hover);
}

.choice-number {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.choice-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.choice-text-input {
  width: 100%;
}

.choice-color-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-picker {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.choice-target-select {
  width: 100%;
}

.var-input {
  width: 100%;
}

.variables-section h4,
.timeout-section h4 {
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.timeout-settings {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeout-settings input[type="number"] {
  width: 60px;
}

.timeout-target {
  flex: 1;
}

.panel-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
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

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}
</style>
