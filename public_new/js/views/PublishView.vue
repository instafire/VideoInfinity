<template>
  <div class="publish-view">
    <!-- Header -->
    <div class="view-header">
      <div>
        <h1>Publish</h1>
        <p>Export your interactive movie as a standalone HTML file</p>
      </div>
    </div>

    <!-- Publish Settings -->
    <div class="publish-container">
      <div class="publish-settings">
        <div class="settings-section">
          <h3>Player Settings</h3>

          <div class="form-group">
            <label>Player Theme</label>
            <select v-model="settings.theme">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="custom">Custom Color</option>
            </select>
          </div>

          <div class="form-group" v-if="settings.theme === 'custom'">
            <label>Theme Color</label>
            <input type="color" v-model="settings.theme_color" />
          </div>

          <div class="form-group">
            <label>
              <input type="checkbox" v-model="settings.smart_skip" />
              Enable Smart Skip (skip watched scenes)
            </label>
          </div>

          <div class="form-group">
            <label>
              <input type="checkbox" v-model="settings.show_progress" />
              Show Progress Bar
            </label>
          </div>

          <div class="form-group">
            <label>
              <input type="checkbox" v-model="settings.allow_save" />
              Allow Save/Resume
            </label>
          </div>

          <div class="form-group">
            <label>
              <input type="checkbox" v-model="settings.show_achievements" />
              Show Achievements
            </label>
          </div>
        </div>

        <div class="settings-section">
          <h3>Player Options</h3>

          <div class="form-group">
            <label>Starting Scene</label>
            <select v-model="settings.start_scene">
              <option value="">First Scene</option>
              <option v-for="clip in clips" :key="clip.id" :value="clip.id">
                {{ clip.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Intro Duration (seconds)</label>
            <input type="number" v-model.number="settings.intro_duration" min="0" />
          </div>
        </div>

        <button class="btn btn-primary btn-lg w-full" @click="generateBuild" :disabled="isGenerating">
          <svg v-if="!isGenerating" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span v-if="isGenerating" class="spinner"></span>
          {{ isGenerating ? 'Generating...' : 'Generate HTML' }}
        </button>
      </div>

      <!-- Preview -->
      <div class="publish-preview">
        <h3>Preview</h3>

        <div class="preview-frame">
          <div class="preview-player" :style="{ background: getPreviewBg() }">
            <div class="preview-video">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="64" height="64">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
            <div class="preview-controls">
              <div class="preview-progress"></div>
            </div>

            <div class="preview-choices" v-if="clips.length > 0">
              <div class="preview-choice">Choice 1</div>
              <div class="preview-choice">Choice 2</div>
            </div>
          </div>
        </div>

        <!-- Recent Exports -->
        <div class="recent-exports">
          <h4>Recent Exports</h4>
          <div class="export-list" v-if="exports.length > 0">
            <div v-for="exp in exports" :key="exp.id" class="export-item">
              <div class="export-info">
                <span class="export-name">{{ exp.filename }}</span>
                <span class="export-date text-muted text-sm">{{ formatDate(exp.created_at) }}</span>
              </div>
              <div class="export-actions">
                <button class="btn btn-sm btn-secondary" @click="previewExport(exp)">
                  Preview
                </button>
                <button class="btn btn-sm btn-ghost" @click="downloadExport(exp)">
                  Download
                </button>
              </div>
            </div>
          </div>
          <div class="empty-exports" v-else>
            <p>No exports yet</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Generate Modal -->
    <div class="modal-overlay" v-if="showGenerateModal" @click.self="showGenerateModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Build Generated!</h3>
        </div>
        <div class="modal-body text-center">
          <div class="success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="64" height="64">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <p>Your interactive movie has been generated successfully!</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showGenerateModal = false">Close</button>
          <button class="btn btn-primary" @click="downloadLatest">Download</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, inject } from 'vue'

export default {
  name: 'PublishView',
  setup() {
    const showToast = inject('showToast')

    const clips = ref([])
    const exports = ref([])
    const isGenerating = ref(false)
    const showGenerateModal = ref(false)
    const latestExport = ref(null)

    const settings = ref({
      theme: 'dark',
      theme_color: '#4a9eff',
      smart_skip: true,
      show_progress: true,
      allow_save: true,
      show_achievements: true,
      start_scene: '',
      intro_duration: 3
    })

    const loadData = async () => {
      try {
        const [storyRes, exportsRes] = await Promise.all([
          fetch('/api/story'),
          fetch('/api/exports')
        ])
        const storyData = await storyRes.json()
        clips.value = storyData.clips || []
        exports.value = await exportsRes.json()
      } catch (e) {
        console.error('Failed to load data:', e)
      }
    }

    const generateBuild = async () => {
      if (clips.value.length === 0) {
        showToast('No scenes to publish', 'warning')
        return
      }

      isGenerating.value = true

      try {
        const response = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings.value)
        })

        if (response.ok) {
          const data = await response.json()
          latestExport.value = data
          showGenerateModal.value = true
          showToast('Build generated!', 'success')
          loadData()
        } else {
          showToast('Failed to generate build', 'error')
        }
      } catch (e) {
        console.error('Generate error:', e)
        showToast('Error generating build', 'error')
      }

      isGenerating.value = false
    }

    const previewExport = (exp) => {
      window.open(`/exports/${exp.filename}`, '_blank')
    }

    const downloadExport = (exp) => {
      window.location.href = `/api/exports/download/${exp.id}`
    }

    const downloadLatest = () => {
      if (latestExport.value) {
        window.location.href = `/api/exports/download/${latestExport.value.id}`
      }
      showGenerateModal.value = false
    }

    const getPreviewBg = () => {
      if (settings.value.theme === 'custom') {
        return settings.value.theme_color
      }
      return settings.value.theme === 'light' ? '#ffffff' : '#1a1a2e'
    }

    const formatDate = (dateStr) => {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    onMounted(loadData)

    return {
      clips,
      exports,
      isGenerating,
      showGenerateModal,
      settings,
      generateBuild,
      previewExport,
      downloadExport,
      downloadLatest,
      getPreviewBg,
      formatDate
    }
  }
}
</script>

<style scoped>
.publish-view {
  max-width: 1200px;
  margin: 0 auto;
}

.view-header {
  margin-bottom: 24px;
}

.view-header h1 {
  margin-bottom: 4px;
}

.view-header p {
  color: var(--text-muted);
}

.publish-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.publish-settings {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-section h3 {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.publish-preview {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
}

.publish-preview h3 {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.preview-frame {
  margin-bottom: 24px;
}

.preview-player {
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-video {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.3);
}

.preview-controls {
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
}

.preview-progress {
  width: 30%;
  height: 100%;
  background: rgba(255, 255, 255, 0.8);
}

.preview-choices {
  display: flex;
  gap: 12px;
  padding: 16px;
  justify-content: center;
}

.preview-choice {
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-blue));
  color: white;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 12px;
}

.recent-exports h4 {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.export-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.export-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.export-info {
  display: flex;
  flex-direction: column;
}

.export-name {
  font-weight: 500;
}

.export-actions {
  display: flex;
  gap: 8px;
}

.empty-exports {
  text-align: center;
  padding: 20px;
  color: var(--text-muted);
}

.success-icon {
  color: var(--accent-green);
  margin-bottom: 16px;
}

input[type="color"] {
  width: 60px;
  height: 40px;
  padding: 2px;
  cursor: pointer;
}

@media (max-width: 768px) {
  .publish-container {
    grid-template-columns: 1fr;
  }
}
</style>
