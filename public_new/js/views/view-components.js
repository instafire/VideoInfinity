// Dashboard View Component
const DashboardView = {
  name: 'DashboardView',
  template: `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1>My Projects</h1>
          <p class="text-muted">Create and manage your interactive video projects</p>
        </div>
        <button class="btn btn-primary" @click="showNewProjectModal = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Project
        </button>
      </div>

      <div class="project-grid" v-if="projects.length > 0">
        <div v-for="project in projects" :key="project.id" class="project-card card card-hover" @click="selectProject(project)">
          <div class="project-thumbnail" :style="{ background: project.theme_color || '#4a9eff' }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <div class="project-info">
            <h3>{{ project.title }}</h3>
            <span class="text-muted text-sm">{{ formatDate(project.created_at) }}</span>
          </div>
          <div class="project-actions">
            <button class="btn-icon" @click.stop="editProject(project)" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>
            <button class="btn-icon" @click.stop="confirmDelete(project)" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div class="empty-state" v-else>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1.5"/><path d="M16 2v4"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M12 13v6"/>
        </svg>
        <h3>No projects yet</h3>
        <p>Create your first interactive video project to get started</p>
        <button class="btn btn-primary btn-lg" @click="showNewProjectModal = true">Create Your First Project</button>
      </div>

      <div class="modal-overlay" v-if="showNewProjectModal" @click.self="showNewProjectModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ editingProject ? 'Edit Project' : 'New Project' }}</h3>
            <button class="btn-icon" @click="showNewProjectModal = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Project Title</label>
              <input type="text" v-model="projectForm.title" placeholder="My Interactive Movie" @keyup.enter="saveProject" />
            </div>
            <div class="form-group">
              <label>Theme Color</label>
              <div class="color-options">
                <button v-for="color in themeColors" :key="color" class="color-option" :class="{ active: projectForm.theme_color === color }" :style="{ background: color }" @click="projectForm.theme_color = color"></button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showNewProjectModal = false">Cancel</button>
            <button class="btn btn-primary" @click="saveProject" :disabled="!projectForm.title.trim()">{{ editingProject ? 'Save Changes' : 'Create Project' }}</button>
          </div>
        </div>
      </div>

      <div class="modal-overlay" v-if="showDeleteModal" @click.self="showDeleteModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>Delete Project</h3>
            <button class="btn-icon" @click="showDeleteModal = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete <strong>{{ projectToDelete?.title }}</strong>? This action cannot be undone.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showDeleteModal = false">Cancel</button>
            <button class="btn btn-danger" @click="deleteProject">Delete Project</button>
          </div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const showToast = inject('showToast')
    const projects = ref([])
    const showNewProjectModal = ref(false)
    const showDeleteModal = ref(false)
    const editingProject = ref(null)
    const projectToDelete = ref(null)
    const projectForm = ref({ title: '', theme_color: '#4a9eff' })
    const themeColors = ['#4a9eff', '#22d3ee', '#a855f7', '#22c55e', '#f97316', '#ef4444', '#ec4899', '#8b5cf6']

    const loadProjects = async () => {
      try {
        const response = await fetch('/api/projects')
        projects.value = await response.json()
      } catch (e) { console.error('Failed to load projects:', e) }
    }

    const selectProject = (project) => { window.location.hash = '/media' }
    const editProject = (project) => { editingProject.value = project; projectForm.value = { title: project.title, theme_color: project.theme_color || '#4a9eff' }; showNewProjectModal.value = true }
    const confirmDelete = (project) => { projectToDelete.value = project; showDeleteModal.value = true }

    const saveProject = async () => {
      if (!projectForm.value.title.trim()) return
      try {
        const method = editingProject.value ? 'PUT' : 'POST'
        const url = editingProject.value ? '/api/projects/' + editingProject.value.id : '/api/projects'
        const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectForm.value) })
        if (response.ok) {
          showToast(editingProject.value ? 'Project updated' : 'Project created', 'success')
          showNewProjectModal.value = false; loadProjects(); editingProject.value = null; projectForm.value = { title: '', theme_color: '#4a9eff' }
        }
      } catch (e) { showToast('Failed to save project', 'error') }
    }

    const deleteProject = async () => {
      try {
        await fetch('/api/projects/' + projectToDelete.value.id, { method: 'DELETE' })
        showToast('Project deleted', 'success'); showDeleteModal.value = false; loadProjects()
      } catch (e) { showToast('Failed to delete project', 'error') }
    }

    const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

    onMounted(loadProjects)

    return { projects, showNewProjectModal, showDeleteModal, editingProject, projectToDelete, projectForm, themeColors, selectProject, editProject, confirmDelete, saveProject, deleteProject, formatDate }
  }
}

// Media Library View
const MediaLibraryView = {
  name: 'MediaLibraryView',
  template: `
    <div class="media-library">
      <div class="view-header">
        <div><h1>Media Library</h1><p class="text-muted">Upload and manage your video, audio, and image files</p></div>
        <button class="btn btn-primary" @click="triggerUpload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload Media
        </button>
        <input type="file" ref="fileInput" @change="handleFileSelect" multiple accept="video/*,audio/*,image/*" style="display:none" />
      </div>

      <div class="tabs mb-4">
        <button v-for="tab in tabs" :key="tab.id" class="tab" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">{{ tab.label }}<span class="tab-count">{{ getTabCount(tab.id) }}</span></button>
      </div>

      <div class="upload-zone" :class="{ dragging: isDragging }" @dragover.prevent="isDragging = true" @dragleave="isDragging = false" @drop.prevent="handleDrop">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p>Drag and drop files here, or click to browse</p>
        <span class="text-muted text-sm">Supports: MP4, AVI, MOV, MKV, WebM, MP3, WAV, JPG, PNG, GIF</span>
      </div>

      <div class="loading-state" v-if="isLoading"><div class="spinner spinner-lg"></div><p>Loading media...</p></div>

      <div class="media-grid" v-else-if="filteredMedia.length > 0">
        <div v-for="item in filteredMedia" :key="item.id" class="media-card" @click="selectMedia(item)">
          <div class="media-preview">
            <img v-if="item.thumbnail" :src="item.thumbnail" :alt="item.filename" />
            <div v-else class="media-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/></svg></div>
            <span class="media-duration" v-if="item.duration">{{ formatDuration(item.duration) }}</span>
          </div>
          <div class="media-info"><span class="media-name">{{ item.filename }}</span><span class="media-size text-muted text-sm">{{ formatSize(item.size) }}</span></div>
          <div class="media-actions">
            <button class="btn-icon" @click.stop="previewMedia(item)" title="Preview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
            <button class="btn-icon" @click.stop="confirmDelete(item)" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          </div>
        </div>
      </div>

      <div class="empty-state" v-else><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><h3>No media files</h3><p>Upload videos, audio, or images to get started</p></div>
    </div>
  `,
  setup() {
    const showToast = inject('showToast')
    const fileInput = ref(null)
    const videos = ref([]), audio = ref([]), images = ref([]), activeTab = ref('all'), isLoading = ref(true), isDragging = ref(false), previewItem = ref(null)
    const tabs = [{ id: 'all', label: 'All' }, { id: 'video', label: 'Videos' }, { id: 'audio', label: 'Audio' }, { id: 'image', label: 'Images' }]

    const allMedia = computed(() => [...videos.value.map(v => ({ ...v, mediaType: 'video' })), ...audio.value.map(a => ({ ...a, mediaType: 'audio' })), ...images.value.map(i => ({ ...i, mediaType: 'image' }))])
    const filteredMedia = computed(() => activeTab.value === 'all' ? allMedia.value : allMedia.value.filter(m => m.mediaType === activeTab.value))
    const getTabCount = (tabId) => tabId === 'all' ? allMedia.value.length : allMedia.value.filter(m => m.mediaType === tabId).length

    const loadMedia = async () => {
      isLoading.value = true
      const [videosRes, audioRes, imagesRes] = await Promise.all([fetch('/api/videos'), fetch('/api/audio'), fetch('/api/images')])
      videos.value = await videosRes.json(); audio.value = await audioRes.json(); images.value = await imagesRes.json()
      isLoading.value = false
    }

    const triggerUpload = () => fileInput.value.click()
    const handleFileSelect = async (e) => { const files = Array.from(e.target.files); await uploadFiles(files); e.target.value = '' }
    const handleDrop = async (e) => { isDragging.value = false; await uploadFiles(Array.from(e.dataTransfer.files)) }

    const uploadFiles = async (files) => {
      for (const file of files) {
        const formData = new FormData(); formData.append('file', file)
        try {
          const response = await fetch('/api/upload', { method: 'POST', body: formData })
          if (response.ok) showToast('Uploaded ' + file.name, 'success'); else showToast('Failed to upload ' + file.name, 'error')
        } catch (e) { showToast('Error uploading ' + file.name, 'error') }
      }
      loadMedia()
    }

    const selectMedia = (item) => { console.log('Selected:', item) }
    const previewMedia = (item) => { previewItem.value = { ...item, filepath: item.filepath || '/' + item.type + '/' + item.filename } }
    const confirmDelete = async (item) => {
      if (!confirm('Delete ' + item.filename + '?')) return
      try { await fetch('/api/delete_video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) }); showToast('File deleted', 'success'); loadMedia() }
      catch (e) { showToast('Failed to delete', 'error') }
    }
    const formatDuration = (seconds) => { const mins = Math.floor(seconds / 60), secs = Math.floor(seconds % 60); return mins + ':' + secs.toString().padStart(2, '0') }
    const formatSize = (bytes) => bytes < 1024 ? bytes + ' B' : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB'

    onMounted(loadMedia)
    return { fileInput, videos, audio, images, activeTab, tabs, filteredMedia, isLoading, isDragging, previewItem, getTabCount, triggerUpload, handleFileSelect, handleDrop, selectMedia, previewMedia, confirmDelete, formatDuration, formatSize }
  }
}

// Scene Editor View
const SceneEditorView = {
  name: 'SceneEditorView',
  template: `
    <div class="scene-editor">
      <div class="view-header"><div><h1>Scenes</h1><p class="text-muted">Create and edit clips from your video library</p></div>
        <button class="btn btn-primary" @click="showCreateModal = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Scene
        </button>
      </div>

      <div class="empty-state" v-if="clips.length === 0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 7h12"/><path d="M6 12h12"/><path d="M6 17h8"/><circle cx="4" cy="7" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="4" cy="17" r="2"/></svg>
        <h3>No scenes yet</h3><p>Create scenes from your uploaded videos</p>
        <button class="btn btn-primary btn-lg" @click="showCreateModal = true">Create Your First Scene</button>
      </div>

      <div class="scenes-grid" v-else>
        <div v-for="clip in clips" :key="clip.id" class="scene-card" :class="{ selected: selectedClip?.id === clip.id }" @click="selectClip(clip)">
          <div class="scene-thumbnail">
            <img v-if="clip.thumbnail" :src="clip.thumbnail" :alt="clip.name" />
            <div v-else class="scene-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
            <span class="scene-duration">{{ formatDuration(clip.duration) }}</span>
            <span class="scene-badge" v-if="clip.is_game_over">END</span>
            <span class="scene-badge event" v-if="clip.is_event_clip">EVENT</span>
          </div>
          <div class="scene-info"><h4>{{ clip.name }}</h4><span class="text-muted text-sm">{{ clip.chapter_name || 'No chapter' }}</span></div>
          <div class="scene-actions">
            <button class="btn-icon" @click.stop="editClip(clip)" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
            <button class="btn-icon" @click.stop="confirmDelete(clip)" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          </div>
        </div>
      </div>

      <div class="modal-overlay" v-if="showCreateModal" @click.self="showCreateModal = false">
        <div class="modal" style="max-width:700px">
          <div class="modal-header"><h3>Create New Scene</h3><button class="btn-icon" @click="showCreateModal = false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
          <div class="modal-body">
            <div class="form-group"><label>Scene Name</label><input type="text" v-model="newClip.name" placeholder="My Scene" /></div>
            <div class="form-group"><label>Source Video</label><select v-model="newClip.source_video_id"><option value="">Select a video...</option><option v-for="video in videos" :key="video.id" :value="video.id">{{ video.filename }}</option></select></div>
            <div class="form-row"><div class="form-group"><label>Start Time (seconds)</label><input type="number" v-model.number="newClip.start_time" min="0" step="0.1" /></div><div class="form-group"><label>End Time (seconds)</label><input type="number" v-model.number="newClip.end_time" min="0" step="0.1" /></div></div>
            <div class="form-group"><label>Chapter Name</label><input type="text" v-model="newClip.chapter_name" placeholder="Chapter 1" /></div>
            <div class="form-group"><label><input type="checkbox" v-model="newClip.is_game_over" /> This is a game over / ending</label></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" @click="showCreateModal = false">Cancel</button><button class="btn btn-primary" @click="createClip" :disabled="!newClip.source_video_id">Create Scene</button></div>
        </div>
      </div>

      <div class="modal-overlay" v-if="editingClip" @click.self="editingClip = null">
        <div class="modal" style="max-width:700px">
          <div class="modal-header"><h3>Edit Scene</h3><button class="btn-icon" @click="editingClip = null"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
          <div class="modal-body">
            <div class="form-group"><label>Scene Name</label><input type="text" v-model="editForm.name" /></div>
            <div class="form-group"><label>Chapter Name</label><input type="text" v-model="editForm.chapter_name" /></div>
            <div class="form-group"><label><input type="checkbox" v-model="editForm.is_game_over" /> Game over / ending</label></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" @click="editingClip = null">Cancel</button><button class="btn btn-primary" @click="saveClip">Save Changes</button></div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const showToast = inject('showToast')
    const clips = ref([]), videos = ref([]), selectedClip = ref(null), showCreateModal = ref(false), editingClip = ref(null)
    const newClip = ref({ name: '', source_video_id: '', start_time: 0, end_time: 10, chapter_name: '', is_game_over: false }), editForm = ref({})

    const loadData = async () => { const [clipsRes, videosRes] = await Promise.all([fetch('/api/story'), fetch('/api/videos')]); const storyData = await clipsRes.json(); clips.value = storyData.clips || []; videos.value = await videosRes.json() }
    const selectClip = (clip) => selectedClip.value = clip
    const createClip = async () => {
      try { const response = await fetch('/api/clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newClip.value) })
        if (response.ok) { showToast('Scene created', 'success'); showCreateModal.value = false; loadData(); newClip.value = { name: '', source_video_id: '', start_time: 0, end_time: 10, chapter_name: '', is_game_over: false } }
      } catch (e) { showToast('Failed to create scene', 'error') }
    }
    const editClip = (clip) => { editingClip.value = clip; editForm.value = { ...clip } }
    const saveClip = async () => { try { await fetch('/api/clip/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm.value) }); showToast('Scene saved', 'success'); editingClip.value = null; loadData() } catch (e) { showToast('Failed to save', 'error') } }
    const confirmDelete = async (clip) => { if (!confirm('Delete "' + clip.name + '"?')) return; try { await fetch('/api/delete_clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: clip.id }) }); showToast('Scene deleted', 'success'); loadData() } catch (e) { showToast('Failed to delete', 'error') } }
    const formatDuration = (seconds) => { if (!seconds) return '0:00'; const mins = Math.floor(seconds / 60), secs = Math.floor(seconds % 60); return mins + ':' + secs.toString().padStart(2, '0') }

    onMounted(loadData)
    return { clips, videos, selectedClip, showCreateModal, editingClip, newClip, editForm, selectClip, createClip, editClip, saveClip, confirmDelete, formatDuration }
  }
}

// Timeline View
const TimelineView = {
  name: 'TimelineView',
  template: `
    <div class="timeline-view">
      <div class="view-header">
        <div><h1>Timeline</h1><p class="text-muted">Arrange your scenes on the story timeline</p></div>
        <div class="header-actions">
          <button class="btn btn-secondary" @click="autoLayout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>Auto Layout</button>
          <button class="btn btn-primary" @click="validateStory"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>Validate</button>
        </div>
      </div>

      <div class="timeline-container">
        <div class="clips-library"><h3>Scenes</h3><div class="library-list">
          <div v-for="clip in clips" :key="clip.id" class="library-clip" :class="{ used: isClipUsed(clip) }" draggable="true" @dragstart="onDragStart($event, clip)">
            <div class="clip-color" :style="{ background: getClipColor(clip) }"></div><span>{{ clip.name }}</span><span class="clip-duration text-muted text-sm">{{ formatDuration(clip.duration) }}</span>
          </div>
        </div></div>

        <div class="timeline-area">
          <div class="timeline-ruler"><div v-for="i in 20" :key="i" class="ruler-mark" :style="{ left: (i-1)*50+'px' }"><span>{{ i-1 }}:00</span></div></div>
          <div class="timeline-tracks">
            <div class="track"><div class="track-header"><span>Story Spine</span></div><div class="track-content" @dragover.prevent @drop="onDropToTrack($event)">
              <div v-for="(clip, index) in timelineClips" :key="clip.id" class="timeline-clip" :style="{ left: (clip.position || index*100)+'px', width: (clip.duration*50)+'px', background: getClipColor(clip) }" @click="selectClip(clip)"><span class="clip-name">{{ clip.name }}</span></div>
            </div></div>
          </div>
          <div class="playhead" :style="{ left: playheadPosition+'px' }"><div class="playhead-head"></div><div class="playhead-line"></div></div>
        </div>
      </div>

      <div class="properties-panel" v-if="selectedClip">
        <h3>Clip Properties</h3>
        <div class="form-group"><label>Name</label><input type="text" v-model="selectedClip.name" @change="updateClip" /></div>
        <div class="form-group"><label>Chapter</label><input type="text" v-model="selectedClip.chapter_name" @change="updateClip" /></div>
        <div class="form-group"><label><input type="checkbox" v-model="selectedClip.is_game_over" @change="updateClip" /> Game Over / Ending</label></div>
      </div>
    </div>
  `,
  setup() {
    const showToast = inject('showToast')
    const clips = ref([]), timelineClips = ref([]), selectedClip = ref(null), playheadPosition = ref(0), draggedClip = ref(null)
    const isClipUsed = (clip) => timelineClips.value.some(c => c.id === clip.id)
    const getClipColor = (clip) => clip.is_game_over ? '#ef4444' : clip.is_event_clip ? '#a855f7' : '#3b82f6'
    const onDragStart = (e, clip) => { draggedClip.value = clip; e.dataTransfer.effectAllowed = 'copy' }
    const onDropToTrack = (e) => { if (draggedClip.value && !isClipUsed(draggedClip.value)) { timelineClips.value.push({ ...draggedClip.value, position: timelineClips.value.length * 100 }); showToast('Clip added to timeline', 'success') } draggedClip.value = null }
    const selectClip = (clip) => selectedClip.value = clip
    const updateClip = async () => { try { await fetch('/api/clip/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selectedClip.value) }); showToast('Clip updated', 'success') } catch (e) { showToast('Failed to update', 'error') } }
    const autoLayout = () => { timelineClips.value.forEach((clip, index) => { clip.position = index * 150 }); showToast('Timeline auto-layout complete', 'success') }
    const validateStory = async () => { try { const response = await fetch('/api/story/diagnostics', { method: 'POST' }); const result = await response.json(); if (result.valid) showToast('Story is valid!', 'success'); else showToast('Story has issues', 'warning') } catch (e) { showToast('Validation failed', 'error') } }
    const formatDuration = (seconds) => { if (!seconds) return '0:00'; const mins = Math.floor(seconds / 60), secs = Math.floor(seconds % 60); return mins + ':' + secs.toString().padStart(2, '0') }
    const loadData = async () => { const [storyRes] = await Promise.all([fetch('/api/story')]); const storyData = await storyRes.json(); clips.value = storyData.clips || []; timelineClips.value = clips.value.map((clip, index) => ({ ...clip, position: index * 150 })) }
    onMounted(loadData)
    return { clips, timelineClips, selectedClip, playheadPosition, isClipUsed, getClipColor, onDragStart, onDropToTrack, selectClip, updateClip, autoLayout, validateStory, formatDuration }
  }
}

// Branch Editor View
const BranchEditorView = {
  name: 'BranchEditorView',
  template: `
    <div class="branch-editor">
      <div class="view-header">
        <div><h1>Branches</h1><p class="text-muted">Visual story flow editor - connect your scenes with choices</p></div>
        <div class="header-actions">
          <button class="btn btn-secondary" @click="autoLayout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>Auto Layout</button>
          <button class="btn btn-primary" @click="validateStory"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>Validate</button>
        </div>
      </div>

      <div class="editor-container">
        <div class="node-palette"><h3>Scenes</h3><div class="palette-nodes">
          <div v-for="clip in clips" :key="clip.id" class="palette-node" :class="getNodeClass(clip)" draggable="true" @dragstart="onDragStart($event, clip)"><div class="node-indicator"></div><span>{{ clip.name }}</span></div>
        </div></div>

        <div class="canvas-area" ref="canvasArea">
          <svg class="connections-layer"><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#4a9eff" /></marker></defs>
            <path v-for="edge in edges" :key="edge.id" :d="getEdgePath(edge)" fill="none" stroke="#4a9eff" stroke-width="2" marker-end="url(#arrowhead)" @click="selectEdge(edge)" />
          </svg>

          <div v-for="clip in clips" :key="'node-'+clip.id" class="graph-node" :class="{ selected: selectedNode?.id === clip.id, 'game-over': clip.is_game_over, 'event-node': clip.is_event_clip }" :style="{ left: (clip.x||100)+'px', top: (clip.y||100)+'px' }" @mousedown="onNodeMouseDown($event, clip)" @click="selectNode(clip)">
            <div class="node-thumb-container" v-if="clip.thumbnail"><img :src="clip.thumbnail" class="node-thumb" alt="" /><div class="play-icon-overlay">▶</div></div>
            <div class="node-header"><span class="node-type">{{ clip.is_game_over ? 'END' : clip.is_event_clip ? 'EVENT' : 'SCENE' }}</span></div>
            <div class="node-content"><h4>{{ clip.name }}</h4><p v-if="clip.chapter_name">{{ clip.chapter_name }}</p></div>
            <div class="node-ports"><div class="port port-output" @mousedown.stop="startEdgeDrag($event, clip, 'output')"></div><div class="port port-input" @mouseup.stop="onEdgeDrop(clip, 'input')"></div></div>
          </div>

          <div class="canvas-empty" v-if="clips.length === 0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg><h3>No scenes to connect</h3><p>Create scenes first to build your story flow</p></div>
        </div>

        <div class="properties-panel" v-if="selectedNode">
          <h3>Node Properties</h3>
          <div class="form-group"><label>Name</label><input type="text" v-model="selectedNode.name" @change="updateClip" /></div>
          <div class="form-group"><label><input type="checkbox" v-model="selectedNode.is_game_over" @change="updateClip" /> Game Over / Ending</label></div>
          <h4 class="mt-4">Outgoing Connections</h4>
          <div v-for="edge in outgoingEdges" :key="edge.id" class="connection-item"><span>→ {{ getEdgeTarget(edge)?.name }}</span><button class="btn-icon" @click="deleteEdge(edge)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
          <button class="btn btn-secondary w-full mt-4" @click="addNewConnection">Add Connection</button>
        </div>
      </div>
    </div>
  `,
  setup() {
    const showToast = inject('showToast')
    const canvasArea = ref(null)
    const clips = ref([]), edges = ref([]), selectedNode = ref(null), selectedEdge = ref(null), drawingEdge = ref(null), dragOffset = ref({ x: 0, y: 0 })
    const outgoingEdges = computed(() => selectedNode.value ? edges.value.filter(e => e.from_id === selectedNode.value.id) : [])
    const getNodeClass = (clip) => clip.is_game_over ? 'game-over' : clip.is_event_clip ? 'event' : 'scene'
    const getEdgePath = (edge) => { const from = clips.value.find(c => c.id === edge.from_id), to = clips.value.find(c => c.id === edge.to_id); if (!from || !to) return ''; const x1 = (from.x||100)+120, y1 = (from.y||100)+50, x2 = to.x||100, y2 = to.y||100+50, cx = (x1+x2)/2; return 'M ' + x1 + ' ' + y1 + ' C ' + cx + ' ' + y1 + ', ' + cx + ' ' + y2 + ', ' + x2 + ' ' + y2 }
    const getEdgeTarget = (edge) => clips.value.find(c => c.id === edge.to_id)
    const onDragStart = (e, clip) => e.dataTransfer.setData('text/plain', clip.id)
    const onNodeMouseDown = (e, node) => { if (e.target.classList.contains('port')) return; selectedNode.value = node; const rect = e.currentTarget.getBoundingClientRect(); dragOffset.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }; const onMouseMove = (e) => { if (!selectedNode.value) return; const canvasRect = canvasArea.value.getBoundingClientRect(); selectedNode.value.x = e.clientX - canvasRect.left - dragOffset.value.x; selectedNode.value.y = e.clientY - canvasRect.top - dragOffset.value.y }; const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); savePositions() }; document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp) }
    const selectNode = (node) => { selectedNode.value = node; selectedEdge.value = null }
    const selectEdge = (edge) => { selectedEdge.value = edge; selectedNode.value = null }
    const startEdgeDrag = (e, node, type) => { drawingEdge.value = { fromId: node.id, x: e.clientX, y: e.clientY }; const onMouseMove = (e) => { if (!drawingEdge.value) return; const canvasRect = canvasArea.value.getBoundingClientRect(); drawingEdge.value.x = e.clientX - canvasRect.left; drawingEdge.value.y = e.clientY - canvasRect.top }; const onMouseUp = () => { drawingEdge.value = null; document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }; document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp) }
    const onEdgeDrop = async (targetNode, type) => { if (!drawingEdge.value) return; try { await fetch('/api/save_logic_block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: 1, from_id: drawingEdge.value.fromId, to_id: targetNode.id, label: 'Continue' }) }); showToast('Connection created', 'success'); loadData() } catch (e) { showToast('Failed to create connection', 'error') } drawingEdge.value = null }
    const addNewConnection = async () => { if (!selectedNode.value) return; const toId = prompt('Enter target scene ID:'); if (!toId) return; try { await fetch('/api/save_logic_block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: 1, from_id: selectedNode.value.id, to_id: parseInt(toId), label: 'Continue' }) }); showToast('Connection created', 'success'); loadData() } catch (e) { showToast('Failed to create connection', 'error') } }
    const deleteEdge = async (edge) => { if (!confirm('Delete this connection?')) return; try { await fetch('/api/delete_logic_block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: edge.id }) }); showToast('Connection deleted', 'success'); loadData() } catch (e) { showToast('Failed to delete', 'error') } }
    const updateClip = async () => { try { await fetch('/api/clip/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selectedNode.value) }); showToast('Node updated', 'success') } catch (e) { showToast('Failed to update', 'error') } }
    const savePositions = async () => { const positions = clips.value.map(c => ({ id: c.id, x: c.x, y: c.y })); try { await fetch('/api/clip/positions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positions }) }) } catch (e) { console.error('Failed to save positions:', e) } }
    const autoLayout = () => { clips.value.forEach((clip, index) => { clip.x = 100 + (index % 4) * 200; clip.y = 100 + Math.floor(index / 4) * 150 }); savePositions(); showToast('Auto layout applied', 'success') }
    const validateStory = async () => { try { const response = await fetch('/api/story/diagnostics', { method: 'POST' }); const result = await response.json(); if (result.valid) showToast('Story is valid!', 'success'); else showToast('Issues: ' + result.issues.join(', '), 'warning') } catch (e) { showToast('Validation failed', 'error') } }
    const loadData = async () => { try { const response = await fetch('/api/story'); const data = await response.json(); clips.value = data.clips || []; edges.value = data.edges || [] } catch (e) { console.error('Failed to load data:', e) } }
    onMounted(loadData)
    return { canvasArea, clips, edges, selectedNode, selectedEdge, drawingEdge, outgoingEdges, getNodeClass, getEdgePath, getEdgeTarget, onDragStart, onNodeMouseDown, selectNode, selectEdge, startEdgeDrag, onEdgeDrop, addNewConnection, deleteEdge, updateClip, autoLayout, validateStory }
  }
}

// Event Editor View
const EventEditorView = {
  name: 'EventEditorView',
  template: `
    <div class="event-editor">
      <div class="view-header"><div><h1>Events</h1><p class="text-muted">Create interactive choice overlays and quick-time events</p></div>
        <button class="btn btn-primary" @click="showCreateModal = true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Event</button>
      </div>

      <div class="events-grid" v-if="eventClips.length > 0">
        <div v-for="clip in eventClips" :key="clip.id" class="event-card" @click="selectEvent(clip)">
          <div class="event-preview">
            <div class="choice-preview" v-if="getChoicesForEvent(clip.id).length > 0">
              <div v-for="(choice, i) in getChoicesForEvent(clip.id)" :key="i" class="choice-button">{{ choice.label || 'Choice '+(i+1) }}</div>
            </div>
            <div v-else class="empty-preview"><span>No choices defined</span></div>
          </div>
          <div class="event-info"><h3>{{ clip.name }}</h3><span class="text-muted text-sm">{{ clip.chapter_name || 'No chapter' }}</span></div>
          <div class="event-meta"><span class="badge badge-blue">{{ getChoicesForEvent(clip.id).length }} choices</span></div>
        </div>
      </div>

      <div class="empty-state" v-else><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg><h3>No event clips</h3><p>Create interactive events with choices that let viewers decide the story</p><button class="btn btn-primary btn-lg" @click="showCreateModal = true">Create Your First Event</button></div>

      <div class="modal-overlay" v-if="showCreateModal" @click.self="showCreateModal = false">
        <div class="modal" style="max-width:600px">
          <div class="modal-header"><h3>Create Event Clip</h3><button class="btn-icon" @click="showCreateModal = false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
          <div class="modal-body">
            <div class="form-group"><label>Event Name</label><input type="text" v-model="newEvent.name" placeholder="Important Decision" /></div>
            <div class="form-group"><label>Chapter Name</label><input type="text" v-model="newEvent.chapter_name" placeholder="Chapter 2" /></div>
            <div class="form-group"><label>Trigger Time (seconds)</label><input type="number" v-model.number="newEvent.trigger_time" min="0" step="0.1" /></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" @click="showCreateModal = false">Cancel</button><button class="btn btn-primary" @click="createEvent">Create Event</button></div>
        </div>
      </div>

      <div class="modal-overlay" v-if="editingEvent" @click.self="editingEvent = null">
        <div class="modal" style="max-width:700px">
          <div class="modal-header"><h3>Edit Event: {{ editingEvent.name }}</h3><button class="btn-icon" @click="editingEvent = null"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
          <div class="modal-body">
            <div class="form-group"><label>Event Name</label><input type="text" v-model="eventForm.name" /></div>
            <h4 class="mt-4 mb-3">Choices</h4>
            <div class="choices-editor">
              <div v-for="(choice, index) in eventForm.choices" :key="index" class="choice-row">
                <input type="text" v-model="choice.label" placeholder="Choice text" class="choice-input" />
                <select v-model="choice.to_id" class="choice-target"><option value="">Go to...</option><option v-for="clip in clips" :key="clip.id" :value="clip.id">{{ clip.name }}</option></select>
                <button class="btn-icon" @click="removeChoice(index)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
              <button class="btn btn-secondary" @click="addChoice">+ Add Choice</button>
            </div>
          </div>
          <div class="modal-footer"><button class="btn btn-danger" @click="deleteEvent">Delete Event</button><button class="btn btn-primary" @click="saveEvent">Save Changes</button></div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const showToast = inject('showToast')
    const clips = ref([]), edges = ref([]), eventClips = ref([]), showCreateModal = ref(false), editingEvent = ref(null)
    const newEvent = ref({ name: '', chapter_name: '', trigger_time: 5, num_choices: 2 }), eventForm = ref({ choices: [] })
    const loadData = async () => { const response = await fetch('/api/story'); const data = await response.json(); clips.value = data.clips || []; edges.value = data.edges || []; eventClips.value = clips.value.filter(c => c.is_event_clip) }
    const getChoicesForEvent = (eventId) => edges.value.filter(e => e.from_id === eventId).map(e => ({ label: e.label, to_id: e.to_id, set_var: e.set_var }))
    const selectEvent = (clip) => { const choices = getChoicesForEvent(clip.id); editingEvent.value = clip; eventForm.value = { ...clip, choices: choices.length > 0 ? choices : [{ label: '', to_id: '', set_var: '' }] } }
    const createEvent = async () => { try { const response = await fetch('/api/create_event_clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newEvent.value) }); if (response.ok) { showToast('Event created', 'success'); showCreateModal.value = false; loadData(); newEvent.value = { name: '', chapter_name: '', trigger_time: 5, num_choices: 2 } } } catch (e) { showToast('Failed to create event', 'error') } }
    const addChoice = () => eventForm.value.choices.push({ label: '', to_id: '', set_var: '' })
    const removeChoice = (index) => eventForm.value.choices.splice(index, 1)
    const saveEvent = async () => { try { await fetch('/api/clip/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventForm.value) }); for (const edge of edges.value.filter(e => e.from_id === eventForm.value.id)) { await fetch('/api/delete_logic_block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: edge.id }) }) }; for (const choice of eventForm.value.choices) { if (choice.to_id) { await fetch('/api/save_logic_block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: 1, from_id: eventForm.value.id, to_id: choice.to_id, label: choice.label, set_var: choice.set_var }) }) } }; showToast('Event saved', 'success'); editingEvent.value = null; loadData() } catch (e) { showToast('Failed to save', 'error') } }
    const deleteEvent = async () => { if (!confirm('Delete this event?')) return; try { await fetch('/api/delete_clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingEvent.value.id }) }); showToast('Event deleted', 'success'); editingEvent.value = null; loadData() } catch (e) { showToast('Failed to delete', 'error') } }
    onMounted(loadData)
    return { clips, edges, eventClips, showCreateModal, editingEvent, newEvent, eventForm, getChoicesForEvent, selectEvent, createEvent, addChoice, removeChoice, saveEvent, deleteEvent }
  }
}

// Preview View
const PreviewView = {
  name: 'PreviewView',
  template: `
    <div class="preview-view">
      <div class="view-header"><div><h1>Preview</h1><p class="text-muted">Test your interactive movie</p></div>
        <div class="header-actions"><select v-model="startScene" class="start-select"><option value="">Start from beginning</option><option v-for="clip in clips" :key="clip.id" :value="clip.id">{{ clip.name }}</option></select>
          <button class="btn btn-primary" @click="startPreview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play</button>
        </div>
      </div>

      <div class="player-container" v-if="currentClip">
        <div class="video-wrapper">
          <video ref="videoPlayer" :src="getClipSrc(currentClip)" @timeupdate="onTimeUpdate" @ended="onVideoEnded" @loadedmetadata="onVideoLoaded" autoplay></video>
          <div class="choice-overlay" v-if="showChoices"><div class="choices-container"><button v-for="(choice, index) in currentChoices" :key="index" class="choice-btn" @click="makeChoice(choice)">{{ choice.label }}</button></div></div>
          <div class="game-over-overlay" v-if="isGameOver"><h2>The End</h2><p>Thanks for watching!</p><button class="btn btn-primary" @click="restartPreview">Play Again</button></div>
        </div>
        <div class="player-controls">
          <button class="control-btn" @click="togglePlay"><svg v-if="isPlaying" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
          <div class="progress-bar" @click="seekTo"><div class="progress-fill" :style="{ width: progressPercent+'%' }"></div></div>
          <span class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
          <div class="volume-control"><button class="control-btn" @click="toggleMute"><svg v-if="isMuted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg><svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></button><input type="range" v-model="volume" min="0" max="100" @input="updateVolume" /></div>
        </div>
      </div>

      <div class="empty-state" v-else><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64"><polygon points="5 3 19 12 5 21 5 3"/></svg><h3>Ready to Preview</h3><p>Add some scenes to your project and click Play to test your interactive movie</p><button class="btn btn-primary btn-lg" @click="startPreview">Start Preview</button></div>

      <div class="variables-panel" v-if="variables && Object.keys(variables).length > 0"><h3>Variables</h3><div class="variables-list"><div v-for="(value, key) in variables" :key="key" class="variable-item"><span class="var-name">{{ key }}</span><span class="var-value">{{ value }}</span></div></div></div>
    </div>
  `,
  setup() {
    const showToast = inject('showToast')
    const clips = ref([]), edges = ref([]), videoPlayer = ref(null), startScene = ref(''), currentClip = ref(null), currentTime = ref(0), duration = ref(0), isPlaying = ref(false), isMuted = ref(false), volume = ref(80), showChoices = ref(false), isGameOver = ref(false), currentChoices = ref([]), variables = ref({}), watchedClips = ref([])
    const progressPercent = computed(() => !duration.value ? 0 : (currentTime.value / duration.value) * 100)
    const getClipSrc = (clip) => clip.filepath || '/clips/' + clip.unique_id + '.mp4'
    const loadData = async () => { const response = await fetch('/api/story'); const data = await response.json(); clips.value = data.clips || []; edges.value = data.edges || [] }
    const startPreview = async () => { isGameOver.value = false; showChoices.value = false; watchedClips.value = []; variables.value = {}; currentClip.value = startScene.value ? clips.value.find(c => c.id === startScene.value) : clips.value[0]; if (currentClip.value) { watchedClips.value.push(currentClip.value.id); setTimeout(() => { if (videoPlayer.value) { videoPlayer.value.play(); isPlaying.value = true } }, 100) } else { showToast('No scenes to play', 'warning') } }
    const restartPreview = () => startPreview()
    const onTimeUpdate = () => { if (videoPlayer.value) currentTime.value = videoPlayer.value.currentTime }
    const onVideoLoaded = () => { if (videoPlayer.value) duration.value = videoPlayer.value.duration }
    const onVideoEnded = () => { const choices = edges.value.filter(e => e.from_id === currentClip.value?.id); if (choices.length > 0) { currentChoices.value = choices; showChoices.value = true } else if (currentClip.value?.is_game_over) { isGameOver.value = true } else { const nextClip = clips.value.find(c => edges.value.some(e => e.from_id === currentClip.value.id && e.to_id === c.id)); if (nextClip) { currentClip.value = nextClip; watchedClips.value.push(nextClip.id); videoPlayer.value?.play() } } }
    const makeChoice = (choice) => { if (choice.set_var) { const [key, value] = choice.set_var.split('='); variables.value[key] = value }; const targetClip = clips.value.find(c => c.id === choice.to_id); if (targetClip) { currentClip.value = targetClip; watchedClips.value.push(targetClip.id); showChoices.value = false; videoPlayer.value?.play() } }
    const togglePlay = () => { if (videoPlayer.value) { isPlaying.value ? videoPlayer.value.pause() : videoPlayer.value.play(); isPlaying.value = !isPlaying.value } }
    const seekTo = (e) => { const rect = e.currentTarget.getBoundingClientRect(); const percent = (e.clientX - rect.left) / rect.width; if (videoPlayer.value) videoPlayer.value.currentTime = percent * duration.value }
    const toggleMute = () => { if (videoPlayer.value) { videoPlayer.value.muted = !videoPlayer.value.muted; isMuted.value = videoPlayer.value.muted } }
    const updateVolume = () => { if (videoPlayer.value) videoPlayer.value.volume = volume.value / 100 }
    const formatTime = (seconds) => { if (!seconds || isNaN(seconds)) return '0:00'; const mins = Math.floor(seconds / 60), secs = Math.floor(seconds % 60); return mins + ':' + secs.toString().padStart(2, '0') }
    onMounted(loadData)
    return { clips, edges, videoPlayer, startScene, currentClip, currentTime, duration, isPlaying, isMuted, volume, showChoices, isGameOver, currentChoices, variables, progressPercent, getClipSrc, startPreview, restartPreview, onTimeUpdate, onVideoLoaded, onVideoEnded, makeChoice, togglePlay, seekTo, toggleMute, updateVolume, formatTime }
  }
}

// Analytics View
const AnalyticsView = {
  name: 'AnalyticsView',
  template: `
    <div class="analytics-view">
      <div class="view-header"><div><h1>Analytics</h1><p class="text-muted">View viewer statistics and choice analytics</p></div>
        <div class="header-actions"><button class="btn btn-secondary" @click="resetAnalytics"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Reset</button></div>
      </div>

      <div class="stats-grid" v-if="stats">
        <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div><div class="stat-content"><span class="stat-value">{{ stats.total_views || 0 }}</span><span class="stat-label">Total Views</span></div></div>
        <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="stat-content"><span class="stat-value">{{ stats.completion_rate || 0 }}%</span><span class="stat-label">Completion Rate</span></div></div>
        <div class="stat-card"><div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="stat-content"><span class="stat-value">{{ stats.avg_duration || 0 }}</span><span class="stat-label">Avg Duration</span></div></div>
        <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div class="stat-content"><span class="stat-value">{{ stats.achievements_unlocked || 0 }}</span><span class="stat-label">Achievements</span></div></div>
      </div>

      <div class="analytics-section"><h2>Choice Distribution</h2>
        <div class="choice-stats" v-if="choiceStats.length > 0"><div v-for="stat in choiceStats" :key="stat.label" class="choice-stat"><div class="choice-info"><span class="choice-label">{{ stat.label }}</span><span class="choice-count">{{ stat.count }} selections</span></div><div class="choice-bar"><div class="choice-fill" :style="{ width: stat.percent+'%' }"></div></div><span class="choice-percent">{{ stat.percent }}%</span></div></div>
        <div class="empty-analytics" v-else><p>No choice data yet. Share your project to start collecting analytics!</p></div>
      </div>

      <div class="analytics-section"><h2>Scene Views</h2>
        <div class="scene-stats" v-if="sceneStats.length > 0"><div v-for="scene in sceneStats" :key="scene.name" class="scene-stat"><div class="scene-info"><span class="scene-name">{{ scene.name }}</span><span class="scene-count">{{ scene.count }} views</span></div><div class="scene-bar"><div class="scene-fill" :style="{ width: scene.percent+'%' }"></div></div></div></div>
        <div class="empty-analytics" v-else><p>No scene data yet.</p></div>
      </div>
    </div>
  `,
  setup() {
    const showToast = inject('showToast')
    const stats = ref(null), choiceStats = ref([]), sceneStats = ref([])
    const loadAnalytics = async () => { try { const response = await fetch('/api/analytics/summary/1'); const data = await response.json(); stats.value = { total_views: data.total_views || 0, completion_rate: Math.round((data.completion_rate || 0) * 100), avg_duration: data.avg_duration || '0:00', achievements_unlocked: data.achievements || 0 } } catch (e) { console.error('Failed to load analytics:', e) } }
    const loadChoiceStats = async () => { try { const response = await fetch('/api/analytics/1'); const data = await response.json(); const choices = data.filter(a => a.event_type === 'choice'), choiceMap = {}; choices.forEach(c => { if (!choiceMap[c.choice_label]) choiceMap[c.choice_label] = 0; choiceMap[c.choice_label]++ }); const total = choices.length; choiceStats.value = Object.entries(choiceMap).map(([label, count]) => ({ label, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 })).sort((a, b) => b.count - a.count); const scenes = data.filter(a => a.event_type === 'scene_view'), sceneMap = {}; scenes.forEach(s => { if (!sceneMap[s.target_clip_id]) sceneMap[s.target_clip_id] = 0; sceneMap[s.target_clip_id]++ }); const sceneTotal = scenes.length; sceneStats.value = Object.entries(sceneMap).map(([id, count]) => ({ name: 'Scene ' + id, count, percent: sceneTotal > 0 ? Math.round((count / sceneTotal) * 100) : 0 })).sort((a, b) => b.count - a.count).slice(0, 10) } catch (e) { console.error('Failed to load stats:', e) } }
    const resetAnalytics = async () => { if (!confirm('Reset all analytics data?')) return; try { await fetch('/api/analytics/reset', { method: 'POST' }); showToast('Analytics reset', 'success'); loadAnalytics(); loadChoiceStats() } catch (e) { showToast('Failed to reset', 'error') } }
    onMounted(() => { loadAnalytics(); loadChoiceStats() })
    return { stats, choiceStats, sceneStats, resetAnalytics }
  }
}

// Publish View
const PublishView = {
  name: 'PublishView',
  template: `
    <div class="publish-view">
      <div class="view-header"><div><h1>Publish</h1><p class="text-muted">Export your interactive movie as a standalone HTML file</p></div></div>

      <div class="publish-container">
        <div class="publish-settings">
          <div class="settings-section"><h3>Player Settings</h3>
            <div class="form-group"><label>Player Theme</label><select v-model="settings.theme"><option value="dark">Dark</option><option value="light">Light</option><option value="custom">Custom Color</option></select></div>
            <div class="form-group" v-if="settings.theme === 'custom'"><label>Theme Color</label><input type="color" v-model="settings.theme_color" /></div>
            <div class="form-group"><label><input type="checkbox" v-model="settings.smart_skip" /> Enable Smart Skip</label></div>
            <div class="form-group"><label><input type="checkbox" v-model="settings.show_progress" /> Show Progress Bar</label></div>
            <div class="form-group"><label><input type="checkbox" v-model="settings.allow_save" /> Allow Save/Resume</label></div>
          </div>
          <button class="btn btn-primary btn-lg w-full" @click="generateBuild" :disabled="isGenerating">{{ isGenerating ? 'Generating...' : 'Generate HTML' }}</button>
        </div>

        <div class="publish-preview"><h3>Preview</h3>
          <div class="preview-frame"><div class="preview-player" :style="{ background: getPreviewBg() }"><div class="preview-video"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="64" height="64"><polygon points="5 3 19 12 5 21 5 3"/></svg></div><div class="preview-controls"><div class="preview-progress"></div></div><div class="preview-choices" v-if="clips.length > 0"><div class="preview-choice">Choice 1</div><div class="preview-choice">Choice 2</div></div></div></div>
          <div class="recent-exports"><h4>Recent Exports</h4><div class="export-list" v-if="exports.length > 0"><div v-for="exp in exports" :key="exp.id" class="export-item"><div class="export-info"><span class="export-name">{{ exp.filename }}</span><span class="export-date text-muted text-sm">{{ formatDate(exp.created_at) }}</span></div><div class="export-actions"><button class="btn btn-sm btn-secondary" @click="previewExport(exp)">Preview</button></div></div></div><div class="empty-exports" v-else><p>No exports yet</p></div></div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const showToast = inject('showToast')
    const clips = ref([]), exports = ref([]), isGenerating = ref(false), latestExport = ref(null)
    const settings = ref({ theme: 'dark', theme_color: '#4a9eff', smart_skip: true, show_progress: true, allow_save: true, show_achievements: true, start_scene: '', intro_duration: 3 })
    const loadData = async () => { const [storyRes, exportsRes] = await Promise.all([fetch('/api/story'), fetch('/api/exports')]); const storyData = await storyRes.json(); clips.value = storyData.clips || []; exports.value = await exportsRes.json() }
    const generateBuild = async () => { if (clips.value.length === 0) { showToast('No scenes to publish', 'warning'); return } isGenerating.value = true; try { const response = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings.value) }); if (response.ok) { const data = await response.json(); latestExport.value = data; showToast('Build generated!', 'success'); loadData() } else { showToast('Failed to generate build', 'error') } } catch (e) { showToast('Error generating build', 'error') } isGenerating.value = false }
    const previewExport = (exp) => window.open('/exports/' + exp.filename, '_blank')
    const getPreviewBg = () => settings.value.theme === 'custom' ? settings.value.theme_color : settings.value.theme === 'light' ? '#ffffff' : '#1a1a2e'
    const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    onMounted(loadData)
    return { clips, exports, isGenerating, settings, generateBuild, previewExport, getPreviewBg, formatDate }
  }
}
