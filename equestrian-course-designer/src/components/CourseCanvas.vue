<template>
  <div
    ref="canvasRef"
    class="course-canvas"
    :style="canvasStyle"
    @drop="handleDrop"
    @dragover.prevent
    @mousedown.self="startSelection"
  >
    <div class="canvas-grid"></div>
    <div class="dimension-labels">
      <div class="width-label">宽度: {{ courseStore.currentCourse.fieldWidth }}m</div>
      <div class="height-label">高度: {{ courseStore.currentCourse.fieldHeight }}m</div>
    </div>
    <div class="field-dimensions" @click="showSizeDialog">
      {{ courseStore.currentCourse.fieldWidth }}m × {{ courseStore.currentCourse.fieldHeight }}m
      <el-icon class="edit-icon"><Edit /></el-icon>
    </div>
    <div class="scale-indicator">
      <div class="scale-line" :style="{ width: `${scaleWidth}px` }"></div>
      <div class="scale-label">5m</div>
    </div>
    <div
      v-for="obstacle in courseStore.currentCourse.obstacles"
      :key="obstacle.id"
      :data-id="obstacle.id"
      class="obstacle"
      :class="{
        selected: isSelected(obstacle),
        dragging: draggingObstacle?.id === obstacle.id,
      }"
      :style="{
        left: `${obstacle.position.x}px`,
        top: `${obstacle.position.y}px`,
        transform: `rotate(${obstacle.rotation}deg)`,
      }"
      @click="selectObstacle(obstacle, $event.ctrlKey || $event.metaKey)"
      @mousedown="startDragging($event, obstacle)"
    >
      <div class="obstacle-content">
        <div class="direction-arrow">
          <div class="arrow-line"></div>
          <div class="arrow-head"></div>
        </div>
        <template v-if="obstacle.type === ObstacleType.WALL">
          <div
            class="wall"
            :style="{
              width: `${obstacle.wallProperties?.width}px`,
              height: `${obstacle.wallProperties?.height}px`,
              background: obstacle.wallProperties?.color,
            }"
          >
            <div class="wall-texture"></div>
          </div>
        </template>
        <template v-else-if="obstacle.type === ObstacleType.LIVERPOOL">
          <div
            class="liverpool"
            :style="{
              width: `${obstacle.poles[0]?.width}px`,
            }"
          >
            <template v-if="obstacle.liverpoolProperties?.hasRail">
              <div
                v-for="(pole, index) in obstacle.poles"
                :key="index"
                class="pole"
                :style="{
                  width: '100%',
                  height: `${pole.height}px`,
                  background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
                }"
              >
                <div class="pole-shadow"></div>
              </div>
            </template>
            <div
              class="water"
              :style="{
                width: `${obstacle.liverpoolProperties?.width}px`,
                height: `${obstacle.liverpoolProperties?.waterDepth}px`,
                background: obstacle.liverpoolProperties?.waterColor,
                marginLeft: `${(obstacle.poles[0]?.width - (obstacle.liverpoolProperties?.width || 0)) / 2}px`,
              }"
            ></div>
          </div>
        </template>
        <template v-else>
          <div
            v-for="(pole, index) in obstacle.poles"
            :key="index"
            class="pole"
            :style="{
              width: `${pole.width}px`,
              height: `${pole.height}px`,
              background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
              marginBottom: pole.spacing ? `${pole.spacing}px` : '0',
            }"
          >
            <div class="pole-shadow"></div>
          </div>
        </template>
      </div>
      <div class="obstacle-controls" v-if="isSelected(obstacle)">
        <div class="rotation-handle" @mousedown.stop="startRotating($event, obstacle)"></div>
      </div>
    </div>

    <template
      v-for="obstacle in courseStore.currentCourse.obstacles"
      :key="`numbers-${obstacle.id}`"
    >
      <div
        v-for="(pole, index) in obstacle.poles.filter((p) => p.number)"
        :key="`number-${index}`"
        class="pole-number"
        @mousedown.stop="startDraggingPoleNumber($event, obstacle, index)"
        :style="{
          position: 'absolute',
          left: `${obstacle.position.x + (pole.numberPosition?.x ?? 0)}px`,
          top: `${obstacle.position.y + (pole.numberPosition?.y ?? 50)}px`,
          transform: 'translate(-50%, -50%)',
        }"
      >
        {{ pole.number }}
      </div>
    </template>

    <div class="canvas-placeholder" v-if="!courseStore.currentCourse.obstacles.length">
      <el-icon :size="48" class="placeholder-icon"><Plus /></el-icon>
      <p>从左侧拖拽障碍物到此处</p>
    </div>
    <div v-show="isSelecting" class="selection-box" :style="selectionStyle"></div>

    <div v-if="courseStore.coursePath.visible" class="course-path">
      <div
        class="path-indicator start-indicator"
        :style="startStyle"
        @mousedown.stop="startDraggingPoint('start', $event)"
      >
        <div class="direction-arrow">
          <div class="arrow-line"></div>
          <div class="arrow-head"></div>
        </div>
        <div class="path-line"></div>
        <div class="rotation-handle" @mousedown.stop="startRotatingPoint('start', $event)"></div>
      </div>

      <div
        class="path-indicator end-indicator"
        :style="endStyle"
        @mousedown.stop="startDraggingPoint('end', $event)"
      >
        <div class="direction-arrow">
          <div class="arrow-line"></div>
          <div class="arrow-head"></div>
        </div>
        <div class="path-line"></div>
        <div class="rotation-handle" @mousedown.stop="startRotatingPoint('end', $event)"></div>
      </div>

      <!-- 添加 SVG 路径渲染 -->
      <svg class="course-path-svg">
        <!-- 先渲染控制线 -->
        <template
          v-for="(point, pointIndex) in courseStore.coursePath.points"
          :key="`lines-${pointIndex}`"
        >
          <line
            v-if="point.controlPoint1"
            :x1="point.x"
            :y1="point.y"
            :x2="point.controlPoint1.x"
            :y2="point.controlPoint1.y"
            class="control-line"
          />
          <line
            v-if="point.controlPoint2"
            :x1="point.x"
            :y1="point.y"
            :x2="point.controlPoint2.x"
            :y2="point.controlPoint2.y"
            class="control-line"
          />
        </template>

        <!-- 渲染路径 -->
        <path
          v-for="(segment, index) in pathSegments"
          :key="`path-${index}`"
          :d="segment"
          class="course-path-line"
          fill="none"
          stroke="var(--primary-color)"
          stroke-width="2"
          stroke-dasharray="5,5"
        />

        <!-- 渲染控制点 -->
        <template
          v-for="(point, pointIndex) in courseStore.coursePath.points"
          :key="`points-${pointIndex}`"
        >
          <circle
            v-if="point.controlPoint1"
            :cx="point.controlPoint1.x"
            :cy="point.controlPoint1.y"
            :r="draggingControlPoint?.pointIndex === pointIndex && draggingControlPoint?.controlPointNumber === 1 ? 8 : 6"
            class="control-point"
            @mousedown.stop="startDraggingControlPoint(pointIndex, 1, $event)"
          />
          <circle
            v-if="point.controlPoint2"
            :cx="point.controlPoint2.x"
            :cy="point.controlPoint2.y"
            :r="draggingControlPoint?.pointIndex === pointIndex && draggingControlPoint?.controlPointNumber === 2 ? 8 : 6"
            class="control-point"
            @mousedown.stop="startDraggingControlPoint(pointIndex, 2, $event)"
          />
        </template>
      </svg>
    </div>
  </div>

  <el-dialog
    v-model="sizeDialogVisible"
    title="设置场地尺寸"
    width="400px"
    :close-on-click-modal="false"
  >
    <el-form label-position="top">
      <el-form-item label="场地宽度 (米)">
        <el-input-number
          v-model="tempFieldSize.width"
          :min="40"
          :max="200"
          :step="5"
          controls-position="right"
          class="full-width"
        />
      </el-form-item>
      <el-form-item label="场地高度 (米)">
        <el-input-number
          v-model="tempFieldSize.height"
          :min="20"
          :max="150"
          :step="5"
          controls-position="right"
          class="full-width"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="sizeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="updateFieldSize">确定</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Plus, Edit } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useCourseStore } from '@/stores/course'
import type { Obstacle } from '@/types/obstacle'
import { ObstacleType } from '@/types/obstacle'

// 组件状态管理
const courseStore = useCourseStore()
const selectedObstacles = ref<Obstacle[]>([]) // 当前选中的障碍物列表
const draggingObstacle = ref<Obstacle | null>(null) // 当前正在拖动的障碍物
const isDragging = ref(false) // 是否正在拖动
const isRotating = ref(false) // 是否正在旋转
const isDraggingNumber = ref(false)
const draggingNumberObstacle = ref<Obstacle | null>(null)
const draggingPoleIndex = ref<number | null>(null)
const startPos = ref<Record<string, { x: number; y: number }>>({})
const startMousePos = ref({ x: 0, y: 0 }) // 开始位置

// 场地尺寸对话框
const sizeDialogVisible = ref(false)
const tempFieldSize = ref({ width: 80, height: 60 }) // 临时存储场地尺寸

// 添加框选相关的状态
const isSelecting = ref(false)
const selectionStart = ref({ x: 0, y: 0 })
const selectionEnd = ref({ x: 0, y: 0 })

// 复制粘贴相关的状态
const copiedObstacles = ref<Obstacle[]>([])

// 添加控制点拖拽状态
const draggingControlPoint = ref<{ pointIndex: number; controlPointNumber: 1 | 2 } | null>(null)

// 添加起终点状态
const draggingPoint = ref<'start' | 'end' | 'start-rotate' | 'end-rotate' | null>(null)

// 选择障碍物
const selectObstacle = (obstacle: Obstacle, multiSelect = false) => {
  if (multiSelect) {
    // 如果是多选模式
    const index = selectedObstacles.value.findIndex((o) => o.id === obstacle.id)
    if (index === -1) {
      selectedObstacles.value.push(obstacle)
    } else {
      selectedObstacles.value.splice(index, 1)
    }
  } else {
    // 单选模式
    selectedObstacles.value = [obstacle]
  }
  courseStore.selectedObstacle = selectedObstacles.value[0] // 保持兼容性
}

// 清除选择
const clearSelection = () => {
  selectedObstacles.value = []
  courseStore.selectedObstacle = null
}

// 修改模板中选中判断
const isSelected = (obstacle: Obstacle) => {
  return selectedObstacles.value.some((o) => o.id === obstacle.id)
}

// 调整颜色亮度
const adjustColor = (color: string, amount: number) => {
  const hex = color.replace('#', '')
  const num = parseInt(hex, 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// 开始拖动障碍物
const startDragging = (event: MouseEvent, obstacle: Obstacle) => {
  if (isRotating.value) return

  isDragging.value = true
  draggingObstacle.value = obstacle

  // 如果点击的障碍物不在选中列表中，则选中它
  if (!isSelected(obstacle)) {
    selectObstacle(obstacle, event.ctrlKey || event.metaKey)
  }

  // 记录所有选中障碍物的初始位置
  const positions: Record<string, { x: number; y: number }> = {}
  selectedObstacles.value.forEach((obs) => {
    positions[obs.id] = { ...obs.position }
  })
  startPos.value = positions

  startMousePos.value = { x: event.clientX, y: event.clientY }
  event.preventDefault()
}

// 开始旋转障碍物
const startRotating = (event: MouseEvent, obstacle: Obstacle) => {
  isRotating.value = true
  draggingObstacle.value = obstacle
  const rect = (event.currentTarget as HTMLElement).closest('.obstacle')?.getBoundingClientRect()
  if (!rect) return

  // 计算旋转中心点
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2

  // 计算当前角度
  const currentAngle =
    (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI

  startMousePos.value = {
    x: currentAngle,
    y: obstacle.rotation,
  }

  event.preventDefault()
}

// 开始拖动编号
const startDraggingPoleNumber = (event: MouseEvent, obstacle: Obstacle, poleIndex: number) => {
  event.stopPropagation()
  isDraggingNumber.value = true
  draggingNumberObstacle.value = obstacle
  draggingPoleIndex.value = poleIndex
  startMousePos.value = { x: event.clientX, y: event.clientY }

  // 记录编号的初始位置
  const pole = obstacle.poles[poleIndex]
  startPos.value = {
    [obstacle.id]: {
      x: pole.numberPosition?.x ?? 0,
      y: pole.numberPosition?.y ?? 50,
    },
  }
}

// 处理鼠标移动
const handleMouseMove = (event: MouseEvent) => {
  if (!draggingObstacle.value && !draggingNumberObstacle.value) return

  if (isDraggingNumber.value && draggingNumberObstacle.value && draggingPoleIndex.value !== null) {
    const dx = event.clientX - startMousePos.value.x
    const dy = event.clientY - startMousePos.value.y

    const initialPos = startPos.value[draggingNumberObstacle.value.id]
    const newPosition = {
      x: initialPos.x + dx,
      y: initialPos.y + dy,
    }

    // 更新编号位置
    const newPoles = [...draggingNumberObstacle.value.poles]
    newPoles[draggingPoleIndex.value] = {
      ...newPoles[draggingPoleIndex.value],
      numberPosition: newPosition,
    }

    courseStore.updateObstacle(draggingNumberObstacle.value.id, {
      poles: newPoles,
    })
    return
  }

  if (isDragging.value && draggingObstacle.value) {
    // 计算拖动距离
    const dx = event.clientX - startMousePos.value.x
    const dy = event.clientY - startMousePos.value.y

    // 更新所有选中障碍物的位置
    selectedObstacles.value.forEach((obstacle) => {
      const initialPos = (startPos.value as Record<string, { x: number; y: number }>)[obstacle.id]
      if (initialPos) {
        const newPosition = {
          x: initialPos.x + dx,
          y: initialPos.y + dy,
        }
        courseStore.updateObstacle(obstacle.id, {
          position: newPosition,
        })
      }
    })
  } else if (isRotating.value && draggingObstacle.value) {
    const rect = document
      .querySelector(`[data-id="${draggingObstacle.value.id}"]`)
      ?.getBoundingClientRect()
    if (!rect) return

    // 计算旋转角度
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const currentAngle =
      (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI

    const deltaAngle = currentAngle - startMousePos.value.x
    let newRotation = (startMousePos.value.y + deltaAngle) % 360

    // 确保角度在0-360之间
    if (newRotation < 0) {
      newRotation += 360
    }

    // 更新障碍物的旋转角度
    draggingObstacle.value.rotation = newRotation
    courseStore.updateObstacle(draggingObstacle.value.id, {
      rotation: newRotation,
    })
  }

  // 处理起终点拖拽
  if (draggingPoint.value === 'start' || draggingPoint.value === 'end') {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(event.clientX - rect.left - startMousePos.value.x, rect.width))
    const y = Math.max(0, Math.min(event.clientY - rect.top - startMousePos.value.y, rect.height))

    if (draggingPoint.value === 'start') {
      courseStore.updateStartPoint({ x, y })
    } else {
      courseStore.updateEndPoint({ x, y })
    }
    courseStore.generatePath() // 重新生成路径
  } else if (draggingPoint.value === 'start-rotate' || draggingPoint.value === 'end-rotate') {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const pointPos =
      draggingPoint.value === 'start-rotate' ? courseStore.startPoint : courseStore.endPoint
    const centerX = rect.left + pointPos.x
    const centerY = rect.top + pointPos.y

    // 计算当前角度
    const currentAngle =
      (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI
    const deltaAngle = currentAngle - startMousePos.value.x

    // 计算新的旋转角度，确保在0-360度之间
    let newRotation = (startMousePos.value.y + deltaAngle) % 360
    if (newRotation < 0) newRotation += 360

    // 更新旋转角度
    if (draggingPoint.value === 'start-rotate') {
      courseStore.updateStartRotation(Math.round(newRotation))
    } else {
      courseStore.updateEndRotation(Math.round(newRotation))
    }
    courseStore.generatePath() // 重新生成路径
  }

  // 处理控制点拖拽
  if (draggingControlPoint.value) {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
    const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height))

    courseStore.updateControlPoint(
      draggingControlPoint.value.pointIndex,
      draggingControlPoint.value.controlPointNumber,
      { x, y },
    )
  }
}

// 处理鼠标松开
const handleMouseUp = () => {
  isDragging.value = false
  isRotating.value = false
  isDraggingNumber.value = false
  draggingObstacle.value = null
  draggingNumberObstacle.value = null
  draggingPoleIndex.value = null
  draggingControlPoint.value = null
}

// 处理拖放新障碍物
const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  const obstacleType = event.dataTransfer?.getData('obstacleType')
  if (!obstacleType) return

  const rect = (event.target as HTMLElement).getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  // 实际横木尺寸：
  const poleWidth = 4 * meterScale.value // 4米转换为像素（横木长度）
  const poleHeight = 0.2 * meterScale.value // 20厘米转换为米再转像素（横木宽度）
  const defaultSpacing = 2.5 * meterScale.value // 2.5米转换为像素

  // 创建新障碍物
  const newObstacle: Omit<Obstacle, 'id'> = {
    type: obstacleType as ObstacleType,
    position: { x, y },
    rotation: 270,
    poles: [],
  }

  // 根据障碍物类型设置属性
  switch (obstacleType) {
    case ObstacleType.WALL:
      newObstacle.wallProperties = {
        height: 1.2 * meterScale.value, // 1.2米高
        width: 3 * meterScale.value, // 3米宽
        color: '#8B4513', // 棕色
        texture: 'brick', // 砖块纹理
      }
      break

    case ObstacleType.LIVERPOOL:
      const liverpoolWidth = 4 * meterScale.value // 横杆长度4米
      newObstacle.liverpoolProperties = {
        height: 0.3 * meterScale.value, // 水池高度30厘米
        width: liverpoolWidth, // 水池宽度与横杆相同
        waterDepth: 0.2 * meterScale.value, // 水深20厘米
        waterColor: 'rgba(0, 100, 255, 0.3)', // 半透明蓝色
        hasRail: true,
        railHeight: 1.3 * meterScale.value, // 横杆高度1.3米
      }
      // 添加顶部横杆
      newObstacle.poles = [
        {
          width: liverpoolWidth, // 横杆长度4米
          height: 0.2 * meterScale.value,
          color: '#8B4513',
          numberPosition: { x: 0, y: 50 },
        },
      ]
      break

    case ObstacleType.SINGLE:
      newObstacle.poles = [
        {
          width: poleWidth,
          height: poleHeight,
          color: '#8B4513',
          numberPosition: { x: 0, y: 50 },
        },
      ]
      break

    case ObstacleType.DOUBLE:
      newObstacle.poles = [
        {
          width: poleWidth,
          height: poleHeight,
          color: '#8B4513',
          spacing: defaultSpacing,
          numberPosition: { x: 0, y: 50 },
        },
        {
          width: poleWidth,
          height: poleHeight,
          color: '#8B4513',
          numberPosition: { x: 0, y: 50 },
        },
      ]
      break

    case ObstacleType.COMBINATION:
      newObstacle.poles = [
        {
          width: poleWidth,
          height: poleHeight,
          color: '#8B4513',
          spacing: defaultSpacing,
          numberPosition: { x: 0, y: 50 },
        },
        {
          width: poleWidth,
          height: poleHeight,
          color: '#8B4513',
          spacing: defaultSpacing,
          numberPosition: { x: 0, y: 50 },
        },
        {
          width: poleWidth,
          height: poleHeight,
          color: '#8B4513',
          numberPosition: { x: 0, y: 50 },
        },
      ]
      break
  }

  courseStore.addObstacle(newObstacle)
}

// 显示场地尺寸对话框
const showSizeDialog = () => {
  tempFieldSize.value = {
    width: courseStore.currentCourse.fieldWidth,
    height: courseStore.currentCourse.fieldHeight,
  }
  sizeDialogVisible.value = true
}

// 更新场地尺寸
const updateFieldSize = () => {
  courseStore.updateFieldSize(tempFieldSize.value.width, tempFieldSize.value.height)
  sizeDialogVisible.value = false
}

// 计算每米对应的像素数
const canvasRef = ref<HTMLElement | null>(null)
const meterScale = computed(() => {
  if (!canvasRef.value) return 1
  const rect = canvasRef.value.getBoundingClientRect()
  return rect.width / courseStore.currentCourse.fieldWidth
})

// 计算比例尺长度（像素）
const scaleWidth = computed(() => {
  return 5 * meterScale.value
})

// 计算画布样式
const canvasStyle = computed(() => ({
  aspectRatio: `${courseStore.currentCourse.fieldWidth}/${courseStore.currentCourse.fieldHeight}`,
}))

// 根据场地尺寸计算网格大小
const gridSize = computed(() => ({
  width: `calc(100% / ${courseStore.currentCourse.fieldWidth})`,
  height: `calc(100% / ${courseStore.currentCourse.fieldHeight})`,
}))

// 处理键盘事件
const handleKeyDown = (event: KeyboardEvent) => {
  if ((event.target as HTMLElement)?.tagName === 'INPUT') return

  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedObstacles.value.length > 0) {
    // 删除所有的障碍物
    selectedObstacles.value.forEach((obstacle) => {
      courseStore.removeObstacle(obstacle.id)
    })
    clearSelection()
  } else if (event.ctrlKey || event.metaKey) {
    if (event.key === 'c') {
      copyObstacle()
    } else if (event.key === 'v') {
      pasteObstacle()
    } else if (event.key === 'a') {
      // 全选
      event.preventDefault()
      selectedObstacles.value = [...courseStore.currentCourse.obstacles]
      courseStore.selectedObstacle = selectedObstacles.value[0] || null
    }
  }
}

// 计算选择框的样式
const selectionStyle = computed(() => {
  if (!isSelecting.value) return {}

  const left = Math.min(selectionStart.value.x, selectionEnd.value.x)
  const top = Math.min(selectionStart.value.y, selectionEnd.value.y)
  const width = Math.abs(selectionEnd.value.x - selectionStart.value.x)
  const height = Math.abs(selectionEnd.value.y - selectionStart.value.y)

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  }
})

// 开始框选
const startSelection = (event: MouseEvent) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  isSelecting.value = true
  selectionStart.value = { x, y }
  selectionEnd.value = { x, y }

  // 如果没按住Ctrl/Command键，清除当前选中
  if (!event.ctrlKey && !event.metaKey) {
    clearSelection()
  }
}

// 更新框选区域
const updateSelection = (event: MouseEvent) => {
  if (!isSelecting.value) return

  const canvas = document.querySelector('.course-canvas')
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
  const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height))

  selectionEnd.value = { x, y }
}

// 结束框选
const endSelection = () => {
  if (!isSelecting.value) return

  const left = Math.min(selectionStart.value.x, selectionEnd.value.x)
  const top = Math.min(selectionStart.value.y, selectionEnd.value.y)
  const right = Math.max(selectionStart.value.x, selectionEnd.value.x)
  const bottom = Math.max(selectionStart.value.y, selectionEnd.value.y)

  // 查每个障碍物是否在选择域内
  const newSelectedObstacles = courseStore.currentCourse.obstacles.filter((obstacle) => {
    const obstacleEl = document.querySelector(`[data-id="${obstacle.id}"]`)
    if (!obstacleEl) return false

    const obstacleRect = obstacleEl.getBoundingClientRect()
    const canvas = document.querySelector('.course-canvas')?.getBoundingClientRect()
    if (!canvas) return false

    const relativeRect = {
      left: obstacleRect.left - canvas.left,
      top: obstacleRect.top - canvas.top,
      right: obstacleRect.right - canvas.left,
      bottom: obstacleRect.bottom - canvas.top,
    }

    return !(
      relativeRect.right < left ||
      relativeRect.left > right ||
      relativeRect.bottom < top ||
      relativeRect.top > bottom
    )
  })

  // 更新选中态
  selectedObstacles.value = newSelectedObstacles
  courseStore.selectedObstacle = newSelectedObstacles[0] || null

  isSelecting.value = false
}

// 修改事件监听
const handleGlobalMouseMove = (event: MouseEvent) => {
  handleMouseMove(event)
  updateSelection(event)

  if (draggingPoint.value === 'start' || draggingPoint.value === 'end') {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    // 考虑鼠标点击位置的偏移
    const x = Math.max(0, Math.min(event.clientX - rect.left - startMousePos.value.x, rect.width))
    const y = Math.max(0, Math.min(event.clientY - rect.top - startMousePos.value.y, rect.height))

    if (draggingPoint.value === 'start') {
      courseStore.updateStartPoint({ x, y })
    } else {
      courseStore.updateEndPoint({ x, y })
    }
    courseStore.generatePath() // 重新生成路径
  } else if (draggingPoint.value === 'start-rotate' || draggingPoint.value === 'end-rotate') {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const pointPos =
      draggingPoint.value === 'start-rotate' ? courseStore.startPoint : courseStore.endPoint
    const centerX = rect.left + pointPos.x
    const centerY = rect.top + pointPos.y

    // 计算当前角度
    const currentAngle =
      (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI
    const deltaAngle = currentAngle - startMousePos.value.x

    // 计算新的旋转角度，确保在0-360度之间
    let newRotation = (startMousePos.value.y + deltaAngle) % 360
    if (newRotation < 0) newRotation += 360

    // 更新旋转角度
    if (draggingPoint.value === 'start-rotate') {
      courseStore.updateStartRotation(Math.round(newRotation))
    } else {
      courseStore.updateEndRotation(Math.round(newRotation))
    }
    courseStore.generatePath() // 重新生成路径
  }

  // 处理控制点拖拽
  if (draggingControlPoint.value) {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
    const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height))

    courseStore.updateControlPoint(
      draggingControlPoint.value.pointIndex,
      draggingControlPoint.value.controlPointNumber,
      { x, y },
    )
  }
}

const handleGlobalMouseUp = () => {
  handleMouseUp()
  endSelection()
  draggingPoint.value = null
}

// 组件挂载时添加事件监听
onMounted(() => {
  window.addEventListener('mousemove', handleGlobalMouseMove)
  window.addEventListener('mouseup', handleGlobalMouseUp)
  window.addEventListener('keydown', handleKeyDown)
  // 添加生成路线事件监听
  const canvas = document.querySelector('.course-canvas')
  if (canvas) {
    canvas.addEventListener('generate-course-path', handleGenerateCoursePath)
  }
})

// 组件卸载时移除事件监听
onUnmounted(() => {
  window.removeEventListener('mousemove', handleGlobalMouseMove)
  window.removeEventListener('mouseup', handleGlobalMouseUp)
  window.removeEventListener('keydown', handleKeyDown)
  // 移除生成路线事件监听
  const canvas = document.querySelector('.course-canvas')
  if (canvas) {
    canvas.removeEventListener('generate-course-path', handleGenerateCoursePath)
  }
})

// 复制当前选中的障碍物
const copyObstacle = () => {
  if (!selectedObstacles.value.length) return
  copiedObstacles.value = JSON.parse(JSON.stringify(selectedObstacles.value))
}

// 粘贴障碍物
const pasteObstacle = () => {
  if (!copiedObstacles.value.length) return

  // 计算选中障碍物的中心点
  const centerX =
    copiedObstacles.value.reduce((sum, obs) => sum + obs.position.x, 0) /
    copiedObstacles.value.length
  const centerY =
    copiedObstacles.value.reduce((sum, obs) => sum + obs.position.y, 0) /
    copiedObstacles.value.length

  // 创建新的障碍物，整体偏移一定距离
  const offsetX = 20
  const offsetY = 20

  copiedObstacles.value.forEach((obstacle) => {
    // 计算相对于中心点的偏移
    const relativeX = obstacle.position.x - centerX
    const relativeY = obstacle.position.y - centerY

    const newObstacle: Omit<Obstacle, 'id'> = {
      ...obstacle,
      position: {
        x: centerX + relativeX + offsetX,
        y: centerY + relativeY + offsetY,
      },
      numberPosition: obstacle.numberPosition
        ? {
            x: obstacle.numberPosition.x + offsetX,
            y: obstacle.numberPosition.y + offsetY,
          }
        : undefined,
    }

    courseStore.addObstacle(newObstacle)
  })
}

// 开始拖拽起终点
const startDraggingPoint = (point: 'start' | 'end', event: MouseEvent) => {
  draggingPoint.value = point
  const canvas = document.querySelector('.course-canvas')
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const pointPos = point === 'start' ? courseStore.startPoint : courseStore.endPoint

  // 记录鼠标相对于起终点中心的偏移
  startMousePos.value = {
    x: event.clientX - rect.left - pointPos.x,
    y: event.clientY - rect.top - pointPos.y,
  }

  event.stopPropagation()
}

// 修改旋转处理函数
const startRotatingPoint = (point: 'start' | 'end', event: MouseEvent) => {
  draggingPoint.value = `${point}-rotate` as 'start-rotate' | 'end-rotate'
  const canvas = document.querySelector('.course-canvas')
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const pointPos = point === 'start' ? courseStore.startPoint : courseStore.endPoint
  const centerX = rect.left + pointPos.x
  const centerY = rect.top + pointPos.y

  // 计算初始角度
  const currentAngle =
    (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI
  startMousePos.value = {
    x: currentAngle,
    y: point === 'start' ? courseStore.startPoint.rotation : courseStore.endPoint.rotation,
  }

  event.stopPropagation()
}

// 开始拖拽控制点
const startDraggingControlPoint = (
  pointIndex: number,
  controlPointNumber: 1 | 2,
  event: MouseEvent,
) => {
  draggingControlPoint.value = { pointIndex, controlPointNumber }
  const canvas = document.querySelector('.course-canvas')
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const point = courseStore.coursePath.points[pointIndex]
  const controlPoint = controlPointNumber === 1 ? point.controlPoint1 : point.controlPoint2

  if (controlPoint) {
    startMousePos.value = {
      x: event.clientX - rect.left - controlPoint.x,
      y: event.clientY - rect.top - controlPoint.y,
    }
  }

  event.stopPropagation()
}

// 计算路径段
const pathSegments = computed(() => {
  const segments: string[] = []
  const points = courseStore.coursePath.points

  for (let i = 1; i < points.length; i++) {
    const current = points[i]
    const previous = points[i - 1]

    if (current.controlPoint1 && previous.controlPoint2) {
      // 使用三次贝塞尔曲线
      segments.push(
        `M ${previous.x} ${previous.y} ` +
          `C ${previous.controlPoint2.x} ${previous.controlPoint2.y}, ` +
          `${current.controlPoint1.x} ${current.controlPoint1.y}, ` +
          `${current.x} ${current.y}`,
      )
    } else {
      // 使用直线
      segments.push(`M ${previous.x} ${previous.y} L ${current.x} ${current.y}`)
    }
  }

  return segments
})

// 修改起终点的样式绑定
const startStyle = computed(() => ({
  left: `${courseStore.startPoint.x}px`,
  top: `${courseStore.startPoint.y}px`,
  transform: `rotate(${courseStore.startPoint.rotation}deg)`,
}))

const endStyle = computed(() => ({
  left: `${courseStore.endPoint.x}px`,
  top: `${courseStore.endPoint.y}px`,
  transform: `rotate(${courseStore.endPoint.rotation}deg)`,
}))

// 修改清空画布的方法
const handleClearCanvas = () => {
  // 先清除路线（这会同时处理可见性和起终点）
  courseStore.clearPath()

  // 清除所有障碍物
  courseStore.currentCourse.obstacles.forEach(obstacle => {
    courseStore.removeObstacle(obstacle.id)
  })

  // 清除选中状态
  clearSelection()
}

// 修改生成路线的方法
const handleGenerateCoursePath = () => {
  if (courseStore.currentCourse.obstacles.length === 0) {
    ElMessage.warning('请先添加障碍物')
    return
  }

  // 先清除现有路径
  courseStore.clearPath()
  // 生成新路径
  courseStore.generatePath()
  // 显示路径
  courseStore.togglePathVisibility(true)
}

// 将方法暴露给父组件
defineExpose({
  handleClearCanvas
})
</script>

<style scoped lang="scss">
.course-canvas {
  width: 100%;
  height: 100%;
  min-height: 100%;
  background-color: white;
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  margin: 0 auto;
  user-select: none;
  -webkit-user-select: none;
}

.canvas-grid {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: v-bind('gridSize.width') v-bind('gridSize.height');
  background-image: linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px);
  pointer-events: none;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 2px solid var(--border-color);
    pointer-events: none;
  }
}

.obstacle {
  position: absolute;
  cursor: move;
  padding: 20px;
  transform-origin: center center;
  transition: transform 0.3s ease;
  user-select: none;
  --obstacle-rotation: 0deg;

  &.selected {
    z-index: 100;

    .obstacle-content {
      outline: 2px solid var(--primary-color);
      outline-offset: 4px;
    }

    .obstacle-controls {
      display: block;
    }

    .direction-arrow {
      opacity: 1;
    }
  }

  &.dragging {
    transition: none;
    z-index: 1000;

    .obstacle-content {
      outline: 2px solid var(--primary-color);
      outline-offset: 4px;
    }
  }

  &:hover {
    .obstacle-content {
      outline: 2px solid rgba(43, 92, 231, 0.5);
      outline-offset: 4px;
    }

    .direction-arrow {
      opacity: 1;
    }
  }
}

.obstacle-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: outline 0.3s ease;
  position: relative;
}

.pole {
  position: relative;
  transition: all 0.3s ease;

  .pole-shadow {
    position: absolute;
    bottom: -4px;
    left: 4px;
    right: 4px;
    height: 4px;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    filter: blur(2px);
  }
}

.pole-number {
  position: absolute;
  cursor: move;
  background: var(--primary-color);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  transform-origin: center center;
  pointer-events: auto;
}

.obstacle-controls {
  display: none;
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;

  .rotation-handle {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 12px;
    height: 12px;
    background-color: var(--primary-color);
    border: 2px solid white;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    pointer-events: auto;

    &:hover {
      transform: scale(1.2);
    }
  }
}

.canvas-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: #909399;

  .placeholder-icon {
    color: #c0c4cc;
  }

  p {
    margin: 0;
    font-size: 16px;
  }
}

.direction-arrow {
  position: absolute;
  top: -40px;
  bottom: -40px;
  left: 50%;
  width: 40px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0.9;
  transition: all 0.3s ease;
  pointer-events: none;

  .arrow-line {
    flex: 1;
    width: 2px;
    background: var(--primary-color);
    position: relative;
  }

  .arrow-head {
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 12px solid var(--primary-color);
  }

  &:hover {
    opacity: 1;
  }
}

.field-dimensions {
  position: absolute;
  top: 12px;
  right: 12px;
  background-color: rgba(255, 255, 255, 0.9);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
  color: var(--text-color);
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 10;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;

  .edit-icon {
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  &:hover {
    background-color: white;
    .edit-icon {
      opacity: 0.6;
    }
  }
}

.scale-indicator {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  z-index: 10;
  background-color: rgba(255, 255, 255, 0.9);
  padding: 8px;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  .scale-line {
    width: 100px;
    height: 2px;
    background-color: var(--text-color);
    position: relative;

    &::before,
    &::after {
      content: '';
      position: absolute;
      width: 2px;
      height: 8px;
      background-color: var(--text-color);
      top: -3px;
    }

    &::before {
      left: 0;
    }

    &::after {
      right: 0;
    }
  }

  .scale-label {
    font-size: 12px;
    color: var(--text-color);
    font-weight: 500;
    text-align: center;
    width: 100%;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.full-width {
  width: 100%;
}

.dimension-labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;

  .width-label {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(255, 255, 255, 0.9);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 14px;
    color: var(--text-color);
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .height-label {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%) rotate(-90deg);
    background-color: rgba(255, 255, 255, 0.9);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 14px;
    color: var(--text-color);
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
}

// 添加选择框样式
.selection-box {
  position: absolute;
  border: 1px solid #2196f3;
  background-color: rgba(33, 150, 243, 0.1);
  pointer-events: none;
}

.wall {
  position: relative;
  border-radius: 4px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  overflow: hidden;

  .wall-texture {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: repeating-linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.1) 0px,
        rgba(0, 0, 0, 0.1) 4px,
        transparent 4px,
        transparent 8px
      ),
      repeating-linear-gradient(
        0deg,
        rgba(0, 0, 0, 0.1) 0px,
        rgba(0, 0, 0, 0.1) 4px,
        transparent 4px,
        transparent 8px
      );
  }
}

.liverpool {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;

  .water {
    border-radius: 4px;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
  }
}

.point-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  z-index: 100;
  pointer-events: none;

  &.start-point {
    background-color: #67c23a;
    &::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top-color: #67c23a;
    }
  }

  &.end-point {
    background-color: #f56c6c;
    &::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top-color: #f56c6c;
    }
  }
}

// 修改路径样式
.course-path {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.path-indicator {
  position: absolute;
  width: 100px;
  height: 40px;
  transform-origin: center center;
  cursor: move;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;

  .rotation-handle {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 12px;
    height: 12px;
    background-color: currentColor;
    border: 2px solid white;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    z-index: 2;
    user-select: none;
    -webkit-user-select: none;

    &:hover {
      transform: scale(1.2);
    }
  }

  &.start-indicator {
    color: #409eff;
    .path-line {
      border: 2px dashed currentColor;
    }
    .direction-arrow {
      .arrow-line {
        background: currentColor;
      }
      .arrow-head {
        border-top-color: currentColor;
      }
    }
  }

  &.end-indicator {
    color: #f56c6c;
    .path-line {
      border: 2px dashed currentColor;
    }
    .direction-arrow {
      .arrow-line {
        background: currentColor;
      }
      .arrow-head {
        border-top-color: currentColor;
      }
    }
  }

  .path-line {
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    height: 0;
    transform: translateY(-50%);
  }

  .direction-arrow {
    position: absolute;
    top: -20px;
    bottom: -20px;
    left: 50%;
    width: 40px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;

    .arrow-line {
      flex: 1;
      width: 2px;
      position: relative;
    }

    .arrow-head {
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 12px solid;
    }
  }

  &:hover {
    .direction-arrow {
      opacity: 1;
    }
  }
}

.course-path-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 50;
}

.course-path-line {
  pointer-events: none;
}

.control-point {
  fill: var(--primary-color);
  stroke: white;
  stroke-width: 2;
  cursor: move;
  pointer-events: all;

  &:hover {
    fill: var(--primary-color-light);
    r: 8;
  }
}

.control-line {
  stroke: var(--primary-color);
  stroke-width: 1;
  stroke-dasharray: 4, 4;
  opacity: 0.3;
  pointer-events: none;
}
</style>
