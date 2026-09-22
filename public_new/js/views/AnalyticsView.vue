<template>
  <div class="analytics-view">
    <!-- Header -->
    <div class="view-header">
      <div>
        <h1>Analytics</h1>
        <p>View viewer statistics and choice analytics</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="resetAnalytics">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          Reset
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid" v-if="stats">
      <div class="stat-card">
        <div class="stat-icon blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.total_views || 0 }}</span>
          <span class="stat-label">Total Views</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.completion_rate || 0 }}%</span>
          <span class="stat-label">Completion Rate</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon purple">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.avg_duration || 0 }}</span>
          <span class="stat-label">Avg Duration</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon orange">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.achievements_unlocked || 0 }}</span>
          <span class="stat-label">Achievements</span>
        </div>
      </div>
    </div>

    <!-- Choice Analytics -->
    <div class="analytics-section">
      <h2>Choice Distribution</h2>
      <div class="choice-stats" v-if="choiceStats.length > 0">
        <div v-for="stat in choiceStats" :key="stat.label" class="choice-stat">
          <div class="choice-info">
            <span class="choice-label">{{ stat.label }}</span>
            <span class="choice-count">{{ stat.count }} selections</span>
          </div>
          <div class="choice-bar">
            <div
              class="choice-fill"
              :style="{ width: stat.percent + '%' }"
            ></div>
          </div>
          <span class="choice-percent">{{ stat.percent }}%</span>
        </div>
      </div>
      <div class="empty-analytics" v-else>
        <p>No choice data yet. Share your project to start collecting analytics!</p>
      </div>
    </div>

    <!-- Scene Views -->
    <div class="analytics-section">
      <h2>Scene Views</h2>
      <div class="scene-stats" v-if="sceneStats.length > 0">
        <div v-for="scene in sceneStats" :key="scene.name" class="scene-stat">
          <div class="scene-info">
            <span class="scene-name">{{ scene.name }}</span>
            <span class="scene-count">{{ scene.count }} views</span>
          </div>
          <div class="scene-bar">
            <div
              class="scene-fill"
              :style="{ width: scene.percent + '%' }"
            ></div>
          </div>
        </div>
      </div>
      <div class="empty-analytics" v-else>
        <p>No scene data yet.</p>
      </div>
    </div>

    <!-- Endings -->
    <div class="analytics-section">
      <h2>Endings Reached</h2>
      <div class="ending-stats" v-if="endingStats.length > 0">
        <div v-for="ending in endingStats" :key="ending.name" class="ending-stat">
          <div class="ending-info">
            <span class="ending-badge">END</span>
            <span class="ending-name">{{ ending.name }}</span>
          </div>
          <span class="ending-count">{{ ending.count }} times</span>
        </div>
      </div>
      <div class="empty-analytics" v-else>
        <p>No endings reached yet.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, inject } from 'vue'

export default {
  name: 'AnalyticsView',
  setup() {
    const showToast = inject('showToast')

    const stats = ref(null)
    const choiceStats = ref([])
    const sceneStats = ref([])
    const endingStats = ref([])

    const loadAnalytics = async () => {
      try {
        const response = await fetch('/api/analytics/summary/1')
        const data = await response.json()

        stats.value = {
          total_views: data.total_views || 0,
          completion_rate: Math.round((data.completion_rate || 0) * 100),
          avg_duration: data.avg_duration || '0:00',
          achievements_unlocked: data.achievements || 0
        }
      } catch (e) {
        console.error('Failed to load analytics:', e)
      }
    }

    const loadChoiceStats = async () => {
      try {
        const response = await fetch('/api/analytics/1')
        const data = await response.json()

        // Process choice data
        const choices = data.filter(a => a.event_type === 'choice')
        const choiceMap = {}

        choices.forEach(c => {
          if (!choiceMap[c.choice_label]) {
            choiceMap[c.choice_label] = 0
          }
          choiceMap[c.choice_label]++
        })

        const total = choices.length
        choiceStats.value = Object.entries(choiceMap)
          .map(([label, count]) => ({
            label,
            count,
            percent: total > 0 ? Math.round((count / total) * 100) : 0
          }))
          .sort((a, b) => b.count - a.count)

        // Process scene views
        const scenes = data.filter(a => a.event_type === 'scene_view')
        const sceneMap = {}

        scenes.forEach(s => {
          if (!sceneMap[s.target_clip_id]) {
            sceneMap[s.target_clip_id] = 0
          }
          sceneMap[s.target_clip_id]++
        })

        const sceneTotal = scenes.length
        sceneStats.value = Object.entries(sceneMap)
          .map(([id, count]) => ({
            name: `Scene ${id}`,
            count,
            percent: sceneTotal > 0 ? Math.round((count / sceneTotal) * 100) : 0
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)

        // Process endings
        const endings = data.filter(a => a.event_type === 'ending')
        endingStats.value = endings.reduce((acc, e) => {
          const existing = acc.find(x => x.name === e.choice_label)
          if (existing) {
            existing.count++
          } else {
            acc.push({ name: e.choice_label || 'Unknown', count: 1 })
          }
          return acc
        }, []).sort((a, b) => b.count - a.count)
      } catch (e) {
        console.error('Failed to load stats:', e)
      }
    }

    const resetAnalytics = async () => {
      if (!confirm('Reset all analytics data? This cannot be undone.')) return

      try {
        await fetch('/api/analytics/reset', { method: 'POST' })
        showToast('Analytics reset', 'success')
        loadAnalytics()
        loadChoiceStats()
      } catch (e) {
        showToast('Failed to reset', 'error')
      }
    }

    onMounted(() => {
      loadAnalytics()
      loadChoiceStats()
    })

    return {
      stats,
      choiceStats,
      sceneStats,
      endingStats,
      resetAnalytics
    }
  }
}
</script>

<style scoped>
.analytics-view {
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon.blue {
  background: rgba(74, 158, 255, 0.15);
  color: var(--accent-blue);
}

.stat-icon.green {
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent-green);
}

.stat-icon.purple {
  background: rgba(168, 85, 247, 0.15);
  color: var(--accent-purple);
}

.stat-icon.orange {
  background: rgba(249, 115, 22, 0.15);
  color: var(--accent-orange);
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 13px;
  color: var(--text-muted);
}

.analytics-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
}

.analytics-section h2 {
  font-size: 16px;
  margin-bottom: 20px;
}

.choice-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.choice-stat {
  display: flex;
  align-items: center;
  gap: 16px;
}

.choice-info {
  width: 200px;
  display: flex;
  flex-direction: column;
}

.choice-label {
  font-weight: 500;
}

.choice-count {
  font-size: 12px;
  color: var(--text-muted);
}

.choice-bar {
  flex: 1;
  height: 24px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  overflow: hidden;
}

.choice-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple));
  border-radius: 6px;
  transition: width 0.5s ease;
}

.choice-percent {
  width: 50px;
  text-align: right;
  font-weight: 600;
  color: var(--accent-blue);
}

.scene-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scene-stat {
  display: flex;
  align-items: center;
  gap: 16px;
}

.scene-info {
  width: 200px;
  display: flex;
  flex-direction: column;
}

.scene-name {
  font-weight: 500;
}

.scene-count {
  font-size: 12px;
  color: var(--text-muted);
}

.scene-bar {
  flex: 1;
  height: 16px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.scene-fill {
  height: 100%;
  background: var(--accent-green);
  border-radius: 4px;
}

.ending-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ending-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.ending-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ending-badge {
  background: var(--accent-red);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.ending-name {
  font-weight: 500;
}

.ending-count {
  color: var(--text-muted);
}

.empty-analytics {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}
</style>
