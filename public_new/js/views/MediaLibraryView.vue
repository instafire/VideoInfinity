<template>
  <div class="media-library">
    <!-- Header -->
    <div class="view-header">
      <div>
        <h1>Media Library</h1>
        <p>Upload and manage your video, audio, and image files</p>
      </div>
      <button class="btn btn-primary" @click="triggerUpload">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Upload Media
      </button>
      <input
        type="file"
        ref="fileInput"
        @change="handleFileSelect"
        multiple
        accept="video/*,audio/*,image/*"
        style="display: none"
      />
    </div>

    <!-- Tabs -->
    <div class="tabs mb-4">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <span class="tab-count">{{ getTabCount(tab.id) }}</span>
      </button>
    </div>

    <!-- Upload Area -->
    <div
      class="upload-zone"
      :class="{ dragging: isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <p>Drag and drop files here, or click to browse</p>
      <span class="text-muted text-sm">Supports: MP4, AVI, MOV, MKV, WebM, MP3, WAV, JPG, PNG, GIF</span>
    </div>

    <!-- Loading -->
    <div class="loading-state" v-if="isLoading">
      <div class="spinner spinner-lg"></div>
      <p>Loading media...</p>
    </div>

    <!-- Media Grid -->
    <div class="media-grid" v-else-if="filteredMedia.length > 0">
      <div
        v-for="item in filteredMedia"
        :key="item.id"
        class="media-card"
        @click="selectMedia(item)"
      >
        <div class="media-preview">
          <img v-if="item.thumbnail" :src="item.thumbnail" :alt="item.filename" />
          <div v-else class="media-icon">
            <svg v-if="item.type === 'audio'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
              <line x1="7" y1="2" x2="7" y2="22"/>
              <line x1="17" y1="2" x2="17" y2="22"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <line x1="2" y1="7" x2="7" y2="7"/>
              <line x1="2" y1="17" x2="7" y2="17"/>
              <line x1="17" y1="17" x2="22" y2="17"/>
              <line x1="17" y1="7" x2="22" y2="7"/>
            </svg>
          </div>
          <span class="media-duration" v-if="item.duration">{{ formatDuration(item.duration) }}</span>
        </div>
        <div class="media-info">
          <span class="media-name">{{ item.filename }}</span>
          <span class="media-size text-muted text-sm">{{ formatSize(item.size) }}</span>
        </div>
        <div class="media-actions">
          <button class="btn-icon" @click.stop="previewMedia(item)" title="Preview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>
          <button class="btn-icon" @click.stop="confirmDelete(item)" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div class="empty-state" v-else>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <h3>No media files</h3>
      <p>Upload videos, audio, or images to get started</p>
    </div>

    <!-- Preview Modal -->
    <div class="modal-overlay" v-if="previewItem" @click.self="previewItem = null">
      <div class="modal" style="max-width: 800px;">
        <div class="modal-header">
          <h3>{{ previewItem.filename }}</h3>
          <button class="btn-icon" @click="previewItem = null">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <video
            v-if="previewItem.type === 'video'"
            :src="previewItem.filepath"
            controls
            style="width: 100%; border-radius: 8px;"
          ></video>
          <img
            v-else-if="previewItem.type === 'image'"
            :src="previewItem.filepath"
            style="width: 100%; border-radius: 8px;"
          />
          <audio
            v-else
            :src="previewItem.filepath"
            controls
            style="width: 100%;"
          ></audio>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, inject } from 'vue'

export default {
  name: 'MediaLibraryView',
  setup() {
    const showToast = inject('showToast')
    const fileInput = ref(null)

    const videos = ref([])
    const audio = ref([])
    const images = ref([])
    const activeTab = ref('all')
    const isLoading = ref(true)
    const isDragging = ref(false)
    const previewItem = ref(null)

    const tabs = [
      { id: 'all', label: 'All' },
      { id: 'video', label: 'Videos' },
      { id: 'audio', label: 'Audio' },
      { id: 'image', label: 'Images' }
    ]

    const allMedia = computed(() => [
      ...videos.value.map(v => ({ ...v, mediaType: 'video' })),
      ...audio.value.map(a => ({ ...a, mediaType: 'audio' })),
      ...images.value.map(i => ({ ...i, mediaType: 'image' }))
    ])

    const filteredMedia = computed(() => {
      if (activeTab.value === 'all') return allMedia.value
      return allMedia.value.filter(m => m.mediaType === activeTab.value)
    })

    const getTabCount = (tabId) => {
      if (tabId === 'all') return allMedia.value.length
      return allMedia.value.filter(m => m.mediaType === tabId).length
    }

    const loadMedia = async () => {
      isLoading.value = true
      try {
        const [videosRes, audioRes, imagesRes] = await Promise.all([
          fetch('/api/videos'),
          fetch('/api/audio'),
          fetch('/api/images')
        ])
        videos.value = await videosRes.json()
        audio.value = await audioRes.json()
        images.value = await imagesRes.json()
      } catch (e) {
        console.error('Failed to load media:', e)
        showToast('Failed to load media', 'error')
      }
      isLoading.value = false
    }

    const triggerUpload = () => {
      fileInput.value.click()
    }

    const handleFileSelect = async (e) => {
      const files = Array.from(e.target.files)
      await uploadFiles(files)
      e.target.value = ''
    }

    const handleDrop = async (e) => {
      isDragging.value = false
      const files = Array.from(e.dataTransfer.files)
      await uploadFiles(files)
    }

    const uploadFiles = async (files) => {
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)

        try {
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          })

          if (response.ok) {
            showToast(`Uploaded ${file.name}`, 'success')
          } else {
            showToast(`Failed to upload ${file.name}`, 'error')
          }
        } catch (e) {
          console.error('Upload error:', e)
          showToast(`Error uploading ${file.name}`, 'error')
        }
      }
      loadMedia()
    }

    const selectMedia = (item) => {
      console.log('Selected:', item)
    }

    const previewMedia = (item) => {
      previewItem.value = {
        ...item,
        filepath: item.filepath || `/${item.type}/${item.filename}`
      }
    }

    const confirmDelete = async (item) => {
      if (!confirm(`Delete ${item.filename}?`)) return

      try {
        await fetch('/api/delete_video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id })
        })
        showToast('File deleted', 'success')
        loadMedia()
      } catch (e) {
        showToast('Failed to delete', 'error')
      }
    }

    const formatDuration = (seconds) => {
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const formatSize = (bytes) => {
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    onMounted(loadMedia)

    return {
      fileInput,
      videos,
      audio,
      images,
      activeTab,
      tabs,
      filteredMedia,
      isLoading,
      isDragging,
      previewItem,
      getTabCount,
      triggerUpload,
      handleFileSelect,
      handleDrop,
      selectMedia,
      previewMedia,
      confirmDelete,
      formatDuration,
      formatSize
    }
  }
}
</script>

<style scoped>
.media-library {
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

.tab-count {
  margin-left: 8px;
  background: var(--bg-active);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.tab.active .tab-count {
  background: var(--accent-blue);
  color: white;
}

.upload-zone {
  border: 2px dashed var(--border-color);
  border-radius: 16px;
  padding: 48px;
  text-align: center;
  margin-bottom: 24px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-zone:hover,
.upload-zone.dragging {
  border-color: var(--accent-blue);
  background: rgba(74, 158, 255, 0.05);
}

.upload-zone svg {
  color: var(--text-muted);
  margin-bottom: 16px;
}

.upload-zone p {
  margin-bottom: 8px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px;
}

.loading-state p {
  margin-top: 16px;
  color: var(--text-muted);
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}

.media-card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.media-card:hover {
  border-color: var(--border-light);
  transform: translateY(-2px);
}

.media-preview {
  position: relative;
  height: 140px;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-icon {
  color: var(--text-muted);
}

.media-duration {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.media-info {
  padding: 12px;
}

.media-name {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
  margin-bottom: 4px;
}

.media-actions {
  display: flex;
  gap: 8px;
  padding: 0 12px 12px;
  opacity: 0;
  transition: opacity 0.2s;
}

.media-card:hover .media-actions {
  opacity: 1;
}
</style>
