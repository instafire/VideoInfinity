<template>
  <div class="app-layout" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1.5"/>
            <path d="M16 2v4a2 2 0 0 0 2 2h4"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
            <path d="M12 13v6"/>
          </svg>
          <span class="logo-text" v-if="!sidebarCollapsed">VideoStudio</span>
        </div>
        <button class="btn-icon sidebar-toggle" @click="sidebarCollapsed = !sidebarCollapsed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M3 12h18M3 6h18M3 18h18" v-if="!sidebarCollapsed"/>
            <path d="M9 18l6-6-6-6" v-else/>
          </svg>
        </button>
      </div>

      <nav class="sidebar-nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: $route.path === item.path }"
        >
          <div class="nav-icon" v-html="item.icon"></div>
          <span class="nav-label" v-if="!sidebarCollapsed">{{ item.label }}</span>
          <span class="nav-shortcut" v-if="!sidebarCollapsed">{{ item.shortcut }}</span>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <div class="project-info" v-if="currentProject">
          <div class="project-badge" :style="{ background: currentProject.theme_color || '#4a9eff' }"></div>
          <span class="project-name" v-if="!sidebarCollapsed">{{ currentProject.title }}</span>
        </div>
        <div class="no-project" v-else v-if="!sidebarCollapsed">
          <span>No project selected</span>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Top Bar -->
      <header class="topbar">
        <div class="topbar-left">
          <div class="breadcrumb">
            <span class="breadcrumb-item">{{ currentViewTitle }}</span>
          </div>
        </div>

        <div class="topbar-center">
          <div class="search-box" v-if="showSearch">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text" placeholder="Search..." v-model="searchQuery" />
          </div>
        </div>

        <div class="topbar-right">
          <button class="btn-icon" title="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
          </button>
          <button class="btn-icon" title="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- Page Content -->
      <div class="page-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>

    <!-- Toast Container -->
    <div class="toast-container">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="'toast-' + toast.type"
      >
        <span>{{ toast.message }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, provide } from 'vue'
import { useRoute } from 'vue-router'

export default {
  name: 'App',
  setup() {
    const route = useRoute()
    const sidebarCollapsed = ref(false)
    const searchQuery = ref('')
    const currentProject = ref(null)
    const toasts = ref([])

    const navItems = [
      {
        path: '/',
        label: 'Dashboard',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
        shortcut: '1'
      },
      {
        path: '/media',
        label: 'Media Library',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        shortcut: '2'
      },
      {
        path: '/scenes',
        label: 'Scenes',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 7h12"/><path d="M6 12h12"/><path d="M6 17h8"/><circle cx="4" cy="7" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="4" cy="17" r="2"/></svg>',
        shortcut: '3'
      },
      {
        path: '/timeline',
        label: 'Timeline',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><rect x="6" y="4" width="4" height="4" rx="1"/><rect x="14" y="10" width="4" height="4" rx="1"/></svg>',
        shortcut: '4'
      },
      {
        path: '/branches',
        label: 'Branches',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
        shortcut: '5'
      },
      {
        path: '/events',
        label: 'Events',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg>',
        shortcut: '6'
      },
      {
        path: '/preview',
        label: 'Preview',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
        shortcut: '7'
      },
      {
        path: '/analytics',
        label: 'Analytics',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        shortcut: '8'
      },
      {
        path: '/publish',
        label: 'Publish',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        shortcut: '9'
      }
    ]

    const viewTitles = {
      '/': 'Dashboard',
      '/media': 'Media Library',
      '/scenes': 'Scenes',
      '/timeline': 'Timeline',
      '/branches': 'Branches',
      '/events': 'Events',
      '/preview': 'Preview',
      '/analytics': 'Analytics',
      '/publish': 'Publish'
    }

    const currentViewTitle = computed(() => viewTitles[route.path] || 'VideoStudio')

    const showSearch = computed(() => ['/', '/media', '/scenes', '/analytics'].includes(route.path))

    // Provide toast functions to child components
    const showToast = (message, type = 'info') => {
      const id = Date.now()
      toasts.value.push({ id, message, type })
      setTimeout(() => {
        toasts.value = toasts.value.filter(t => t.id !== id)
      }, 3000)
    }

    provide('showToast', showToast)
    provide('currentProject', currentProject)

    // Load current project on mount
    onMounted(async () => {
      try {
        const response = await fetch('/api/projects')
        const projects = await response.json()
        if (projects.length > 0) {
          currentProject.value = projects[0]
        }
      } catch (e) {
        console.error('Failed to load projects:', e)
      }

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
        const num = parseInt(e.key)
        if (num >= 1 && num <= 9) {
          const path = navItems[num - 1]?.path
          if (path) window.location.hash = path
        }
      })
    })

    return {
      sidebarCollapsed,
      searchQuery,
      currentProject,
      toasts,
      navItems,
      currentViewTitle,
      showSearch
    }
  }
}
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  background: var(--bg-primary);
}

/* Sidebar */
.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  z-index: 100;
}

.sidebar-collapsed .sidebar {
  width: var(--sidebar-collapsed);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--accent-blue);
}

.logo svg {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.sidebar-toggle {
  background: transparent;
  color: var(--text-muted);
}

.sidebar-toggle:hover {
  color: var(--text-primary);
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  color: var(--text-secondary);
  border-radius: 10px;
  text-decoration: none;
  transition: all 0.15s;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: rgba(74, 158, 255, 0.1);
  color: var(--accent-blue);
}

.nav-item.active .nav-icon {
  color: var(--accent-blue);
}

.nav-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.nav-label {
  flex: 1;
  font-weight: 500;
}

.nav-shortcut {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-active);
  padding: 2px 6px;
  border-radius: 4px;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--border-color);
}

.project-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-badge {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.project-name {
  font-weight: 500;
  color: var(--text-primary);
}

.no-project {
  font-size: 13px;
  color: var(--text-muted);
}

/* Main Content */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Topbar */
.topbar {
  height: var(--topbar-height);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.breadcrumb {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.topbar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  max-width: 400px;
  margin: 0 20px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 14px;
  width: 100%;
}

.search-box svg {
  color: var(--text-muted);
  flex-shrink: 0;
}

.search-box input {
  flex: 1;
  background: transparent;
  border: none;
  padding: 0;
  font-size: 14px;
}

.search-box input:focus {
  box-shadow: none;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Page Content */
.page-content {
  flex: 1;
  overflow: auto;
  padding: 24px;
}

/* Page Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    transform: translateX(-100%);
  }

  .sidebar-collapsed .sidebar {
    transform: translateX(0);
    width: var(--sidebar-width);
  }
}
</style>
