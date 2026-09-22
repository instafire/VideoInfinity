<template>
  <div class="branch-editor">
    <!-- Header -->
    <div class="view-header">
      <div>
        <h1>Branches</h1>
        <p>Visual story flow editor - connect your scenes with choices</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="autoLayout">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 12h8"/>
            <path d="M12 8v8"/>
          </svg>
          Auto Layout
        </button>
        <button class="btn btn-primary" @click="validateStory">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          Validate
        </button>
      </div>
    </div>

    <div class="editor-container">
      <!-- Node Palette -->
      <div class="node-palette">
        <h3>Scenes</h3>
        <div class="palette-nodes">
          <div
            v-for="clip in clips"
            :key="clip.id"
            class="palette-node"
            :class="getNodeClass(clip)"
            draggable="true"
            @dragstart="onDragStart($event, clip)"
          >
            <div class="node-indicator"></div>
            <span>{{ clip.name }}</span>
          </div>
        </div>
      </div>

      <!-- Canvas -->
      <div class="canvas-area" ref="canvasArea">
        <svg class="connections-layer">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#4a9eff" />
            </marker>
            <marker id="arrowhead-return" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
            </marker>
          </defs>
          <path
            v-for="edge in edges"
            :key="edge.id"
            :d="getEdgePath(edge)"
            fill="none"
            :stroke="edge.return_to_main ? '#ef4444' : '#f97316'"
            stroke-width="2"
            :stroke-dasharray="edge.return_to_main ? '8,4' : 'none'"
            :marker-end="edge.return_to_main ? 'url(#arrowhead-return)' : 'url(#arrowhead)'"
            @click="selectEdge(edge)"
            class="connection-line"
            :class="{ 'is-return': edge.return_to_main }"
          />
          <!-- Edge Labels -->
          <g v-for="edge in edges" :key="'label-' + edge.id">
            <text
              v-if="edge.label"
              :x="getEdgeLabelPosition(edge).x"
              :y="getEdgeLabelPosition(edge).y"
              class="edge-label"
              :fill="edge.return_to_main ? '#ef4444' : '#fdba74'"
            >
              {{ edge.label }}{{ edge.return_to_main ? ' ↩' : '' }}
            </text>
          </g>
          <path
            v-if="drawingEdge"
            :d="drawingEdgePath"
            fill="none"
            stroke="#22d3ee"
            stroke-width="2"
            stroke-dasharray="5,5"
          />
        </svg>

        <div
          v-for="clip in clips"
          :key="'node-' + clip.id"
          class="graph-node"
          :class="{
            selected: selectedNode?.id === clip.id,
            'game-over': clip.is_game_over,
            'event-node': clip.is_event_clip
          }"
          :style="{ left: (clip.x || 100) + 'px', top: (clip.y || 100) + 'px' }"
          @mousedown="onNodeMouseDown($event, clip)"
          @click="selectNode(clip)"
        >
          <div class="node-thumb-container" v-if="clip.thumbnail">
            <img :src="clip.thumbnail" class="node-thumb" />
            <div class="play-icon-overlay">
              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          </div>
          <div class="node-thumb-placeholder" v-else>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <div class="node-header">
            <span class="node-type">{{ clip.is_game_over ? 'END' : clip.is_event_clip ? 'EVENT' : 'SCENE' }}</span>
          </div>
          <div class="node-content">
            <h4>{{ clip.name }}</h4>
            <p v-if="clip.chapter_name">{{ clip.chapter_name }}</p>
          </div>
          <div class="node-ports">
            <div class="port port-output" @mousedown.stop="startEdgeDrag($event, clip, 'output')"></div>
            <div class="port port-input" @mouseup.stop="onEdgeDrop(clip, 'input')"></div>
          </div>
        </div>

        <!-- Empty State -->
        <div class="canvas-empty" v-if="clips.length === 0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
            <line x1="6" y1="3" x2="6" y2="15"/>
            <circle cx="18" cy="6" r="3"/>
            <circle cx="6" cy="18" r="3"/>
            <path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
          <h3>No scenes to connect</h3>
          <p>Create scenes first to build your story flow</p>
        </div>
      </div>

      <!-- Properties Panel -->
      <div class="properties-panel" v-if="selectedNode">
        <h3>Node Properties</h3>
        <div class="form-group">
          <label>Name</label>
          <input type="text" v-model="selectedNode.name" @change="updateClip" />
        </div>
        <div class="form-group">
          <label>Chapter</label>
          <input type="text" v-model="selectedNode.chapter_name" @change="updateClip" />
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" v-model="selectedNode.is_game_over" @change="updateClip" />
            Game Over / Ending
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" v-model="selectedNode.is_event_clip" @change="updateClip" />
            Is Event Clip
          </label>
        </div>

        <!-- Connections -->
        <h4 class="mt-4">Outgoing Connections</h4>
        <div class="connections-list">
          <div v-for="edge in outgoingEdges" :key="edge.id" class="connection-item">
            <span>→ {{ getEdgeTarget(edge)?.name }}</span>
            <button class="btn-icon" @click="deleteEdge(edge)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div v-if="outgoingEdges.length === 0" class="text-muted text-sm">
            No connections yet
          </div>
        </div>

        <button class="btn btn-secondary w-full mt-4" @click="addNewConnection">
          Add Connection
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'

export default {
  name: 'BranchEditorView',
  setup() {
    const showToast = inject('showToast')
    const canvasArea = ref(null)

    const clips = ref([])
    const edges = ref([])
    const selectedNode = ref(null)
    const selectedEdge = ref(null)
    const drawingEdge = ref(null)
    const dragOffset = ref({ x: 0, y: 0 })

    const outgoingEdges = computed(() => {
      if (!selectedNode.value) return []
      return edges.value.filter(e => e.from_id === selectedNode.value.id)
    })

    const getNodeClass = (clip) => {
      if (clip.is_game_over) return 'game-over'
      if (clip.is_event_clip) return 'event'
      return 'scene'
    }

    const getEdgePath = (edge) => {
      const from = clips.value.find(c => c.id === edge.from_id)
      const to = clips.value.find(c => c.id === edge.to_id)
      if (!from || !to) return ''

      const x1 = (from.x || 100) + 120
      const y1 = (from.y || 100) + 50
      const x2 = to.x || 100
      const y2 = to.y || 100 + 50

      const cx = (x1 + x2) / 2

      return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
    }

    const getEdgeLabelPosition = (edge) => {
      const from = clips.value.find(c => c.id === edge.from_id)
      const to = clips.value.find(c => c.id === edge.to_id)
      if (!from || !to) return { x: 0, y: 0 }

      const x1 = (from.x || 100) + 120
      const y1 = (from.y || 100) + 50
      const x2 = to.x || 100
      const y2 = to.y || 100 + 50

      return {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2 - 10
      }
    }

    const drawingEdgePath = computed(() => {
      if (!drawingEdge.value) return ''
      const from = clips.value.find(c => c.id === drawingEdge.value.fromId)
      if (!from) return ''

      const x1 = (from.x || 100) + 120
      const y1 = (from.y || 100) + 50
      const x2 = drawingEdge.value.x
      const y2 = drawingEdge.value.y

      const cx = (x1 + x2) / 2

      return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
    })

    const getEdgeTarget = (edge) => {
      return clips.value.find(c => c.id === edge.to_id)
    }

    const onDragStart = (e, clip) => {
      e.dataTransfer.setData('text/plain', clip.id)
    }

    const onNodeMouseDown = (e, node) => {
      if (e.target.classList.contains('port')) return

      selectedNode.value = node
      const rect = e.currentTarget.getBoundingClientRect()
      dragOffset.value = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }

      const onMouseMove = (e) => {
        if (!selectedNode.value) return
        const canvasRect = canvasArea.value.getBoundingClientRect()
        selectedNode.value.x = e.clientX - canvasRect.left - dragOffset.value.x
        selectedNode.value.y = e.clientY - canvasRect.top - dragOffset.value.y
      }

      const onMouseUp = async () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        await savePositions()
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }

    const selectNode = (node) => {
      selectedNode.value = node
      selectedEdge.value = null
    }

    const selectEdge = (edge) => {
      selectedEdge.value = edge
      selectedNode.value = null
    }

    const startEdgeDrag = (e, node, type) => {
      drawingEdge.value = {
        fromId: node.id,
        x: e.clientX,
        y: e.clientY
      }

      const onMouseMove = (e) => {
        if (!drawingEdge.value) return
        const canvasRect = canvasArea.value.getBoundingClientRect()
        drawingEdge.value.x = e.clientX - canvasRect.left
        drawingEdge.value.y = e.clientY - canvasRect.top
      }

      const onMouseUp = () => {
        drawingEdge.value = null
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }

    const onEdgeDrop = async (targetNode, type) => {
      if (!drawingEdge.value) return

      try {
        await fetch('/api/save_logic_block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: 1,
            from_id: drawingEdge.value.fromId,
            to_id: targetNode.id,
            label: 'Continue'
          })
        })
        showToast('Connection created', 'success')
        loadData()
      } catch (e) {
        showToast('Failed to create connection', 'error')
      }

      drawingEdge.value = null
    }

    const addNewConnection = async () => {
      if (!selectedNode.value) return

      const toId = prompt('Enter target scene ID:')
      if (!toId) return

      try {
        await fetch('/api/save_logic_block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: 1,
            from_id: selectedNode.value.id,
            to_id: parseInt(toId),
            label: 'Continue'
          })
        })
        showToast('Connection created', 'success')
        loadData()
      } catch (e) {
        showToast('Failed to create connection', 'error')
      }
    }

    const deleteEdge = async (edge) => {
      if (!confirm('Delete this connection?')) return

      try {
        await fetch('/api/delete_logic_block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: edge.id })
        })
        showToast('Connection deleted', 'success')
        loadData()
      } catch (e) {
        showToast('Failed to delete', 'error')
      }
    }

    const updateClip = async () => {
      try {
        await fetch('/api/clip/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selectedNode.value)
        })
        showToast('Node updated', 'success')
      } catch (e) {
        showToast('Failed to update', 'error')
      }
    }

    const savePositions = async () => {
      const positions = clips.value.map(c => ({
        id: c.id,
        x: c.x,
        y: c.y
      }))

      try {
        await fetch('/api/clip/positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positions })
        })
      } catch (e) {
        console.error('Failed to save positions:', e)
      }
    }

    const autoLayout = () => {
      clips.value.forEach((clip, index) => {
        clip.x = 100 + (index % 4) * 200
        clip.y = 100 + Math.floor(index / 4) * 150
      })
      savePositions()
      showToast('Auto layout applied', 'success')
    }

    const validateStory = async () => {
      try {
        const response = await fetch('/api/story/diagnostics', {
          method: 'POST'
        })
        const result = await response.json()
        if (result.valid) {
          showToast('Story is valid!', 'success')
        } else {
          showToast('Issues: ' + result.issues.join(', '), 'warning')
        }
      } catch (e) {
        showToast('Validation failed', 'error')
      }
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

    onMounted(loadData)

    return {
      canvasArea,
      clips,
      edges,
      selectedNode,
      selectedEdge,
      drawingEdge,
      outgoingEdges,
      getNodeClass,
      getEdgePath,
      getEdgeLabelPosition,
      drawingEdgePath,
      getEdgeTarget,
      onDragStart,
      onNodeMouseDown,
      selectNode,
      selectEdge,
      startEdgeDrag,
      onEdgeDrop,
      addNewConnection,
      deleteEdge,
      updateClip,
      autoLayout,
      validateStory
    }
  }
}
</script>

<style scoped>
.branch-editor {
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

.editor-container {
  flex: 1;
  display: flex;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.node-palette {
  width: 200px;
  border-right: 1px solid var(--border-color);
  padding: 16px;
  overflow-y: auto;
}

.node-palette h3 {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.palette-nodes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.palette-node {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  cursor: grab;
  font-size: 13px;
}

.palette-node .node-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3b82f6;
}

.palette-node.game-over .node-indicator {
  background: #ef4444;
}

.palette-node.event .node-indicator {
  background: #a855f7;
}

.canvas-area {
  flex: 1;
  position: relative;
  overflow: auto;
  background:
    radial-gradient(circle at 1px 1px, var(--border-color) 1px, transparent 0);
  background-size: 24px 24px;
}

.connections-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 2000px;
  height: 2000px;
  pointer-events: none;
}

.graph-node {
  position: absolute;
  width: 180px;
  background: var(--bg-tertiary);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  cursor: move;
  transition: border-color 0.15s, box-shadow 0.15s;
  overflow: hidden;
}

.node-thumb-container {
  position: relative;
  width: 100%;
  height: 80px;
  background: #000;
  overflow: hidden;
}

.node-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.play-icon-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  opacity: 0.7;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
}

.node-thumb-placeholder {
  width: 100%;
  height: 80px;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.graph-node:hover {
  border-color: var(--border-light);
}

.graph-node.selected {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 4px rgba(74, 158, 255, 0.2);
}

.graph-node.game-over {
  border-color: #ef4444;
}

.graph-node.event-node {
  border-color: #a855f7;
}

.node-header {
  padding: 8px 12px;
  background: var(--bg-hover);
  border-radius: 10px 10px 0 0;
}

.node-type {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
}

.node-content {
  padding: 12px;
}

.node-content h4 {
  font-size: 14px;
  margin-bottom: 4px;
}

.node-content p {
  font-size: 12px;
  color: var(--text-muted);
}

.node-ports {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  display: flex;
  justify-content: space-between;
  padding: 0 -8px;
  pointer-events: none;
}

.port {
  width: 16px;
  height: 16px;
  background: var(--accent-blue);
  border: 3px solid var(--bg-secondary);
  border-radius: 50%;
  cursor: crosshair;
  pointer-events: all;
  transition: transform 0.15s;
}

.port:hover {
  transform: scale(1.3);
}

.port-output {
  margin-left: -8px;
}

.port-input {
  margin-right: -8px;
}

.canvas-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--text-muted);
}

.canvas-empty svg {
  margin-bottom: 16px;
}

.canvas-empty h3 {
  margin-bottom: 8px;
}

.properties-panel {
  width: 280px;
  border-left: 1px solid var(--border-color);
  padding: 16px;
  overflow-y: auto;
}

.properties-panel h3 {
  font-size: 14px;
  margin-bottom: 16px;
}

.properties-panel h4 {
  font-size: 13px;
  margin-bottom: 12px;
  color: var(--text-secondary);
}

.connections-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.connection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  font-size: 13px;
}

.connection-line.is-return {
  stroke-dasharray: 8, 4;
}

.edge-label {
  font-size: 10px;
  font-weight: bold;
  text-anchor: middle;
  pointer-events: none;
  background: rgba(15, 23, 42, 0.8);
  padding: 2px 8px;
  border-radius: 10px;
}
</style>
