<template>
  <div class="preview-view">
    <!-- Header -->
    <div class="view-header">
      <div>
        <h1>Preview</h1>
        <p>Test your interactive movie</p>
      </div>
      <div class="header-actions">
        <select v-model="startScene" class="start-select">
          <option value="">Start from beginning</option>
          <option v-for="clip in clips" :key="clip.id" :value="clip.id">
            {{ clip.name }}
          </option>
        </select>
        <button class="btn btn-primary" @click="startPreview">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Play
        </button>
      </div>
    </div>

    <!-- Player Container -->
    <div class="player-container" v-if="currentClip">
      <div class="video-wrapper">
        <video
          ref="videoPlayer"
          :src="getClipSrc(currentClip)"
          @timeupdate="onTimeUpdate"
          @ended="onVideoEnded"
          @loadedmetadata="onVideoLoaded"
          autoplay
        ></video>

        <!-- Choice Overlay -->
        <div class="choice-overlay" v-if="showChoices">
          <div class="choices-container">
            <button
              v-for="(choice, index) in currentChoices"
              :key="index"
              class="choice-btn"
              @click="makeChoice(choice)"
            >
              {{ choice.label }}
            </button>
          </div>
        </div>

        <!-- Game Over Screen -->
        <div class="game-over-overlay" v-if="isGameOver">
          <h2>The End</h2>
          <p>Thanks for watching!</p>
          <button class="btn btn-primary" @click="restartPreview">Play Again</button>
        </div>
      </div>

      <!-- Player Controls -->
      <div class="player-controls">
        <button class="control-btn" @click="togglePlay">
          <svg v-if="isPlaying" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
            <rect x="6" y="4" width="4" height="16"/>
            <rect x="14" y="4" width="4" height="16"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>

        <div class="progress-bar" @click="seekTo">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>

        <span class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>

        <div class="volume-control">
          <button class="control-btn" @click="toggleMute">
            <svg v-if="isMuted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          </button>
          <input type="range" v-model="volume" min="0" max="100" @input="updateVolume" />
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div class="empty-state" v-else>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      <h3>Ready to Preview</h3>
      <p>Add some scenes to your project and click Play to test your interactive movie</p>
      <button class="btn btn-primary btn-lg" @click="startPreview">
        Start Preview
      </button>
    </div>

    <!-- Variables Panel -->
    <div class="variables-panel" v-if="variables && Object.keys(variables).length > 0">
      <h3>Variables</h3>
      <div class="variables-list">
        <div v-for="(value, key) in variables" :key="key" class="variable-item">
          <span class="var-name">{{ key }}</span>
          <span class="var-value">{{ value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, inject } from 'vue'

export default {
  name: 'PreviewView',
  setup() {
    const showToast = inject('showToast')

    const clips = ref([])
    const edges = ref([])
    const videoPlayer = ref(null)
    const startScene = ref('')
    const currentClip = ref(null)
    const currentTime = ref(0)
    const duration = ref(0)
    const isPlaying = ref(false)
    const isMuted = ref(false)
    const volume = ref(80)
    const showChoices = ref(false)
    const isGameOver = ref(false)
    const currentChoices = ref([])
    const variables = ref({})
    const watchedClips = ref([])

    const progressPercent = computed(() => {
      if (!duration.value) return 0
      return (currentTime.value / duration.value) * 100
    })

    const getClipSrc = (clip) => {
      return clip.filepath || `/clips/${clip.unique_id}.mp4`
    }

    const loadData = async () => {
      try {
        const response = await fetch('/api/story')
        const data = await response.json()
        clips.value = data.clips || []
        edges.value = data.edges || []
      } catch (e) {
        console.error('Failed to load data:', e)
      }
    }

    const startPreview = async () => {
      isGameOver.value = false
      showChoices.value = false
      watchedClips.value = []
      variables.value = {}

      if (startScene.value) {
        currentClip.value = clips.value.find(c => c.id === startScene.value)
      } else {
        currentClip.value = clips.value[0]
      }

      if (currentClip.value) {
        watchedClips.value.push(currentClip.value.id)
        setTimeout(() => {
          if (videoPlayer.value) {
            videoPlayer.value.play()
            isPlaying.value = true
          }
        }, 100)
      } else {
        showToast('No scenes to play', 'warning')
      }
    }

    const restartPreview = () => {
      startPreview()
    }

    const onTimeUpdate = () => {
      if (videoPlayer.value) {
        currentTime.value = videoPlayer.value.currentTime
      }
    }

    const onVideoLoaded = () => {
      if (videoPlayer.value) {
        duration.value = videoPlayer.value.duration
      }
    }

    const onVideoEnded = () => {
      // Check for choices at this point
      checkForChoices()
    }

    const checkForChoices = () => {
      const choices = edges.value.filter(e => e.from_id === currentClip.value?.id)

      if (choices.length > 0) {
        currentChoices.value = choices
        showChoices.value = true
      } else if (currentClip.value?.is_game_over) {
        isGameOver.value = true
      } else {
        // Auto-advance to next clip
        const nextClip = clips.value.find(c =>
          edges.value.some(e => e.from_id === currentClip.value.id && e.to_id === c.id)
        )
        if (nextClip) {
          currentClip.value = nextClip
          watchedClips.value.push(nextClip.id)
          videoPlayer.value?.play()
        }
      }
    }

    const makeChoice = (choice) => {
      // Set any variables
      if (choice.set_var) {
        const [key, value] = choice.set_var.split('=')
        variables.value[key] = value
      }

      // Check required variables
      if (choice.req_var) {
        const [key, value] = choice.req_var.split('=')
        if (variables.value[key] !== value) {
          showToast('Required condition not met', 'warning')
          return
        }
      }

      // Navigate to choice target
      const targetClip = clips.value.find(c => c.id === choice.to_id)
      if (targetClip) {
        currentClip.value = targetClip
        watchedClips.value.push(targetClip.id)
        showChoices.value = false
        videoPlayer.value?.play()
      }
    }

    const togglePlay = () => {
      if (videoPlayer.value) {
        if (isPlaying.value) {
          videoPlayer.value.pause()
        } else {
          videoPlayer.value.play()
        }
        isPlaying.value = !isPlaying.value
      }
    }

    const seekTo = (e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const percent = (e.clientX - rect.left) / rect.width
      if (videoPlayer.value) {
        videoPlayer.value.currentTime = percent * duration.value
      }
    }

    const toggleMute = () => {
      if (videoPlayer.value) {
        videoPlayer.value.muted = !videoPlayer.value.muted
        isMuted.value = videoPlayer.value.muted
      }
    }

    const updateVolume = () => {
      if (videoPlayer.value) {
        videoPlayer.value.volume = volume.value / 100
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
      clips,
      edges,
      videoPlayer,
      startScene,
      currentClip,
      currentTime,
      duration,
      isPlaying,
      isMuted,
      volume,
      showChoices,
      isGameOver,
      currentChoices,
      variables,
      progressPercent,
      getClipSrc,
      startPreview,
      restartPreview,
      onTimeUpdate,
      onVideoLoaded,
      onVideoEnded,
      makeChoice,
      togglePlay,
      seekTo,
      toggleMute,
      updateVolume,
      formatTime
    }
  }
}
</script>

<style scoped>
.preview-view {
  max-width: 1200px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
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
  align-items: center;
}

.start-select {
  min-width: 200px;
}

.player-container {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  overflow: hidden;
}

.video-wrapper {
  position: relative;
  aspect-ratio: 16 / 9;
  background: black;
}

.video-wrapper video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.choice-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
}

.choices-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 40px;
}

.choice-btn {
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-blue));
  color: white;
  border: none;
  padding: 18px 48px;
  font-size: 18px;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 300px;
}

.choice-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 10px 40px rgba(74, 158, 255, 0.3);
}

.game-over-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
}

.game-over-overlay h2 {
  font-size: 48px;
  margin-bottom: 16px;
}

.game-over-overlay p {
  color: var(--text-secondary);
  margin-bottom: 32px;
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg-tertiary);
}

.control-btn {
  background: transparent;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: background 0.15s;
}

.control-btn:hover {
  background: var(--bg-hover);
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-active);
  border-radius: 4px;
  cursor: pointer;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-blue);
  border-radius: 4px;
  transition: width 0.1s;
}

.time-display {
  font-size: 13px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.volume-control input {
  width: 80px;
  cursor: pointer;
}

.variables-panel {
  margin-top: 24px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
}

.variables-panel h3 {
  font-size: 14px;
  margin-bottom: 12px;
}

.variables-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.variable-item {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  font-size: 13px;
}

.var-name {
  color: var(--accent-cyan);
  font-weight: 500;
}

.var-value {
  color: var(--text-primary);
}
</style>
