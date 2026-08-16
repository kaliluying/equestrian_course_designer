<template>
  <div
    ref="canvasContainerRef"
    class="course-canvas course-canvas-v2"
    data-render-version="v2"
    @drop="handleDrop"
    @dragover.prevent
  >
    <svg
      ref="svgRef"
      class="canvas-svg"
      :viewBox="`0 0 ${fieldWidth} ${fieldHeight}`"
      preserveAspectRatio="xMidYMid meet"
      @pointerdown="handleCanvasPointerDown"
    >
      <defs>
        <pattern id="grid-pattern-v2" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" class="grid-line" />
        </pattern>
      </defs>

      <rect x="0" y="0" :width="fieldWidth" :height="fieldHeight" class="field-bg" />
      <rect x="0" y="0" :width="fieldWidth" :height="fieldHeight" fill="url(#grid-pattern-v2)" />

      <g v-if="courseStore.coursePath.visible" class="course-path-layer">
        <path
          v-if="pathData"
          :d="pathData"
          class="course-path-line"
          fill="none"
          stroke="var(--primary-color)"
          stroke-width="0.2"
          stroke-dasharray="0.5,0.5"
        />

        <template v-if="showDistanceLabels">
          <g v-for="label in distanceLabels" :key="label.id" class="distance-label">
            <g
              :transform="`translate(${label.position.x} ${label.position.y}) rotate(${adjustLabelAngle(label.angle)})`"
            >
              <rect x="-1.35" y="-0.52" width="2.7" height="1.04" rx="0.18" class="distance-label-bg" />
              <text x="0" y="0.16" class="distance-label-text">{{ label.text }}m</text>
            </g>
          </g>
        </template>

        <g
          class="path-marker start-marker"
          :transform="pathMarkerTransform(courseStore.startPoint)"
          @pointerdown.stop.prevent="startDraggingPathPoint('start', $event)"
        >
          <line :x1="-PATH_MARKER_HALF_LENGTH" y1="0" :x2="PATH_MARKER_HALF_LENGTH" y2="0" />
          <polygon
            :points="`${PATH_MARKER_HALF_LENGTH},0 ${PATH_MARKER_HALF_LENGTH - 0.45},-0.22 ${PATH_MARKER_HALF_LENGTH - 0.45},0.22`"
          />
          <circle
            class="v2-control rotate-handle"
            :cx="PATH_MARKER_HALF_LENGTH + 0.55"
            cy="-0.55"
            r="0.35"
            @pointerdown.stop.prevent="startRotatingPathPoint('start', $event)"
          />
        </g>

        <g
          class="path-marker end-marker"
          :transform="pathMarkerTransform(courseStore.endPoint)"
          @pointerdown.stop.prevent="startDraggingPathPoint('end', $event)"
        >
          <line :x1="-PATH_MARKER_HALF_LENGTH" y1="0" :x2="PATH_MARKER_HALF_LENGTH" y2="0" />
          <polygon
            :points="`${PATH_MARKER_HALF_LENGTH},0 ${PATH_MARKER_HALF_LENGTH - 0.45},-0.22 ${PATH_MARKER_HALF_LENGTH - 0.45},0.22`"
          />
          <circle
            class="v2-control rotate-handle"
            :cx="PATH_MARKER_HALF_LENGTH + 0.55"
            cy="-0.55"
            r="0.35"
            @pointerdown.stop.prevent="startRotatingPathPoint('end', $event)"
          />
        </g>

        <template v-if="showHelpers">
          <g v-for="(point, index) in courseStore.coursePath.points" :key="`control-${index}`">
            <circle
              v-if="point.controlPoint1"
              class="v2-control control-point"
              :cx="point.controlPoint1.x"
              :cy="point.controlPoint1.y"
              r="0.3"
              @pointerdown.stop.prevent="startDraggingControlPoint(index, 1)"
            />
            <circle
              v-if="point.controlPoint2"
              class="v2-control control-point"
              :cx="point.controlPoint2.x"
              :cy="point.controlPoint2.y"
              r="0.3"
              @pointerdown.stop.prevent="startDraggingControlPoint(index, 2)"
            />
          </g>
        </template>
      </g>

      <g
        v-for="obstacle in courseStore.currentCourse.obstacles"
        :key="obstacle.id"
        :data-obstacle-id="obstacle.id"
        class="obstacle-group"
        :class="{ selected: isObstacleSelected(obstacle.id) }"
        :transform="obstacleTransform(obstacle)"
        @pointerdown.stop.prevent="startDraggingObstacle($event, obstacle)"
      >
        <template v-if="obstacle.type === ObstacleType.WALL">
          <rect
            x="0"
            y="0"
            :width="obstacle.wallProperties?.width || 0"
            :height="obstacle.wallProperties?.height || 0"
            :fill="obstacle.wallProperties?.color || '#8B4513'"
            rx="0.1"
          />
        </template>

        <template v-else-if="obstacle.type === ObstacleType.WATER">
          <rect
            x="0"
            y="0"
            :width="obstacle.waterProperties?.width || 0"
            :height="obstacle.waterProperties?.depth || 0"
            :fill="obstacle.waterProperties?.color || 'rgba(0,100,255,0.35)'"
            :stroke="obstacle.waterProperties?.borderColor || 'rgba(0,50,150,0.6)'"
            :stroke-width="Math.max((obstacle.waterProperties?.borderWidth || 0.1) * 0.5, 0.02)"
            rx="0.1"
          />
        </template>

        <template v-else-if="obstacle.type === ObstacleType.DECORATION">
          <circle
            v-if="obstacle.decorationProperties?.category === DecorationCategory.TREE"
            :cx="(obstacle.decorationProperties?.width || 2) / 2"
            :cy="(obstacle.decorationProperties?.height || 2) / 2"
            :r="Math.min(obstacle.decorationProperties?.width || 2, obstacle.decorationProperties?.height || 2) / 2"
            :fill="obstacle.decorationProperties?.secondaryColor || '#4CAF50'"
          />
          <rect
            v-else
            x="0"
            y="0"
            :width="obstacle.decorationProperties?.width || 2"
            :height="obstacle.decorationProperties?.height || 2"
            :fill="obstacle.decorationProperties?.color || '#8B4513'"
            rx="0.1"
          />
        </template>

        <template v-else-if="obstacle.type === ObstacleType.LIVERPOOL">
          <rect
            v-if="obstacle.liverpoolProperties?.hasRail"
            x="0"
            y="0"
            :width="obstacle.poles[0]?.width || obstacle.liverpoolProperties?.width || 0"
            :height="obstacle.poles[0]?.height || 0.5"
            :fill="obstacle.poles[0]?.color || '#8B4513'"
            rx="0.05"
          />
          <rect
            x="0"
            :y="obstacle.liverpoolProperties?.hasRail ? (obstacle.poles[0]?.height || 0.5) + 0.1 : 0"
            :width="obstacle.liverpoolProperties?.width || obstacle.poles[0]?.width || 0"
            :height="obstacle.liverpoolProperties?.waterDepth || 0.3"
            :fill="obstacle.liverpoolProperties?.waterColor || 'rgba(0,100,255,0.35)'"
            rx="0.1"
          />
        </template>

        <template v-else>
          <rect
            v-for="(pole, index) in obstacle.poles"
            :key="`${obstacle.id}-${index}`"
            x="0"
            :y="poleY(obstacle, index)"
            :width="pole.width || 0"
            :height="pole.height || 0"
            :fill="pole.color || '#8B4513'"
            rx="0.05"
          />
        </template>

        <!-- 方向箭头：垂直穿过障碍物，从上到下（马的行进方向） -->
        <g
          v-if="obstacle.type !== ObstacleType.DECORATION ||
            (obstacle.type === ObstacleType.DECORATION && obstacle.decorationProperties?.showDirectionArrow)"
          class="direction-arrow-group"
        >
          <!-- 箭头线 -->
          <line
            :x1="getObstacleMetrics(obstacle).width / 2"
            :y1="getObstacleMetrics(obstacle).height / 2 - 3"
            :x2="getObstacleMetrics(obstacle).width / 2"
            :y2="getObstacleMetrics(obstacle).height / 2 + 2.5"
            class="direction-arrow-line"
          />
          <!-- 箭头头部（三角形，尖端朝下） -->
          <polygon
            :points="`
              ${getObstacleMetrics(obstacle).width / 2 - 0.4},${getObstacleMetrics(obstacle).height / 2 + 2.5}
              ${getObstacleMetrics(obstacle).width / 2 + 0.4},${getObstacleMetrics(obstacle).height / 2 + 2.5}
              ${getObstacleMetrics(obstacle).width / 2},${getObstacleMetrics(obstacle).height / 2 + 3.2}
            `"
            class="direction-arrow-head"
          />
        </g>

        <rect
          v-if="isObstacleSelected(obstacle.id)"
          class="selection-outline"
          x="-0.15"
          y="-0.15"
          :width="getObstacleMetrics(obstacle).width + 0.3"
          :height="getObstacleMetrics(obstacle).height + 0.3"
          fill="none"
        />

        <!-- 障碍物编号：圆形背景 + 数字 -->
        <g 
          v-if="obstacle.number" 
          class="obstacle-number-group"
          style="cursor: move; pointer-events: all;"
          @pointerdown.stop.prevent="startDraggingNumber($event, obstacle)"
        >
          <g :transform="`translate(${getObstacleNumberPosition(obstacle).x}, ${getObstacleNumberPosition(obstacle).y})`">
            <circle
              cx="0"
              cy="0"
              r="0.55"
              class="obstacle-number-bg"
            />
            <text
              class="obstacle-number"
              x="0"
              y="0.2"
            >
              {{ obstacle.number }}
            </text>
          </g>
        </g>

        <circle
          v-if="selectedObstacleId === obstacle.id"
          class="v2-control rotate-handle"
          :cx="getObstacleMetrics(obstacle).width + 0.55"
          cy="-0.55"
          r="0.35"
          @pointerdown.stop.prevent="startRotatingObstacle($event, obstacle)"
        />
      </g>

      <rect
        v-if="selectionRect"
        class="selection-box"
        :x="selectionRect.x"
        :y="selectionRect.y"
        :width="selectionRect.width"
        :height="selectionRect.height"
      />
    </svg>

    <!-- 统一画布信息胶囊 (Glass Capsule HUD) -->
    <div class="canvas-hud">
      <div class="hud-item field-dimensions">
        场地: {{ fieldWidth }}m × {{ fieldHeight }}m
      </div>
      
      <div class="hud-divider"></div>
      
      <div class="hud-item scale-indicator">
        <div class="line" />
        <span>5m</span>
      </div>

      <template v-if="courseStore.coursePath.visible && showDistanceLabels && totalDistanceValue > 0">
        <div class="hud-divider"></div>
        <div class="hud-item total-distance">
          总距: {{ totalDistanceText }}m
        </div>
      </template>

      <template v-if="courseStore.coursePath.visible">
        <div class="hud-divider"></div>
        <div class="hud-item path-tools">
          <button type="button" class="path-tool-btn" @click="toggleDistanceLabels">
            {{ showDistanceLabels ? '隐藏距离' : '显示距离' }}
          </button>
          <button type="button" class="path-tool-btn danger" @click="clearPath">
            删路线
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { throttle } from 'lodash'
import { useCourseStore } from '@/stores/course'
import { useHistoryStore } from '@/stores/history'
import { useCanvasSelection } from '@/composables/useCanvasSelection'
import { useCanvasDragState } from '@/composables/useCanvasDragState'
import { usePathEditingState } from '@/composables/usePathEditingState'
import { useObstacleStore } from '@/stores/obstacle'
import { useUserStore } from '@/stores/user'
import { ConnectionStatus, useWebSocketStore } from '@/stores/websocket'
import { DecorationCategory, ObstacleType } from '@/types/obstacle'
import type { CustomObstacleTemplate, Obstacle } from '@/types/obstacle'

const PATH_MARKER_HALF_LENGTH = 3

const courseStore = useCourseStore()
const historyStore = useHistoryStore()
const webSocketStore = useWebSocketStore()
const userStore = useUserStore()
const obstacleStore = useObstacleStore()

const canvasContainerRef = ref<HTMLElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)

const PASTE_OFFSET_METERS = 1.5
const CURVE_LENGTH_SAMPLE_STEPS = 24

const {
  selectedObstacleId,
  selectedObstacleIds,
  isObstacleSelected,
  setSelectedObstacleIds,
} = useCanvasSelection(courseStore)
const showHelpers = ref(true)
const showDistanceLabels = ref(true)
const isPathUpdateFromWebSocket = ref(false)
const copiedObstacles = ref<Obstacle[]>([])
const pasteCount = ref(0)

const {
  draggingObstacles,
  draggingNumber,
  rotatingObstacle,
  selectingState,
} = useCanvasDragState()

const {
  draggingPathPoint,
  rotatingPathPoint,
  draggingControlPoint,
} = usePathEditingState()

const fieldWidth = computed(() => courseStore.currentCourse.fieldWidth)
const fieldHeight = computed(() => courseStore.currentCourse.fieldHeight)
const isCollaborating = computed(
  () =>
    webSocketStore.isCollaborating &&
    webSocketStore.connectionStatus === ConnectionStatus.CONNECTED
)

const pathData = computed(() => {
  const points = courseStore.coursePath.points
  if (points.length < 2) return ''

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]
    const current = points[i]
    if (previous.controlPoint2 && current.controlPoint1) {
      d += ` C ${previous.controlPoint2.x} ${previous.controlPoint2.y}, ${current.controlPoint1.x} ${current.controlPoint1.y}, ${current.x} ${current.y}`
    } else {
      d += ` L ${current.x} ${current.y}`
    }
  }
  return d
})

const selectionRect = computed(() => {
  if (!selectingState.value) return null
  const start = selectingState.value.start
  const end = selectingState.value.end
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
})

const formatDistance = (value: number) => (Math.round(value * 10) / 10).toFixed(1)

const cubicBezierPoint = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
) => {
  const mt = 1 - t
  const mt2 = mt * mt
  const t2 = t * t
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y
  }
}

const cubicBezierDerivative = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
) => {
  const mt = 1 - t
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
  }
}

const cubicBezierLength = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
) => {
  let length = 0
  let previous = p0
  for (let i = 1; i <= CURVE_LENGTH_SAMPLE_STEPS; i++) {
    const t = i / CURVE_LENGTH_SAMPLE_STEPS
    const current = cubicBezierPoint(p0, p1, p2, p3, t)
    length += Math.hypot(current.x - previous.x, current.y - previous.y)
    previous = current
  }
  return length
}

const distanceLabels = computed(() => {
  const points = courseStore.coursePath.points
  if (!courseStore.coursePath.visible || points.length < 2) return []

  const labels: Array<{
    id: string
    text: string
    position: { x: number; y: number }
    angle: number
    length: number
  }> = []

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]
    const current = points[i]
    if (previous.controlPoint2 && current.controlPoint1) {
      const cp1 = previous.controlPoint2
      const cp2 = current.controlPoint1
      const length = cubicBezierLength(previous, cp1, cp2, current)
      const midpoint = cubicBezierPoint(previous, cp1, cp2, current, 0.5)
      const tangent = cubicBezierDerivative(previous, cp1, cp2, current, 0.5)
      labels.push({
        id: `curve-${i}`,
        text: formatDistance(length),
        position: midpoint,
        angle: (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI,
        length
      })
    } else {
      const dx = current.x - previous.x
      const dy = current.y - previous.y
      const length = Math.hypot(dx, dy)
      labels.push({
        id: `line-${i}`,
        text: formatDistance(length),
        position: { x: previous.x + dx / 2, y: previous.y + dy / 2 },
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        length
      })
    }
  }

  return labels
})

const totalDistanceValue = computed(() =>
  distanceLabels.value.reduce((total, item) => total + item.length, 0)
)
const totalDistanceText = computed(() => formatDistance(totalDistanceValue.value))

const adjustLabelAngle = (angle: number) => {
  let normalized = ((angle % 360) + 360) % 360
  if (normalized > 180) normalized -= 360
  if (normalized > 90) normalized -= 180
  if (normalized < -90) normalized += 180
  return normalized
}

watch(
  () => [courseStore.currentCourse.fieldWidth, courseStore.currentCourse.fieldHeight, courseStore.currentCourse.renderVersion],
  () => {
    if (courseStore.currentCourse.renderVersion === 'v2') {
      courseStore.currentCourse.field = {
        widthMeters: courseStore.currentCourse.fieldWidth,
        heightMeters: courseStore.currentCourse.fieldHeight
      }
    }
  },
  { immediate: true }
)

watch(
  () => courseStore.currentCourse.obstacles.map((obstacle) => obstacle.id),
  () => {
    if (!selectedObstacleIds.value.length) return
    setSelectedObstacleIds(selectedObstacleIds.value)
  }
)

const normalizeRotation = (rotation: number) => {
  let value = rotation % 360
  if (value < 0) value += 360
  return value
}

const clampToField = (point: { x: number; y: number }) => ({
  x: Math.max(0, Math.min(point.x, fieldWidth.value)),
  y: Math.max(0, Math.min(point.y, fieldHeight.value))
})

const screenToWorld = (clientX: number, clientY: number) => {
  const svg = svgRef.value
  if (!svg) return null
  const ctm = svg.getScreenCTM()
  if (!ctm) return null

  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  return point.matrixTransform(ctm.inverse())
}

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const getSelectedObstacles = () =>
  selectedObstacleIds.value
    .map((id) => courseStore.currentCourse.obstacles.find((obstacle) => obstacle.id === id) || null)
    .filter((item): item is Obstacle => Boolean(item))

const rotatePoint = (
  point: { x: number; y: number },
  center: { x: number; y: number },
  angleInDegrees: number
) => {
  const rad = (angleInDegrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  }
}

const obstacleBounds = (obstacle: Obstacle) => {
  const metrics = getObstacleMetrics(obstacle)
  const center = {
    x: obstacle.position.x + metrics.width / 2,
    y: obstacle.position.y + metrics.height / 2
  }
  const corners = [
    { x: obstacle.position.x, y: obstacle.position.y },
    { x: obstacle.position.x + metrics.width, y: obstacle.position.y },
    { x: obstacle.position.x + metrics.width, y: obstacle.position.y + metrics.height },
    { x: obstacle.position.x, y: obstacle.position.y + metrics.height }
  ].map((corner) => rotatePoint(corner, center, obstacle.rotation))

  return {
    left: Math.min(...corners.map((corner) => corner.x)),
    right: Math.max(...corners.map((corner) => corner.x)),
    top: Math.min(...corners.map((corner) => corner.y)),
    bottom: Math.max(...corners.map((corner) => corner.y))
  }
}

const intersects = (
  rectA: { left: number; right: number; top: number; bottom: number },
  rectB: { left: number; right: number; top: number; bottom: number }
) =>
  !(
    rectA.right < rectB.left ||
    rectA.left > rectB.right ||
    rectA.bottom < rectB.top ||
    rectA.top > rectB.bottom
  )

const applySelectionRect = () => {
  if (!selectionRect.value || !selectingState.value) return
  const rect = selectionRect.value
  const selectionBox = {
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
    bottom: rect.y + rect.height
  }
  const hitIds = courseStore.currentCourse.obstacles
    .filter((obstacle) => intersects(obstacleBounds(obstacle), selectionBox))
    .map((obstacle) => obstacle.id)

  if (selectingState.value.additive) {
    setSelectedObstacleIds([...selectingState.value.baseSelectedIds, ...hitIds])
  } else {
    setSelectedObstacleIds(hitIds)
  }
}

const getObstacleMetrics = (obstacle: Obstacle) => {
  if (obstacle.type === ObstacleType.WALL) {
    return {
      width: obstacle.wallProperties?.width || 3.5,
      height: obstacle.wallProperties?.height || 1.5
    }
  }

  if (obstacle.type === ObstacleType.WATER) {
    return {
      width: obstacle.waterProperties?.width || 3.5,
      height: obstacle.waterProperties?.depth || 2
    }
  }

  if (obstacle.type === ObstacleType.DECORATION) {
    return {
      width: obstacle.decorationProperties?.width || 2,
      height: obstacle.decorationProperties?.height || 2
    }
  }

  if (obstacle.type === ObstacleType.LIVERPOOL) {
    const railHeight = obstacle.liverpoolProperties?.hasRail ? (obstacle.poles[0]?.height || 0.5) + 0.1 : 0
    return {
      width: obstacle.liverpoolProperties?.width || obstacle.poles[0]?.width || 3.5,
      height: railHeight + (obstacle.liverpoolProperties?.waterDepth || 0.3)
    }
  }

  const width = obstacle.poles.reduce((max, pole) => Math.max(max, pole.width || 0), 3.5)
  const height = obstacle.poles.reduce((sum, pole) => sum + (pole.height || 0) + (pole.spacing || 0), 0.5)
  return { width, height }
}

const poleY = (obstacle: Obstacle, poleIndex: number) => {
  return obstacle.poles.slice(0, poleIndex).reduce((sum, pole) => {
    return sum + (pole.height || 0) + (pole.spacing || 0)
  }, 0)
}

const obstacleTransform = (obstacle: Obstacle) => {
  const metrics = getObstacleMetrics(obstacle)
  const centerX = metrics.width / 2
  const centerY = metrics.height / 2
  return `translate(${obstacle.position.x} ${obstacle.position.y}) rotate(${obstacle.rotation} ${centerX} ${centerY})`
}

const pathMarkerTransform = (point: { x: number; y: number; rotation: number }) => {
  return `translate(${point.x} ${point.y}) rotate(${point.rotation})`
}

const sendPathUpdateIfNeeded = () => {
  if (!isCollaborating.value) return

  webSocketStore.sendPathUpdate(courseStore.currentCourse.id, {
    visible: courseStore.coursePath.visible,
    points: courseStore.coursePath.points,
    startPoint: courseStore.startPoint,
    endPoint: courseStore.endPoint
  })
}

const selectObstacle = (obstacle: Obstacle | null, multiSelect = false) => {
  if (!obstacle) {
    setSelectedObstacleIds([])
    return
  }

  if (multiSelect) {
    if (isObstacleSelected(obstacle.id)) {
      setSelectedObstacleIds(selectedObstacleIds.value.filter((id) => id !== obstacle.id))
    } else {
      setSelectedObstacleIds([...selectedObstacleIds.value, obstacle.id])
    }
    return
  }

  setSelectedObstacleIds([obstacle.id])
}

const getObstacleNumberPosition = (obstacle: Obstacle) => {
  if (draggingNumber.value?.id === obstacle.id && draggingNumber.value.currentPosition) {
    return draggingNumber.value.currentPosition
  }
  if (obstacle.numberPosition) {
    return obstacle.numberPosition
  }
  const metrics = getObstacleMetrics(obstacle)
  return { x: metrics.width / 2, y: -0.8 }
}

const startDraggingNumber = (event: PointerEvent, obstacle: Obstacle) => {
  if (event.button !== 0) return
  const world = screenToWorld(event.clientX, event.clientY)
  if (!world) return
  
  draggingNumber.value = {
    id: obstacle.id,
    pointerStart: { x: world.x, y: world.y },
    startPosition: { ...getObstacleNumberPosition(obstacle) }
  }
  
  if (!isObstacleSelected(obstacle.id)) {
    setSelectedObstacleIds([obstacle.id])
  }
  
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
}

const startDraggingObstacle = (event: PointerEvent, obstacle: Obstacle) => {
  if (event.ctrlKey || event.metaKey) {
    selectObstacle(obstacle, true)
    return
  }

  const world = screenToWorld(event.clientX, event.clientY)
  if (!world) return

  if (!isObstacleSelected(obstacle.id)) {
    setSelectedObstacleIds([obstacle.id])
  }

  const selectedObstacles = getSelectedObstacles()
  const startPositions = selectedObstacles.reduce(
    (result, item) => ({
      ...result,
      [item.id]: { x: item.position.x, y: item.position.y }
    }),
    {} as Record<string, { x: number; y: number }>
  )

  draggingObstacles.value = {
    ids: selectedObstacles.map((item) => item.id),
    pointerStart: { x: world.x, y: world.y },
    startPositions
  }

  selectObstacle(obstacle)
}

const startRotatingObstacle = (event: PointerEvent, obstacle: Obstacle) => {
  const world = screenToWorld(event.clientX, event.clientY)
  if (!world) return

  const metrics = getObstacleMetrics(obstacle)
  const center = {
    x: obstacle.position.x + metrics.width / 2,
    y: obstacle.position.y + metrics.height / 2
  }
  const startAngle = (Math.atan2(world.y - center.y, world.x - center.x) * 180) / Math.PI

  rotatingObstacle.value = {
    id: obstacle.id,
    center,
    startAngle,
    startRotation: obstacle.rotation
  }
  selectObstacle(obstacle)
}

const startDraggingPathPoint = (pointType: 'start' | 'end', event: PointerEvent) => {
  const world = screenToWorld(event.clientX, event.clientY)
  if (!world) return

  const target = pointType === 'start' ? courseStore.startPoint : courseStore.endPoint
  draggingPathPoint.value = {
    pointType,
    offsetX: world.x - target.x,
    offsetY: world.y - target.y
  }
}

const startRotatingPathPoint = (pointType: 'start' | 'end', event: PointerEvent) => {
  const world = screenToWorld(event.clientX, event.clientY)
  if (!world) return

  const target = pointType === 'start' ? courseStore.startPoint : courseStore.endPoint
  const startAngle = (Math.atan2(world.y - target.y, world.x - target.x) * 180) / Math.PI

  rotatingPathPoint.value = {
    pointType,
    startAngle,
    startRotation: target.rotation
  }
}

const startDraggingControlPoint = (
  pointIndex: number,
  controlPointNumber: 1 | 2,
) => {
  draggingControlPoint.value = {
    pointIndex,
    controlPointNumber
  }
}

const throttledSendObstacleUpdate = throttle((id: string, updates: Partial<Obstacle>) => {
  if (isCollaborating.value) {
    webSocketStore.sendObstacleUpdate(id, updates)
  }
}, 50)

const handlePointerMove = (event: PointerEvent) => {
  const world = screenToWorld(event.clientX, event.clientY)
  if (!world) return

  if (selectingState.value) {
    selectingState.value.end = clampToField({ x: world.x, y: world.y })
    return
  }

  if (draggingObstacles.value) {
    const deltaX = world.x - draggingObstacles.value.pointerStart.x
    const deltaY = world.y - draggingObstacles.value.pointerStart.y

    draggingObstacles.value.ids.forEach((id) => {
      const startPosition = draggingObstacles.value?.startPositions[id]
      if (!startPosition) return
      const obstacle = courseStore.currentCourse.obstacles.find((item) => item.id === id)
      if (!obstacle) return

      const position = clampToField({
        x: startPosition.x + deltaX,
        y: startPosition.y + deltaY
      })
      
      // Save local position for pointer up
      if (!draggingObstacles.value!.currentPositions) {
        draggingObstacles.value!.currentPositions = {}
      }
      draggingObstacles.value!.currentPositions[id] = position

      const el = document.querySelector(`[data-obstacle-id="${id}"]`)
      if (el) {
        const metrics = getObstacleMetrics(obstacle)
        const centerX = metrics.width / 2
        const centerY = metrics.height / 2
        el.setAttribute('transform', `translate(${position.x} ${position.y}) rotate(${obstacle.rotation} ${centerX} ${centerY})`)
      }

      throttledSendObstacleUpdate(obstacle.id, { position })
    })
    return
  }

  if (rotatingObstacle.value) {
    const obstacle = courseStore.currentCourse.obstacles.find((item) => item.id === rotatingObstacle.value?.id)
    if (!obstacle) return

    const currentAngle =
      (Math.atan2(world.y - rotatingObstacle.value.center.y, world.x - rotatingObstacle.value.center.x) * 180) /
      Math.PI
    const delta = currentAngle - rotatingObstacle.value.startAngle
    const rotation = normalizeRotation(rotatingObstacle.value.startRotation + delta)

    rotatingObstacle.value.currentRotation = rotation

    const el = document.querySelector(`[data-obstacle-id="${obstacle.id}"]`)
    if (el) {
      const metrics = getObstacleMetrics(obstacle)
      const centerX = metrics.width / 2
      const centerY = metrics.height / 2
      el.setAttribute('transform', `translate(${obstacle.position.x} ${obstacle.position.y}) rotate(${rotation} ${centerX} ${centerY})`)
    }

    throttledSendObstacleUpdate(obstacle.id, { rotation })
    return
  }

  if (draggingPathPoint.value) {
    const nextPoint = clampToField({
      x: world.x - draggingPathPoint.value.offsetX,
      y: world.y - draggingPathPoint.value.offsetY
    })

    if (draggingPathPoint.value.pointType === 'start') {
      courseStore.updateStartPoint(nextPoint)
    } else {
      courseStore.updateEndPoint(nextPoint)
    }
    sendPathUpdateIfNeeded()
    return
  }

  if (rotatingPathPoint.value) {
    const target = rotatingPathPoint.value.pointType === 'start' ? courseStore.startPoint : courseStore.endPoint
    const currentAngle = (Math.atan2(world.y - target.y, world.x - target.x) * 180) / Math.PI
    const delta = currentAngle - rotatingPathPoint.value.startAngle
    const rotation = normalizeRotation(rotatingPathPoint.value.startRotation + delta)

    if (rotatingPathPoint.value.pointType === 'start') {
      courseStore.updateStartRotation(rotation)
    } else {
      courseStore.updateEndRotation(rotation)
    }
    sendPathUpdateIfNeeded()
    return
  }

  if (draggingControlPoint.value) {
    const nextPoint = clampToField({ x: world.x, y: world.y })
    courseStore.updateControlPoint(
      draggingControlPoint.value.pointIndex,
      draggingControlPoint.value.controlPointNumber,
      nextPoint
    )
    sendPathUpdateIfNeeded()
  }

  if (draggingNumber.value) {
    const obstacle = courseStore.currentCourse.obstacles.find(o => o.id === draggingNumber.value!.id)
    if (obstacle) {
      const deltaX = world.x - draggingNumber.value.pointerStart.x
      const deltaY = world.y - draggingNumber.value.pointerStart.y
      
      const rad = (-obstacle.rotation * Math.PI) / 180
      const localDeltaX = deltaX * Math.cos(rad) - deltaY * Math.sin(rad)
      const localDeltaY = deltaX * Math.sin(rad) + deltaY * Math.cos(rad)
      
      draggingNumber.value.currentPosition = {
        x: draggingNumber.value.startPosition.x + localDeltaX,
        y: draggingNumber.value.startPosition.y + localDeltaY
      }
    }
    return
  }
}

const handlePointerUp = () => {
  if (selectingState.value) {
    applySelectionRect()
    selectingState.value = null
  }

  // Commit drag changes to store
  let hasChanges = false
  if (draggingObstacles.value?.currentPositions) {
    Object.entries(draggingObstacles.value.currentPositions).forEach(([id, position]) => {
      courseStore.updateObstacle(id, { position })
      if (isCollaborating.value) {
        webSocketStore.sendObstacleUpdate(id, { position })
      }
      hasChanges = true
    })
  }

  // Commit rotation changes to store
  if (rotatingObstacle.value?.currentRotation !== undefined) {
    courseStore.updateObstacle(rotatingObstacle.value.id, { rotation: rotatingObstacle.value.currentRotation })
    if (isCollaborating.value) {
      webSocketStore.sendObstacleUpdate(rotatingObstacle.value.id, { rotation: rotatingObstacle.value.currentRotation })
    }
    hasChanges = true
  }

  if (draggingNumber.value && draggingNumber.value.currentPosition) {
    courseStore.updateObstacle(draggingNumber.value.id, {
      numberPosition: draggingNumber.value.currentPosition
    })
    if (isCollaborating.value) {
      webSocketStore.sendObstacleUpdate(draggingNumber.value.id, {
        numberPosition: draggingNumber.value.currentPosition
      })
    }
    hasChanges = true
  }

  if (draggingPathPoint.value || rotatingPathPoint.value || draggingControlPoint.value) {
    hasChanges = true
  }

  if (hasChanges) {
    courseStore.commitHistory()
  }

  draggingObstacles.value = null
  rotatingObstacle.value = null
  draggingPathPoint.value = null
  rotatingPathPoint.value = null
  draggingControlPoint.value = null
  draggingNumber.value = null
}

const createBuiltInObstacle = (
  obstacleType: ObstacleType | string,
  position: { x: number; y: number }
): Omit<Obstacle, 'id'> => {
  const obstacle: Omit<Obstacle, 'id'> = {
    type: obstacleType as ObstacleType,
    position,
    rotation: 0,
    poles: []
  }

  switch (obstacleType) {
    case ObstacleType.SINGLE:
    case 'SINGLE':
      obstacle.poles = [{ height: 0.5, width: 3.5, color: '#8B4513' }]
      break
    case ObstacleType.DOUBLE:
    case 'DOUBLE':
      obstacle.poles = [
        { height: 0.5, width: 3.5, color: '#8B4513', spacing: 0.5 },
        { height: 0.5, width: 3.5, color: '#8B4513', spacing: 0 }
      ]
      break
    case ObstacleType.COMBINATION:
    case 'COMBINATION':
      obstacle.poles = [
        { height: 0.5, width: 3.5, color: '#8B4513', spacing: 0.5 },
        { height: 0.5, width: 3.5, color: '#8B4513', spacing: 0.5 },
        { height: 0.5, width: 3.5, color: '#8B4513', spacing: 0 }
      ]
      break
    case ObstacleType.WALL:
    case 'WALL':
      obstacle.type = ObstacleType.WALL
      obstacle.wallProperties = { height: 1.5, width: 3.5, color: '#8B4513' }
      break
    case ObstacleType.LIVERPOOL:
    case 'LIVERPOOL':
      obstacle.type = ObstacleType.LIVERPOOL
      obstacle.liverpoolProperties = {
        height: 0.5,
        width: 3.5,
        waterDepth: 0.3,
        waterColor: 'rgba(0, 100, 255, 0.3)',
        hasRail: true,
        railHeight: 0.2
      }
      obstacle.poles = [{ height: 0.5, width: 3.5, color: '#8B4513' }]
      break
    case ObstacleType.WATER:
    case 'WATER':
      obstacle.type = ObstacleType.WATER
      obstacle.waterProperties = {
        width: 3.5,
        depth: 2.0,
        color: 'rgba(0, 100, 255, 0.4)',
        borderColor: 'rgba(0, 50, 150, 0.5)',
        borderWidth: 0.1
      }
      break
    case ObstacleType.DECORATION:
    case 'DECORATION':
      obstacle.type = ObstacleType.DECORATION
      obstacle.decorationProperties = {
        category: DecorationCategory.TABLE,
        width: 4,
        height: 3,
        color: '#8B4513',
        borderColor: '#593b22',
        borderWidth: 2,
        text: '裁判桌',
        textColor: '#ffffff'
      }
      break
    default:
      obstacle.type = ObstacleType.SINGLE
      obstacle.poles = [{ height: 0.5, width: 3.5, color: '#8B4513' }]
      break
  }

  return obstacle
}

const createObstacleFromTemplate = (
  template: CustomObstacleTemplate,
  position: { x: number; y: number },
  fromShared: boolean
): Omit<Obstacle, 'id'> => {
  const obstacle: Omit<Obstacle, 'id'> = {
    type: fromShared ? template.baseType : ObstacleType.CUSTOM,
    position,
    rotation: 0,
    poles: JSON.parse(JSON.stringify(template.poles || [])),
    customId: fromShared ? undefined : template.id
  }

  if (template.baseType === ObstacleType.WALL && template.wallProperties) {
    obstacle.type = fromShared ? ObstacleType.WALL : ObstacleType.CUSTOM
    obstacle.wallProperties = JSON.parse(JSON.stringify(template.wallProperties))
  } else if (template.baseType === ObstacleType.LIVERPOOL && template.liverpoolProperties) {
    obstacle.type = fromShared ? ObstacleType.LIVERPOOL : ObstacleType.CUSTOM
    obstacle.liverpoolProperties = JSON.parse(JSON.stringify(template.liverpoolProperties))
  } else if (template.baseType === ObstacleType.DECORATION && template.decorationProperties) {
    obstacle.type = ObstacleType.DECORATION
    obstacle.decorationProperties = JSON.parse(JSON.stringify(template.decorationProperties))
  } else if (template.baseType === ObstacleType.WATER && template.waterProperties) {
    obstacle.type = ObstacleType.WATER
    obstacle.waterProperties = JSON.parse(JSON.stringify(template.waterProperties))
  }

  return obstacle
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  const obstacleData = event.dataTransfer?.getData('text/plain')
  if (!obstacleData) return

  const world = screenToWorld(event.clientX, event.clientY)
  if (!world) return
  const position = clampToField({ x: world.x, y: world.y })

  let newObstacle: Omit<Obstacle, 'id'> | null = null

  if (obstacleData.startsWith('CUSTOM:')) {
    const customId = obstacleData.replace('CUSTOM:', '')
    const template = obstacleStore.getObstacleById(customId)
    if (!template) return
    newObstacle = createObstacleFromTemplate(template, position, false)
  } else if (obstacleData.startsWith('SHARED:')) {
    const sharedId = obstacleData.replace('SHARED:', '')
    const template = obstacleStore.sharedObstacles.find((item) => item.id === sharedId)
    if (!template) return
    newObstacle = createObstacleFromTemplate(template, position, true)
  } else {
    newObstacle = createBuiltInObstacle(obstacleData, position)
  }

  const addedObstacle = newObstacle ? courseStore.addObstacle(newObstacle) : null
  if (!addedObstacle) return

  setSelectedObstacleIds([addedObstacle.id])
  if (isCollaborating.value) {
    webSocketStore.sendAddObstacle(addedObstacle)
  }
}

const handleGenerateCoursePath = () => {
  courseStore.generatePath()
  sendPathUpdateIfNeeded()
  courseStore.commitHistory()
}

const handleClearCanvas = () => {
  const obstacleIds = courseStore.currentCourse.obstacles.map((obstacle) => obstacle.id)
  courseStore.currentCourse.obstacles = []
  courseStore.clearPath()
  setSelectedObstacleIds([])
  courseStore.updateCourse()

  if (isCollaborating.value) {
    obstacleIds.forEach((obstacleId) => {
      webSocketStore.sendRemoveObstacle(obstacleId)
    })
    sendPathUpdateIfNeeded()
  }
}

const toggleDistanceLabels = () => {
  showDistanceLabels.value = !showDistanceLabels.value
  showHelpers.value = showDistanceLabels.value
}

const clearPath = () => {
  courseStore.clearPath()
  sendPathUpdateIfNeeded()
}

const copyObstacles = () => {
  const selected = getSelectedObstacles()
  if (!selected.length) return
  copiedObstacles.value = deepClone(selected)
}

const pasteObstacles = () => {
  if (!copiedObstacles.value.length) return

  pasteCount.value += 1
  const offset = PASTE_OFFSET_METERS * pasteCount.value
  const addedIds: string[] = []

  copiedObstacles.value.forEach((sourceObstacle) => {
    const newObstacle: Omit<Obstacle, 'id'> = {
      ...deepClone(sourceObstacle),
      position: clampToField({
        x: sourceObstacle.position.x + offset,
        y: sourceObstacle.position.y + offset
      })
    }

    const added = courseStore.addObstacle(newObstacle)
    if (!added) return
    addedIds.push(added.id)
    if (isCollaborating.value) {
      webSocketStore.sendAddObstacle(added)
    }
  })

  if (addedIds.length > 0) {
    setSelectedObstacleIds(addedIds)
  }
}

const startCollaboration = async (viaLink = false, shareToken: string | null = null) => {
  const designId = courseStore.currentCourse.id
  if (!designId) return false
  webSocketStore.connect(designId, viaLink, false, shareToken)
  return true
}

const stopCollaboration = async () => {
  webSocketStore.disconnect()
  return true
}

const isCreator = () => {
  const currentUserId = userStore.currentUser?.id
  const sessionOwnerId = webSocketStore.session?.owner
  const viaLink = webSocketStore.viaLink
  const isOwner = currentUserId && sessionOwnerId && String(currentUserId) === String(sessionOwnerId)
  return Boolean(isOwner || !viaLink)
}

const sendFullCanvasState = () => {
  if (!isCollaborating.value) return

  const syncResponse = {
    obstacles: deepClone(courseStore.currentCourse.obstacles),
    path: {
      visible: courseStore.coursePath.visible,
      points: deepClone(courseStore.coursePath.points),
      startPoint: deepClone(courseStore.startPoint),
      endPoint: deepClone(courseStore.endPoint)
    },
    renderVersion: 'v2',
    field: {
      widthMeters: fieldWidth.value,
      heightMeters: fieldHeight.value
    },
    timestamp: new Date().toISOString()
  }

  if (typeof webSocketStore.sendSyncResponse === 'function') {
    webSocketStore.sendSyncResponse(syncResponse)
  }
}

const getCanvasElement = () => canvasContainerRef.value

const getCanvasInfo = () => {
  const canvas = canvasContainerRef.value
  if (!canvas) return null

  return {
    element: canvas,
    bounds: canvas.getBoundingClientRect(),
    obstacles: courseStore.currentCourse.obstacles,
    pathData: {
      visible: courseStore.coursePath.visible,
      points: courseStore.coursePath.points,
      startPoint: courseStore.startPoint,
      endPoint: courseStore.endPoint
    },
    fieldDimensions: {
      width: courseStore.currentCourse.fieldWidth,
      height: courseStore.currentCourse.fieldHeight
    },
    scaleFactor: 1
  }
}

const prepareCanvasForExport = () => {
  const canvas = canvasContainerRef.value
  if (!canvas) return null

  const controls = canvas.querySelectorAll('.v2-control, .path-tools')
  const original: { element: HTMLElement; display: string; visibility: string }[] = []

  controls.forEach((node) => {
    const element = node as HTMLElement
    original.push({
      element,
      display: element.style.display,
      visibility: element.style.visibility
    })
    element.style.display = 'none'
    element.style.visibility = 'hidden'
  })

  return {
    canvas,
    restore: () => {
      original.forEach(({ element, display, visibility }) => {
        element.style.display = display
        element.style.visibility = visibility
      })
    }
  }
}

const triggerExportEvent = (eventType: string, data?: unknown) => {
  const canvas = canvasContainerRef.value
  if (!canvas) return
  canvas.dispatchEvent(
    new CustomEvent(`canvas-export-${eventType}`, {
      bubbles: true,
      detail: {
        canvasInfo: getCanvasInfo(),
        timestamp: new Date().toISOString(),
        ...((data as Record<string, unknown>) || {})
      }
    })
  )
}

const handleCanvasPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return
  const world = screenToWorld(event.clientX, event.clientY)
  if (!world) return

  const additive = event.ctrlKey || event.metaKey
  selectingState.value = {
    start: clampToField({ x: world.x, y: world.y }),
    end: clampToField({ x: world.x, y: world.y }),
    additive,
    baseSelectedIds: [...selectedObstacleIds.value]
  }

  if (!additive) {
    setSelectedObstacleIds([])
  }
}

const handleKeyDown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return

  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedObstacleIds.value.length > 0) {
    const obstacleIds = [...selectedObstacleIds.value]
    obstacleIds.forEach((obstacleId) => {
      courseStore.removeObstacle(obstacleId)
      if (isCollaborating.value) {
        webSocketStore.sendRemoveObstacle(obstacleId)
      }
    })
    setSelectedObstacleIds([])
    return
  }

  if (event.key === 'Escape') {
    setSelectedObstacleIds([])
    selectingState.value = null
    handlePointerUp()
    return
  }

  // Undo (Ctrl+Z)
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) {
      const snap = historyStore.redo()
      if (snap) {
        courseStore.hydrateFromSnapshot(snap)
        if (isCollaborating.value) sendFullCanvasState()
      }
    } else {
      const snap = historyStore.undo()
      if (snap) {
        courseStore.hydrateFromSnapshot(snap)
        if (isCollaborating.value) sendFullCanvasState()
      }
    }
    return
  }

  // Redo (Ctrl+Y)
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    const snap = historyStore.redo()
    if (snap) {
      courseStore.hydrateFromSnapshot(snap)
      if (isCollaborating.value) sendFullCanvasState()
    }
    return
  }

  if (event.ctrlKey || event.metaKey) {
    if (event.key.toLowerCase() === 'c') {
      event.preventDefault()
      copyObstacles()
      return
    }
    if (event.key.toLowerCase() === 'v') {
      event.preventDefault()
      pasteObstacles()
      return
    }
    if (event.key.toLowerCase() === 'a') {
      event.preventDefault()
      setSelectedObstacleIds(courseStore.currentCourse.obstacles.map((obstacle) => obstacle.id))
      return
    }
  }
}

onMounted(() => {
  window.addEventListener('pointermove', handlePointerMove, { passive: false })
  window.addEventListener('pointerup', handlePointerUp, { passive: false })
  window.addEventListener('pointercancel', handlePointerUp, { passive: false })
  window.addEventListener('keydown', handleKeyDown)

  if (canvasContainerRef.value) {
    canvasContainerRef.value.addEventListener('generate-course-path', handleGenerateCoursePath as EventListener)
    canvasContainerRef.value.addEventListener('clear-canvas', handleClearCanvas as EventListener)
  }

  // Init history baseline
  historyStore.clear()
  courseStore.commitHistory()
})

onUnmounted(() => {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerUp)
  window.removeEventListener('keydown', handleKeyDown)

  if (canvasContainerRef.value) {
    canvasContainerRef.value.removeEventListener('generate-course-path', handleGenerateCoursePath as EventListener)
    canvasContainerRef.value.removeEventListener('clear-canvas', handleClearCanvas as EventListener)
  }
})

defineExpose({
  startCollaboration,
  stopCollaboration,
  handleClearCanvas,
  toggleDistanceLabels,
  isPathUpdateFromWebSocket,
  sendFullCanvasState,
  isCreator,
  getCanvasElement,
  getCanvasInfo,
  prepareCanvasForExport,
  triggerExportEvent
})
</script>

<style scoped lang="scss">
.course-canvas-v2 {
  width: 100%;
  height: 100%;
  background: #fff;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  touch-action: none;
}

.canvas-svg {
  width: 100%;
  height: 100%;
  display: block;
  user-select: none;
}

.grid-line {
  stroke: rgba(0, 0, 0, 0.08);
  stroke-width: 0.02;
}

.field-bg {
  fill: #ffffff;
  stroke: var(--border-color, #d9d9d9);
  stroke-width: 0.12;
}

.obstacle-group {
  cursor: move;

  .direction-arrow-group {
    pointer-events: none;
    opacity: 0.8;
  }

  &.selected .direction-arrow-group,
  &:hover .direction-arrow-group {
    opacity: 1;
  }
}

.direction-arrow-line {
  stroke: var(--primary-color, #409eff);
  stroke-width: 0.12;
  fill: none;
}

.direction-arrow-head {
  fill: var(--primary-color, #409eff);
}

.selection-outline {
  stroke: var(--primary-color, #409eff);
  stroke-width: 0.08;
  stroke-dasharray: 0.24, 0.16;
}

.obstacle-number-group {
  cursor: move;
}

.obstacle-number-bg {
  fill: var(--primary-color, #409eff);
  opacity: 0.9;
}

.obstacle-number {
  fill: #ffffff;
  font-size: 0.55px;
  text-anchor: middle;
  dominant-baseline: middle;
  font-weight: 700;
  user-select: none;
}

.path-marker {
  pointer-events: all;
  cursor: move;

  line {
    stroke: var(--primary-color, #409eff);
    stroke-width: 0.18;
    stroke-dasharray: 0.4, 0.25;
  }

  polygon {
    fill: var(--primary-color, #409eff);
  }
}

.end-marker {
  line,
  polygon {
    stroke: #f56c6c;
    fill: #f56c6c;
  }
}

.control-point {
  fill: var(--primary-color, #409eff);
  stroke: #fff;
  stroke-width: 0.08;
  cursor: move;
}

.rotate-handle {
  fill: #ff5a5a;
  stroke: #fff;
  stroke-width: 0.08;
  cursor: pointer;
}

.selection-box {
  fill: rgba(64, 158, 255, 0.12);
  stroke: var(--primary-color, #409eff);
  stroke-width: 0.08;
  stroke-dasharray: 0.3, 0.2;
}

.distance-label-bg {
  fill: rgba(255, 255, 255, 0.92);
  stroke: rgba(0, 0, 0, 0.22);
  stroke-width: 0.04;
}

.distance-label-text {
  fill: #303133;
  font-size: 0.45px;
  text-anchor: middle;
  dominant-baseline: middle;
  font-weight: 600;
}

.canvas-hud {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 999px; /* Pill shape */
  padding: 8px 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  z-index: 100;
}

.hud-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hud-divider {
  width: 1px;
  height: 16px;
  background: #cbd5e1;
}

.scale-indicator {
  display: flex;
  align-items: center;
}

.scale-indicator .line {
  width: 40px;
  height: 2px;
  background: #334155;
  position: relative;
  margin-right: 6px;
}

.scale-indicator .line::before,
.scale-indicator .line::after {
  content: '';
  position: absolute;
  width: 2px;
  height: 6px;
  background: #334155;
  top: -2px;
}

.scale-indicator .line::before {
  left: 0;
}

.scale-indicator .line::after {
  right: 0;
}

.scale-indicator span {
  font-size: 12px;
  color: #475569;
  font-weight: 500;
}

.path-tools {
  display: flex;
  gap: 6px;
}

.path-tool-btn {
  border: none;
  background: rgba(241, 245, 249, 0.8);
  color: #334155;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.path-tool-btn:hover {
  background: #e2e8f0;
  color: var(--primary-color);
}

.path-tool-btn.danger {
  color: #ef4444;
  background: transparent;
}

.path-tool-btn.danger:hover {
  background: #fef2f2;
}
</style>
