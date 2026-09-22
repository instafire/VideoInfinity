<template>
  <div class="scene-editor">
    <!-- Header -->
    <div class="view-header">
      <div>
        <h1>Scenes</h1>
        <p>Create and edit clips from your video library</p>
      </div>
      <button class="btn btn-primary" @click="showCreateModal = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        New Scene
      </button>
    </div>

    <!-- Empty State -->
    <div class="empty-state" v-if="clips.length === 0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M6 7h12"/>
        <path d="M6 12h12"/>
        <path d="M6 17h8"/>
        <circle cx="4" cy="7" r="2"/>
        <circle cx="4" cy="12" r="2"/>
        <circle cx="4" cy="17" r="2"/>
      </svg>
      <h3>No scenes yet</h3>
      <p>Create scenes from your uploaded videos</p>
      <button class="btn btn-primary btn-lg" @click="showCreateModal = true">
        Create Your First Scene
      </button>
    </div>

    <!-- Scenes Grid -->
    <div class="scenes-grid" v-else>
      <div
        v-for="clip in clips"
        :key="clip.id"
        class="scene-card"
        :class="{ selected: selectedClip?.id === clip.id }"
        @click="selectClip(clip)"
      >
        <div class="scene-thumbnail">
          <img v-if="clip.thumbnail" :src="clip.thumbnail" :alt="clip.name" />
          <div v-else class="scene-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <span class="scene-duration">{{ formatDuration(clip.duration) }}</span>
          <span class="scene-badge" v-if="clip.is_game_over">END</span>
          <span class="scene-badge event" v-if="clip.is_event_clip">EVENT</span>
        </div>
        <div class="scene-info">
          <h4>{{ clip.name }}</h4>
          <span class="text-muted text-sm">{{ clip.chapter_name || 'No chapter' }}</span>
        </div>
        <div class="scene-actions">
          <button class="btn-icon" @click.stop="editClip(clip)" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </button>
          <button class="btn-icon" @click.stop="confirmDelete(clip)" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Create Scene Modal -->
    <div class="modal-overlay" v-if="showCreateModal" @click.self="showCreateModal = false">
      <div class="modal" style="max-width: 700px;">
        <div class="modal-header">
          <h3>Create New Scene</h3>
          <button class="btn-icon" @click="showCreateModal = false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Scene Name</label>
            <input type="text" v-model="newClip.name" placeholder="My Scene" />
          </div>
          <div class="form-group">
            <label>Source Video</label>
            <select v-model="newClip.source_video_id">
              <option value="">Select a video...</option>
              <option v-for="video in videos" :key="video.id" :value="video.id">
                {{ video.filename }}
              </option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Start Time (seconds)</label>
              <input type="number" v-model.number="newClip.start_time" min="0" step="0.1" />
            </div>
            <div class="form-group">
              <label>End Time (seconds)</label>
              <input type="number" v-model.number="newClip.end_time" min="0" step="0.1" />
            </div>
          </div>
          <div class="form-group">
            <label>Chapter Name</label>
            <input type="text" v-model="newClip.chapter_name" placeholder="Chapter 1" />
          </div>
          <div class="form-group">
            <label>Filter</label>
            <select v-model="newClip.filter">
              <option value="">None</option>
              <option value="bw">Black & White</option>
              <option value="sepia">Sepia</option>
              <option value="vivid">Vivid</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Speed</label>
              <select v-model.number="newClip.speed">
                <option value="0.5">0.5x</option>
                <option value="1">1x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2x</option>
              </select>
            </div>
            <div class="form-group">
              <label>Volume</label>
              <input type="range" v-model.number="newClip.volume" min="0" max="200" />
              <span>{{ newClip.volume || 100 }}%</span>
            </div>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" v-model="newClip.is_game_over" />
              This is a game over / ending
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showCreateModal = false">Cancel</button>
          <button class="btn btn-primary" @click="createClip" :disabled="!newClip.source_video_id">
            Create Scene
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Scene Modal -->
    <div class="modal-overlay" v-if="editingClip" @click.self="editingClip = null">
      <div class="modal" style="max-width: 700px;">
        <div class="modal-header">
          <h3>Edit Scene</h3>
          <button class="btn-icon" @click="editingClip = null">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Scene Name</label>
            <input type="text" v-model="editForm.name" />
          </div>
          <div class="form-group">
            <label>Chapter Name</label>
            <input type="text" v-model="editForm.chapter_name" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Start Time</label>
              <input type="number" v-model.number="editForm.start_time" step="0.1" />
            </div>
            <div class="form-group">
              <label>End Time</label>
              <input type="number" v-model.number="editForm.end_time" step="0.1" />
            </div>
          </div>
          <div class="form-group">
            <label>Filter</label>
            <select v-model="editForm.filter">
              <option value="">None</option>
              <option value="bw">Black & White</option>
              <option value="sepia">Sepia</option>
              <option value="vivid">Vivid</option>
            </select>
          </div>
          <div class="form-group">
            <label>Speed</label>
            <select v-model.number="editForm.speed">
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </div>
          <div class="form-group">
            <label>Volume</label>
            <input type="range" v-model.number="editForm.volume" min="0" max="100" />
            <span>{{ editForm.volume }}%</span>
          </div>
          <div class="form-group">
            <label>Background Music</label>
            <select v-model="editForm.bg_music">
              <option value="">None</option>
              <option v-for="a in audioFiles" :key="a.id" :value="a.filename">
                {{ a.filename }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" v-model="editForm.mute_audio" />
              Mute original audio
            </label>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" v-model="editForm.is_game_over" />
              Game over / ending
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="editingClip = null">Cancel</button>
          <button class="btn btn-primary" @click="saveClip">Save Changes</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, inject } from 'vue'

export default {
  name: 'SceneEditorView',
  setup() {
    const showToast = inject('showToast')

    const clips = ref([])
    const videos = ref([])
    const audioFiles = ref([])
    const selectedClip = ref(null)
    const showCreateModal = ref(false)
    const editingClip = ref(null)

    const newClip = ref({
      name: '',
      source_video_id: '',
      start_time: 0,
      end_time: 10,
      chapter_name: '',
      filter: '',
      speed: 1,
      volume: 100,
      is_game_over: false
    })

    const editForm = ref({})

    const loadData = async () => {
      try {
        const [clipsRes, videosRes, audioRes] = await Promise.all([
          fetch('/api/story'),
          fetch('/api/videos'),
          fetch('/api/audio')
        ])
        const storyData = await clipsRes.json()
        clips.value = storyData.clips || []
        videos.value = await videosRes.json()
        audioFiles.value = await audioRes.json()
      } catch (e) {
        console.error('Failed to load data:', e)
      }
    }

    const selectClip = (clip) => {
      selectedClip.value = clip
    }

    const createClip = async () => {
      try {
        const response = await fetch('/api/clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newClip.value)
        })

        if (response.ok) {
          showToast('Scene created', 'success')
          showCreateModal.value = false
          loadData()
          resetNewClip()
        }
      } catch (e) {
        showToast('Failed to create scene', 'error')
      }
    }

    const editClip = (clip) => {
      editingClip.value = clip
      editForm.value = { ...clip }
    }

    const saveClip = async () => {
      try {
        await fetch('/api/clip/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm.value)
        })
        showToast('Scene saved', 'success')
        editingClip.value = null
        loadData()
      } catch (e) {
        showToast('Failed to save', 'error')
      }
    }

    const confirmDelete = async (clip) => {
      if (!confirm(`Delete "${clip.name}"?`)) return

      try {
        await fetch('/api/delete_clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: clip.id })
        })
        showToast('Scene deleted', 'success')
        loadData()
      } catch (e) {
        showToast('Failed to delete', 'error')
      }
    }

    const resetNewClip = () => {
      newClip.value = {
        name: '',
        source_video_id: '',
        start_time: 0,
        end_time: 10,
        chapter_name: '',
        filter: '',
        speed: 1,
        volume: 100,
        is_game_over: false
      }
    }

    const formatDuration = (seconds) => {
      if (!seconds) return '0:00'
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    onMounted(loadData)

    return {
      clips,
      videos,
      audioFiles,
      selectedClip,
      showCreateModal,
      editingClip,
      newClip,
      editForm,
      selectClip,
      createClip,
      editClip,
      saveClip,
      confirmDelete,
      formatDuration
    }
  }
}
</script>

<style scoped>
.scene-editor {
  max-width: 1400px;
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

.scenes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
}

.scene-card {
  background: var(--bg-tertiary);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.scene-card:hover {
  border-color: var(--border-light);
}

.scene-card.selected {
  border-color: var(--accent-blue);
}

.scene-thumbnail {
  position: relative;
  height: 140px;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.scene-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scene-placeholder {
  color: var(--text-muted);
}

.scene-duration {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.scene-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: var(--accent-red);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}

.scene-badge.event {
  background: var(--accent-purple);
  left: auto;
  right: 8px;
}

.scene-info {
  padding: 12px;
}

.scene-info h4 {
  margin-bottom: 4px;
  font-size: 14px;
}

.scene-actions {
  display: flex;
  gap: 8px;
  padding: 0 12px 12px;
  opacity: 0;
  transition: opacity 0.2s;
}

.scene-card:hover .scene-actions {
  opacity: 1;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

input[type="range"] {
  width: 100%;
  margin-top: 8px;
}
</style>
