<template>
  <div class="dashboard">
    <!-- Header -->
    <div class="dashboard-header">
      <div>
        <h1>My Projects</h1>
        <p>Create and manage your interactive video projects</p>
      </div>
      <button class="btn btn-primary" @click="showNewProjectModal = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        New Project
      </button>
    </div>

    <!-- Project Grid -->
    <div class="project-grid" v-if="projects.length > 0">
      <div
        v-for="project in projects"
        :key="project.id"
        class="project-card card card-hover"
        @click="selectProject(project)"
      >
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
        <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1.5"/>
        <path d="M16 2v4a2 2 0 0 0 2 2h4"/>
        <path d="M10 11v6"/>
        <path d="M14 11v6"/>
        <path d="M12 13v6"/>
      </svg>
      <h3>No projects yet</h3>
      <p>Create your first interactive video project to get started</p>
      <button class="btn btn-primary btn-lg" @click="showNewProjectModal = true">
        Create Your First Project
      </button>
    </div>

    <!-- New Project Modal -->
    <div class="modal-overlay" v-if="showNewProjectModal" @click.self="showNewProjectModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editingProject ? 'Edit Project' : 'New Project' }}</h3>
          <button class="btn-icon" @click="showNewProjectModal = false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Project Title</label>
            <input
              type="text"
              v-model="projectForm.title"
              placeholder="My Interactive Movie"
              @keyup.enter="saveProject"
            />
          </div>
          <div class="form-group">
            <label>Theme Color</label>
            <div class="color-options">
              <button
                v-for="color in themeColors"
                :key="color"
                class="color-option"
                :class="{ active: projectForm.theme_color === color }"
                :style="{ background: color }"
                @click="projectForm.theme_color = color"
              ></button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showNewProjectModal = false">Cancel</button>
          <button class="btn btn-primary" @click="saveProject" :disabled="!projectForm.title.trim()">
            {{ editingProject ? 'Save Changes' : 'Create Project' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div class="modal-overlay" v-if="showDeleteModal" @click.self="showDeleteModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Delete Project</h3>
          <button class="btn-icon" @click="showDeleteModal = false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
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
</template>

<script>
import { ref, onMounted, inject } from 'vue'
import { useRouter } from 'vue-router'

export default {
  name: 'DashboardView',
  setup() {
    const router = useRouter()
    const showToast = inject('showToast')

    const projects = ref([])
    const showNewProjectModal = ref(false)
    const showDeleteModal = ref(false)
    const editingProject = ref(null)
    const projectToDelete = ref(null)

    const projectForm = ref({
      title: '',
      theme_color: '#4a9eff'
    })

    const themeColors = [
      '#4a9eff', '#22d3ee', '#a855f7', '#22c55e',
      '#f97316', '#ef4444', '#ec4899', '#8b5cf6'
    ]

    const loadProjects = async () => {
      try {
        const response = await fetch('/api/projects')
        projects.value = await response.json()
      } catch (e) {
        console.error('Failed to load projects:', e)
        showToast('Failed to load projects', 'error')
      }
    }

    const selectProject = (project) => {
      window.location.hash = '/media'
    }

    const editProject = (project) => {
      editingProject.value = project
      projectForm.value = {
        title: project.title,
        theme_color: project.theme_color || '#4a9eff'
      }
      showNewProjectModal.value = true
    }

    const confirmDelete = (project) => {
      projectToDelete.value = project
      showDeleteModal.value = true
    }

    const saveProject = async () => {
      if (!projectForm.value.title.trim()) return

      try {
        const method = editingProject.value ? 'PUT' : 'POST'
        const url = editingProject.value ? `/api/projects/${editingProject.value.id}` : '/api/projects'

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(projectForm.value)
        })

        if (response.ok) {
          showToast(editingProject.value ? 'Project updated' : 'Project created', 'success')
          showNewProjectModal.value = false
          loadProjects()
          resetForm()
        }
      } catch (e) {
        console.error('Failed to save project:', e)
        showToast('Failed to save project', 'error')
      }
    }

    const deleteProject = async () => {
      try {
        await fetch(`/api/projects/${projectToDelete.value.id}`, { method: 'DELETE' })
        showToast('Project deleted', 'success')
        showDeleteModal.value = false
        loadProjects()
      } catch (e) {
        console.error('Failed to delete project:', e)
        showToast('Failed to delete project', 'error')
      }
    }

    const resetForm = () => {
      editingProject.value = null
      projectForm.value = { title: '', theme_color: '#4a9eff' }
    }

    const formatDate = (dateStr) => {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    }

    onMounted(loadProjects)

    return {
      projects,
      showNewProjectModal,
      showDeleteModal,
      editingProject,
      projectToDelete,
      projectForm,
      themeColors,
      selectProject,
      editProject,
      confirmDelete,
      saveProject,
      deleteProject,
      formatDate
    }
  }
}
</script>

<style scoped>
.dashboard {
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.dashboard-header h1 {
  margin-bottom: 4px;
}

.dashboard-header p {
  color: var(--text-muted);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.project-card {
  position: relative;
  padding: 0;
  overflow: hidden;
}

.project-thumbnail {
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
}

.project-info {
  padding: 16px;
}

.project-info h3 {
  margin-bottom: 4px;
  font-size: 16px;
}

.project-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.project-card:hover .project-actions {
  opacity: 1;
}

.project-actions .btn-icon {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.project-actions .btn-icon:hover {
  color: var(--text-primary);
}

.color-options {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.color-option {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 3px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.active {
  border-color: var(--text-primary);
}
</style>
