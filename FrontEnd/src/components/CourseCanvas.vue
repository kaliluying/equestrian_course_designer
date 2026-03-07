<template>
  <div :class="['course-canvas', $attrs.class]" :style="canvasStyle" @drop="handleDrop" @dragover.prevent
    @pointerdown.self="startSelection" ref="canvasContainerRef">

    <div class="canvas-grid"></div>
    <div class="dimension-labels">
      <div class="width-label">宽度: {{ courseStore.currentCourse.fieldWidth }}m</div>
      <div class="height-label">高度: {{ courseStore.currentCourse.fieldHeight }}m</div>
    </div>
    <div class="field-dimensions" @click="showSizeDialog">
      {{ courseStore.currentCourse.fieldWidth }}m × {{ courseStore.currentCourse.fieldHeight }}m
      <el-icon class="edit-icon">
        <Edit />
      </el-icon>
    </div>
    <div class="scale-indicator">
      <div class="scale-line" :style="{ width: `${scaleWidth}px` }"></div>
      <div class="scale-label">5m</div>
    </div>
    <div v-for="obstacle in courseStore.currentCourse.obstacles" :key="obstacle.id" :data-id="obstacle.id"
      class="obstacle" :class="{
        selected: isSelected(obstacle),
        dragging: draggingObstacle?.id === obstacle.id,
      }" :style="{
        left: `${scalePoint(obstacle.position).x}px`,
        top: `${scalePoint(obstacle.position).y}px`,
        transform: `rotate(${obstacle.rotation}deg)`,
      }" @click="handleObstacleClick($event, obstacle)"
      @pointerdown="startDragging($event, obstacle)">
      <div class="obstacle-content">
        <!-- 仅对非装饰物类型显示方向箭头，或装饰物但设置了showDirectionArrow属性 -->
        <div v-if="obstacle.type !== ObstacleType.DECORATION ||
          (obstacle.type === ObstacleType.DECORATION && obstacle.decorationProperties?.showDirectionArrow)"
          class="direction-arrow">
          <div class="arrow-line"></div>
          <div class="arrow-head"></div>
        </div>
        <template v-if="obstacle.type === ObstacleType.WALL">
          <div class="wall" :style="{
            width: `${scalePoint({x: obstacle.wallProperties?.width || 0, y: 0}).x}px`,
            height: `${scalePoint({x: 0, y: obstacle.wallProperties?.height || 0}).y}px`,
            background: obstacle.wallProperties?.color,
          }">
            <div class="wall-texture"></div>
          </div>
        </template>
        <template v-else-if="obstacle.type === ObstacleType.LIVERPOOL">
          <div class="liverpool" :style="{
            width: `${scalePoint({x: obstacle.poles[0]?.width || 0, y: 0}).x}px`,
          }">
            <template v-if="obstacle.liverpoolProperties?.hasRail">
              <div v-for="(pole, index) in obstacle.poles" :key="index" class="pole" :style="{
                width: '100%',
                height: `${scalePoint({x: 0, y: pole.height || 0}).y}px`,
                background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
              }">
                <div class="pole-shadow"></div>
              </div>
            </template>
            <div class="water" :style="{
              width: `${scalePoint({x: obstacle.liverpoolProperties?.width || 0, y: 0}).x}px`,
              height: `${scalePoint({x: 0, y: obstacle.liverpoolProperties?.waterDepth || 0}).y}px`,
              background: obstacle.liverpoolProperties?.waterColor,
              marginLeft: `${(scalePoint({x: obstacle.poles[0]?.width || 0, y: 0}).x - scalePoint({x: obstacle.liverpoolProperties?.width || 0, y: 0}).x) / 2}px`,
            }"></div>
          </div>
        </template>
        <template v-else-if="obstacle.type === ObstacleType.CUSTOM">
          <!-- 自定义障碍物渲染 -->
          <template v-if="getCustomTemplate(obstacle) && getCustomTemplate(obstacle)?.baseType === ObstacleType.WALL">
            <div class="wall" :style="{
              width: `${scalePoint({x: obstacle.wallProperties?.width || 0, y: 0}).x}px`,
              height: `${scalePoint({x: 0, y: obstacle.wallProperties?.height || 0}).y}px`,
              background: obstacle.wallProperties?.color,
            }">
              <div class="wall-texture"></div>
            </div>
          </template>
          <template
            v-else-if="getCustomTemplate(obstacle) && getCustomTemplate(obstacle)?.baseType === ObstacleType.LIVERPOOL">
            <div class="liverpool" :style="{
              width: `${scalePoint({x: obstacle.poles[0]?.width || 0, y: 0}).x}px`,
            }">
              <template v-if="obstacle.liverpoolProperties?.hasRail">
                <div v-for="(pole, index) in obstacle.poles" :key="index" class="pole" :style="{
                  width: '100%',
                  height: `${scalePoint({x: 0, y: pole.height || 0}).y}px`,
                  background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
                }">
                  <div class="pole-shadow"></div>
                </div>
              </template>
              <div class="water" :style="{
                width: `${scalePoint({x: obstacle.liverpoolProperties?.width || 0, y: 0}).x}px`,
                height: `${scalePoint({x: 0, y: obstacle.liverpoolProperties?.waterDepth || 0}).y}px`,
                background: obstacle.liverpoolProperties?.waterColor,
                marginLeft: `${(scalePoint({x: obstacle.poles[0]?.width || 0, y: 0}).x - scalePoint({x: obstacle.liverpoolProperties?.width || 0, y: 0}).x) / 2}px`,
              }"></div>
            </div>
          </template>
          <template v-else>
            <!-- 默认使用横杆渲染 -->
            <div v-for="(pole, index) in obstacle.poles" :key="index" class="pole" :style="{
              width: `${scalePoint({x: pole.width || 0, y: 0}).x}px`,
              height: `${scalePoint({x: 0, y: pole.height || 0}).y}px`,
              background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
              marginBottom: pole.spacing ? `${scalePoint({x: 0, y: pole.spacing}).y}px` : '0',
            }">
              <div class="pole-shadow"></div>
            </div>
          </template>
        </template>
        <template v-else-if="obstacle.type === ObstacleType.WATER">
          <div class="water-obstacle" :style="{
            width: `${scalePoint({x: obstacle.waterProperties?.width || 0, y: 0}).x}px`,
            height: `${scalePoint({x: 0, y: obstacle.waterProperties?.depth || 0}).y}px`,
            background: obstacle.waterProperties?.color,
            borderColor: obstacle.waterProperties?.borderColor,
            borderWidth: `${scalePoint({x: 0, y: obstacle.waterProperties?.borderWidth || 0}).y}px`,
            borderStyle: 'solid'
          }"></div>
        </template>
        <!-- 装饰物缩放 -->
        <template v-else-if="obstacle.type === ObstacleType.DECORATION">
          <template v-if="obstacle.decorationProperties?.category === DecorationCategory.TREE">
            <div class="decoration-tree"
              style="position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;">
              <!-- 树冠 -->
              <div :style="{
                width: `${scalePoint({x: (obstacle.decorationProperties?.foliageRadius ?? 0) * 2, y: 0}).x}px`,
                height: `${scalePoint({x: 0, y: (obstacle.decorationProperties?.foliageRadius ?? 0) * 2}).y}px`,
                borderRadius: '50%',
                backgroundColor: obstacle.decorationProperties?.secondaryColor,
                position: 'absolute',
                top: '0',
                zIndex: '1'
              }"></div>
              <!-- 树干 -->
              <div :style="{
                width: `${scalePoint({x: obstacle.decorationProperties?.trunkWidth || 0, y: 0}).x}px`,
                height: `${scalePoint({x: 0, y: obstacle.decorationProperties?.trunkHeight || 0}).y}px`,
                backgroundColor: obstacle.decorationProperties?.color,
                position: 'absolute',
                bottom: '0',
                zIndex: '0'
              }"></div>
            </div>
          </template>
          <template v-else-if="obstacle.decorationProperties?.category === DecorationCategory.CUSTOM">
            <div v-if="obstacle.decorationProperties?.imageUrl" class="decoration-custom-image" :style="{
              width: `${scalePoint({x: obstacle.decorationProperties?.width || 0, y: 0}).x}px`,
              height: `${scalePoint({x: 0, y: obstacle.decorationProperties?.height || 0}).y}px`,
              backgroundImage: `url(${obstacle.decorationProperties.imageUrl})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }"></div>
            <div v-else class="decoration-custom-placeholder" :style="{
              width: `${scalePoint({x: obstacle.decorationProperties?.width || 0, y: 0}).x}px`,
              height: `${scalePoint({x: 0, y: obstacle.decorationProperties?.height || 0}).y}px`,
              backgroundColor: '#f0f0f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed #ccc',
              fontSize: '12px',
              color: '#999'
            }">
              自定义
            </div>
          </template>
          <template v-else>
            <!-- 其他装饰物类型 -->
            <div class="decoration-table" :style="{
              width: `${scalePoint({x: obstacle.decorationProperties?.width || 0, y: 0}).x}px`,
              height: `${scalePoint({x: 0, y: obstacle.decorationProperties?.height || 0}).y}px`,
              backgroundColor: obstacle.decorationProperties?.color,
              borderColor: obstacle.decorationProperties?.borderColor,
              borderWidth: `${scalePoint({x: 0, y: obstacle.decorationProperties?.borderWidth || 0}).y}px`,
              borderStyle: 'solid',
              color: obstacle.decorationProperties?.textColor
            }">
              <span class="decoration-text">{{ obstacle.decorationProperties?.text }}</span>
            </div>
          </template>
        </template>
        <!-- 添加对基础横杆障碍物类型(SINGLE、DOUBLE、COMBINATION)的渲染条件 -->
        <template v-else>
          <!-- 默认使用横杆渲染 -->
          <div v-for="(pole, index) in obstacle.poles" :key="index" class="pole" :style="{
            width: `${scalePoint({x: pole.width || 0, y: 0}).x}px`,
            height: `${scalePoint({x: 0, y: pole.height || 0}).y}px`,
            background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
            marginBottom: pole.spacing ? `${scalePoint({x: 0, y: pole.spacing}).y}px` : '0',
          }">
            <div class="pole-shadow"></div>
          </div>
        </template>
      </div>
      <div class="obstacle-controls" v-if="isSelected(obstacle)">
        <div class="rotation-handle" @pointerdown.stop="startRotating($event, obstacle)"></div>
      </div>
    </div>

    <template v-for="obstacle in courseStore.currentCourse.obstacles" :key="`numbers-${obstacle.id}`">
      <div v-for="(pole, filteredIndex) in obstacle.poles.filter((p) => p.number)" :key="`number-${filteredIndex}`"
        class="pole-number"
        :class="{
          'dragging': isDraggingNumber && draggingNumberObstacle?.id === obstacle.id && draggingPoleIndex === obstacle.poles.findIndex(p => p === pole),
          'obstacle-dragging': isDragging && selectedObstacles.some(obs => obs.id === obstacle.id)
        }"
        @pointerdown.stop="startDraggingPoleNumber($event, obstacle, obstacle.poles.findIndex(p => p === pole))" :style="{
          position: 'absolute',
          left: `${scalePoint({ x: obstacle.position.x + (pole.numberPosition?.x ?? 0), y: 0 }).x}px`,
          top: `${scalePoint({ x: 0, y: obstacle.position.y + (pole.numberPosition?.y ?? -3) }).y}px`,
          transform: 'translate(-50%, -50%)',
          transition: isDragging && selectedObstacles.some(obs => obs.id === obstacle.id) ? 'none' : 'all 0.1s ease',
        }">
        {{ pole.number }}
      </div>
    </template>

    <div class="canvas-placeholder" v-if="!courseStore.currentCourse.obstacles.length">
      <el-icon :size="48" class="placeholder-icon">
        <Plus />
      </el-icon>
      <p>从左侧拖拽障碍物到此处</p>
    </div>
    <div v-show="isSelecting" class="selection-box" :style="selectionStyle"></div>

    <div v-if="courseStore.coursePath.visible" class="course-path">
      <div class="path-indicator start-indicator"
        :class="{ 'selected': draggingPoint === 'start' || draggingPoint === 'start-rotate' }" :style="startStyle"
        @pointerdown.stop="startDraggingPoint('start', $event)">
        <div class="direction-arrow">
          <div class="arrow-line"></div>
          <div class="arrow-head"></div>
        </div>
        <div class="path-line"></div>
        <div class="rotation-handle" @pointerdown.stop="startRotatingPoint('start', $event)"></div>
      </div>

      <div class="path-indicator end-indicator"
        :class="{ 'selected': draggingPoint === 'end' || draggingPoint === 'end-rotate' }" :style="endStyle"
        @pointerdown.stop="startDraggingPoint('end', $event)">
        <div class="direction-arrow">
          <div class="arrow-line"></div>
          <div class="arrow-head"></div>
        </div>
        <div class="path-line"></div>
        <div class="rotation-handle" @pointerdown.stop="startRotatingPoint('end', $event)"></div>
      </div>

      <!-- 添加 SVG 路径渲染 -->
      <svg class="course-path-svg">
        <!-- 渲染路径 -->
        <path v-for="(segment, index) in pathSegments" :key="`path-${index}`" :d="segment" class="course-path-line"
          fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-dasharray="5,5" />

        <!-- 渲染距离标签 -->
        <template v-if="showDistanceLabels">
          <g v-for="(distance, index) in obstacleDistances" :key="`distance-${index}`">
            <g
              :transform="`translate(${distance.position.x}, ${distance.position.y}) rotate(${adjustLabelAngle(distance.angle)})`">
              <rect x="-25" y="-12" width="50" height="24" rx="4" ry="4" class="distance-label-bg" />
              <text x="0" y="5" class="distance-label-text">
                {{ distance.distance }}m
              </text>
              <text v-if="distance.fromNumber && distance.toNumber" x="0" y="-20" class="obstacle-number-text">
                {{ distance.fromNumber }} → {{ distance.toNumber }}
              </text>
            </g>
          </g>
        </template>

        <!-- 渲染控制点 -->
        <template v-for="(point, pointIndex) in courseStore.coursePath.points" :key="`points-${pointIndex}`">
          <!-- 只在非直线部分显示控制点 -->
          <circle v-if="showDistanceLabels && shouldRenderControlPoint(pointIndex, 1)"
            :cx="scalePoint(point.controlPoint1).x"
            :cy="scalePoint(point.controlPoint1).y"
            :r="draggingControlPoint?.pointIndex === pointIndex && draggingControlPoint?.controlPointNumber === 1 ? 8 : 6"
            class="control-point" @pointerdown.stop="startDraggingControlPoint(pointIndex, 1, $event)" />
          <circle v-if="showDistanceLabels && shouldRenderControlPoint(pointIndex, 2)"
            :cx="scalePoint(point.controlPoint2).x"
            :cy="scalePoint(point.controlPoint2).y"
            :r="draggingControlPoint?.pointIndex === pointIndex && draggingControlPoint?.controlPointNumber === 2 ? 8 : 6"
            class="control-point" @pointerdown.stop="startDraggingControlPoint(pointIndex, 2, $event)" />
        </template>
      </svg>

      <!-- 添加总距离显示 -->
      <div v-if="showDistanceLabels && Number(totalDistance) > 0" class="total-distance">
        总距离: {{ totalDistance }}m
      </div>
    </div>

    <!-- 添加距离标签显示控制按钮 -->
    <div v-if="courseStore.coursePath.visible" class="distance-toggle">
      <el-tooltip content="显示/隐藏距离标签和控制点" placement="left">
        <el-button type="primary" circle size="small" :icon="showDistanceLabels ? 'Hide' : 'View'"
          @click="toggleDistanceLabels">
          <el-icon v-if="showDistanceLabels">
            <Hide />
          </el-icon>
          <el-icon v-else>
            <View />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="删除路线" placement="left">
        <el-button type="danger" circle size="small" @click="handleDeletePath">
          <el-icon>
            <Delete />
          </el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </div>

  <el-dialog v-model="sizeDialogVisible" title="设置场地尺寸" width="400px" :close-on-click-modal="false">
    <el-form label-position="top">
      <el-form-item label="场地宽度 (米)">
        <el-input-number v-model="tempFieldSize.width" :min="40" :max="200" :step="5" controls-position="right"
          class="full-width" />
      </el-form-item>
      <el-form-item label="场地高度 (米)">
        <el-input-number v-model="tempFieldSize.height" :min="20" :max="150" :step="5" controls-position="right"
          class="full-width" />
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
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { Plus, Edit, Hide, View, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useCourseStore } from '@/stores/course'
import { useObstacleStore } from '@/stores/obstacle'
import { useUserStore } from '@/stores/user'
import { ObstacleType, DecorationCategory } from '@/types/obstacle'
import type { Obstacle, PathPoint, CustomObstacleTemplate } from '@/types/obstacle'
import { ConnectionStatus, useWebSocketStore } from '@/stores/websocket'

type CanvasInteractionEvent = MouseEvent | PointerEvent

// 组件状态管理
const courseStore = useCourseStore()
// const obstacleStore = useObstacleStore()
const webSocketStore = useWebSocketStore()
const selectedObstacles = ref<Obstacle[]>([]) // 当前选中的障碍物列表
const draggingObstacle = ref<Obstacle | null>(null) // 当前正在拖动的障碍物
const isDragging = ref(false) // 是否正在拖动
const isRotating = ref(false) // 是否正在旋转
const isDraggingNumber = ref(false)
const draggingNumberObstacle = ref<Obstacle | null>(null)
const draggingPoleIndex = ref<number | null>(null)
const activePointerId = ref<number | null>(null)
const startPos = ref<Record<string, { x: number; y: number }>>({})
const startMousePos = ref({ x: 0, y: 0 }) // 开始位置
const startPointPos = ref<{ x: number; y: number } | null>(null) // 起终点拖拽时的初始位置
const canvasContainerRef = ref<HTMLElement | null>(null) // 修改ref名称

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

// 距离标签显示控制
const showDistanceLabels = ref(true)

// 协作状态
const isCollaborating = ref(false)

// 取出需要使用的 WebSocket 状态和方法
const {
  collaborators,
  connectionStatus,
  isCollaborating: wsIsCollaborating,
  sendAddObstacle,
  sendObstacleUpdate,
  sendRemoveObstacle,
  sendPathUpdate,
  connect,
  disconnect
} = webSocketStore

// 自定义障碍物模板缓存
const customTemplateCache = ref<Map<string, CustomObstacleTemplate>>(new Map())
// 获取自定义障碍物模板
const getCustomTemplate = (obstacle: Obstacle): CustomObstacleTemplate | null => {
  if (obstacle.type !== ObstacleType.CUSTOM || !obstacle.customId) {
    return null
  }

  // 如果缓存中有，直接返回
  if (customTemplateCache.value.has(obstacle.customId)) {
    return customTemplateCache.value.get(obstacle.customId)!
  }

  // 否则从store中获取并缓存
  try {
    // 动态导入障碍物store
    const obstacleStore = useObstacleStore()
    const template = obstacleStore.getObstacleById(obstacle.customId)

    if (template) {
      customTemplateCache.value.set(obstacle.customId, template)
      return template
    } else {
      console.warn(`未找到ID为 ${obstacle.customId} 的自定义障碍物模板，尝试重新加载...`)
      // 如果没找到模板，尝试重新加载障碍物
      obstacleStore.initObstacles().then(() => {
        // 重新尝试获取
        const reloadedTemplate = obstacleStore.getObstacleById(obstacle.customId!)
        if (reloadedTemplate) {

          customTemplateCache.value.set(obstacle.customId!, reloadedTemplate)
        }
      })
    }

    return null // 如果没找到，返回null
  } catch (error) {
    console.error('获取自定义障碍物模板失败:', error)
    return null
  }
}

// 添加一个标志，用于标识路径更新是否来自WebSocket
const isPathUpdateFromWebSocket = ref(false)

// 监听路径变化，同步到其他协作者
watch(() => courseStore.coursePath, (newPath) => {
  // 如果更新来自WebSocket，不再发送更新消息，避免循环更新
  if (isPathUpdateFromWebSocket.value) {
    isPathUpdateFromWebSocket.value = false
    return
  }

  if (wsIsCollaborating) {
    // 使用路径ID和更新内容调用sendPathUpdate
    sendPathUpdate(courseStore.currentCourse.id, {
      visible: newPath.visible,
      points: newPath.points,
      startPoint: courseStore.startPoint,
      endPoint: courseStore.endPoint
    })
  }
}, { deep: true })

// 添加协作控制方法
const startCollaboration = async (viaLink = false) => {
  const designId = courseStore.currentCourse.id

  // 验证设计ID
  if (!designId) {
    console.error('无法开始协作：设计ID为空')
    return false
  }

  // 检查WebSocket连接状态

  // 如果已经在协作中且已连接，则不重复启动
  if (wsIsCollaborating && connectionStatus === ConnectionStatus.CONNECTED) {
    // 触发自定义事件，通知App.vue更新状态
    const event = new CustomEvent('collaboration-connected', {
      bubbles: true,
      detail: {
        timestamp: new Date().toISOString(),
        session: webSocketStore.session,
        delayed: true
      }
    })
    document.dispatchEvent(event)
    return true
  }

  // 设置协作状态为true
  isCollaborating.value = true

  // 设置协作钩子
  setupCollaborationHooks()

  // 保存通过链接加入的标志到localStorage，以便其他组件可以使用
  localStorage.setItem('via_link', viaLink.toString())

  // 连接WebSocket，传递通过链接加入的标志
  courseStore.setCurrentCourseId(designId)
  connect(designId, viaLink)

  // 等待一段时间，确保WebSocket有足够时间连接
  await new Promise(resolve => setTimeout(resolve, 1000))

  // 如果连接成功但未触发事件，手动触发connected事件
  if (connectionStatus === ConnectionStatus.CONNECTED && !isCollaborating.value) {
    const event = new CustomEvent('collaboration-connected', {
      bubbles: true,
      detail: {
        timestamp: new Date().toISOString(),
        session: webSocketStore.session
      }
    })
    document.dispatchEvent(event)
  }

  // 检查协作者列表

  // 如果是通过链接加入（即协作者），直接请求创建者的画布状态
  if (viaLink && connectionStatus === ConnectionStatus.CONNECTED) {

    // 延迟一秒发送请求，确保连接已完全建立
    setTimeout(() => {

      // 创建一个特殊的JOIN消息，包含请求画布状态的标志
      const userStore = useUserStore()
      if (!userStore.currentUser) {
        console.error('用户未登录，无法发送请求')
        return
      }

      // 生成随机颜色
      const colors = [
        '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
        '#1abc9c', '#d35400', '#c0392b', '#16a085', '#8e44ad'
      ]
      const randomColor = colors[Math.floor(Math.random() * colors.length)]

      // 构建JOIN消息
      const joinMessage = {
        type: 'join',
        senderId: String(userStore.currentUser.id),
        senderName: userStore.currentUser.username || '未知用户',
        sessionId: '',
        timestamp: new Date().toISOString(),
        payload: {
          userId: userStore.currentUser.id,
          username: userStore.currentUser.username || '未知用户',
          color: randomColor,
          viaLink: true,
          requestCanvasState: true, // 请求画布状态的标志
          clientInfo: {
            browser: navigator.userAgent,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            timestamp: new Date().toISOString()
          }
        }
      }

      // 发送JOIN消息
      try {
        const socket = webSocketStore.$state.socket
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(joinMessage))
        } else {
          console.error('WebSocket未连接，无法发送特殊JOIN消息')
        }
      } catch (error) {
        console.error('发送特殊JOIN消息失败:', error)
      }
    }, 1000)
  }

  // 返回成功
  return true
}

const stopCollaboration = async (): Promise<boolean> => {

  // 添加检查，如果当前不在协作中，直接返回
  if (!isCollaborating.value) {
    return true
  }

  try {
    // 先断开WebSocket连接

    // 先更新状态，确保UI立即响应
    // 触发自定义事件通知App.vue更新状态
    const event = new CustomEvent('collaboration-stopped', {
      bubbles: true,
      detail: { timestamp: new Date().toISOString(), reason: '用户主动退出' },
    })
    document.dispatchEvent(event)

    // 然后断开连接
    disconnect()

    // 清除通过链接加入的标志
    localStorage.removeItem('via_link')
    localStorage.removeItem('sync_requested')

    // 清除已加入协作者列表
    localStorage.removeItem('joined_collaborators')

    // 清除防抖相关的存储
    // 查找并清除所有以sync_response_sent_和canvas_state_sent_开头的项
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sync_response_sent_') ||
        key.startsWith('canvas_state_sent_') ||
        key.startsWith('collaborator_joined_')) {
        localStorage.removeItem(key)
      }
    })

    // 移除协作功能的钩子
    try {
      removeCollaborationHooks()
    } catch (hookError) {
      console.error('移除协作钩子时出错:', hookError)
    }

    return true
  } catch (error) {
    console.error('停止协作时出错:', error)

    // 触发自定义事件
    try {
      const event = new CustomEvent('collaboration-stopped', {
        bubbles: true,
        detail: { timestamp: new Date().toISOString(), error: true, reason: '未知错误' },
      })
      document.dispatchEvent(event)
    } catch (eventError) {
      console.error('发送错误状态的collaboration-stopped事件失败:', eventError)
    }

    return false
  }
}

// 设置协作钩子函数
const setupCollaborationHooks = () => {
  // 这里可以添加更多的协作钩子
  // 添加协作者列表变化监听
  watch(collaborators, (newCollaborators) => {
  }, { deep: true })
}

// 移除协作钩子函数
const removeCollaborationHooks = () => {
  // 这里可以移除协作钩子
}

// 修改清空画布的方法
const handleClearCanvas = () => {
  // 先清除路线（这会同时处理可见性和起终点）
  courseStore.clearPath()

  // 清除所有障碍物
  courseStore.currentCourse.obstacles.forEach(obstacle => {
    courseStore.removeObstacle(obstacle.id)

    // 如果在协作模式下，发送移除障碍物消息
    if (isCollaborating.value) {
      sendRemoveObstacle(obstacle.id)
    }
  })

  // 清除选中状态
  clearSelection()

  // 清除本地存储的 design_id_to_update
  localStorage.removeItem('design_id_to_update')
}

// 切换距离标签显示
const toggleDistanceLabels = () => {
  showDistanceLabels.value = !showDistanceLabels.value

  // 获取所有控制点和控制线元素
  const controlElements = document.querySelectorAll('.control-point, .control-line')

  // 更新控制点和控制线的可见性
  controlElements.forEach(element => {
    if (showDistanceLabels.value) {
      // 显示控制点和控制线
      element.classList.remove('hidden-control')
    } else {
      // 隐藏控制点和控制线
      element.classList.add('hidden-control')
    }
  })
}

/**
 * 发送完整画布状态给指定用户
 * @param targetUserId 目标用户ID，如果不指定则发送给所有协作者
 */
const sendFullCanvasState = (targetUserId?: string) => {

  // 防抖处理：检查是否在短时间内已经发送过画布状态给该用户
  if (targetUserId) {
    const responseKey = `canvas_state_sent_${targetUserId}`
    const lastResponseTime = parseInt(localStorage.getItem(responseKey) || '0')
    const now = Date.now()
    const debounceTime = 10000 // 10秒内不重复发送

    if (now - lastResponseTime < debounceTime) {
      return
    }

    // 记录本次发送时间
    localStorage.setItem(responseKey, now.toString())
  }

  if (!isCollaborating.value) {
    console.warn('当前不在协作状态，无法发送画布状态')
    return
  }

  // 获取WebSocket store
  const webSocketStore = useWebSocketStore()

  // 获取当前用户信息
  const userStore = useUserStore()
  const currentUserId = userStore.currentUser?.id

  // 构建同步响应消息
  const syncResponse = {
    obstacles: JSON.parse(JSON.stringify(courseStore.currentCourse.obstacles)),
    path: {
      visible: courseStore.coursePath.visible,
      points: JSON.parse(JSON.stringify(courseStore.coursePath.points)),
      startPoint: courseStore.startPoint ? JSON.parse(JSON.stringify(courseStore.startPoint)) : null,
      endPoint: courseStore.endPoint ? JSON.parse(JSON.stringify(courseStore.endPoint)) : null
    },
    timestamp: new Date().toISOString(),
    targetUser: targetUserId // 指定目标用户
  }

  // 尝试使用WebSocket store的方法发送
  try {
    // 使用类型断言，但提供更具体的类型
    interface WebSocketStoreWithSendMessage {
      sendMessage: (type: string, payload: Record<string, unknown>) => boolean;
    }

    // 检查是否有sendMessage方法
    if (typeof (webSocketStore as unknown as WebSocketStoreWithSendMessage).sendMessage === 'function') {
      (webSocketStore as unknown as WebSocketStoreWithSendMessage).sendMessage('sync_response', syncResponse)
    } else {
      console.warn('webSocketStore中没有sendMessage方法，尝试直接发送')
    }
  } catch (error) {
    console.error('使用sendMessage方法发送同步响应失败:', error)
  }

  // 为确保消息能够正确发送，再次尝试直接发送
  try {
    interface WebSocketStoreWithState {
      $state: { socket: WebSocket | null };
      session?: { id: string };
    }

    const socket = (webSocketStore as unknown as WebSocketStoreWithState).$state?.socket

    if (socket && socket.readyState === WebSocket.OPEN) {
      const directMessage = {
        type: 'sync_response',
        senderId: String(currentUserId),
        senderName: userStore.currentUser?.username || '未知用户',
        sessionId: (webSocketStore as unknown as WebSocketStoreWithState).session?.id || '',
        timestamp: new Date().toISOString(),
        payload: syncResponse
      }

      socket.send(JSON.stringify(directMessage))
    }
  } catch (error) {
    console.error('直接发送同步响应失败:', error)
  }
}

// 判断当前用户是否为创建者
const isCreator = () => {
  // 获取WebSocket store
  const webSocketStore = useWebSocketStore()

  // 获取当前用户信息
  const userStore = useUserStore()
  const currentUserId = userStore.currentUser?.id

  // 获取会话信息
  interface WebSocketStoreWithSession {
    session?: { owner: string; id: string };
  }
  const session = (webSocketStore as unknown as WebSocketStoreWithSession).session
  const sessionOwnerId = session?.owner

  // 判断当前用户是否为所有者
  const isOwner = currentUserId && sessionOwnerId && String(currentUserId) === String(sessionOwnerId)

  // 检查是否通过链接加入
  const viaLink = localStorage.getItem('via_link') === 'true'

  return isOwner || !viaLink
}

// 导出系统集成方法
const getCanvasElement = (): HTMLElement | null => {
  return canvasContainerRef.value
}

const getCanvasInfo = () => {
  const canvas = canvasContainerRef.value
  if (!canvas) return null

  const rect = canvas.getBoundingClientRect()
  return {
    element: canvas,
    bounds: rect,
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
    scaleFactor: pathScaleFactor.value
  }
}

const prepareCanvasForExport = () => {
  const canvas = canvasContainerRef.value
  if (!canvas) return null

  // 隐藏控制元素
  const controlElements = canvas.querySelectorAll('.control-point, .control-line, .path-indicator .rotation-handle, .distance-toggle')
  const originalStyles: { element: HTMLElement, display: string, visibility: string }[] = []

  controlElements.forEach(element => {
    const el = element as HTMLElement
    originalStyles.push({
      element: el,
      display: el.style.display,
      visibility: el.style.visibility
    })
    el.style.display = 'none'
    el.style.visibility = 'hidden'
  })

  return {
    canvas,
    restore: () => {
      originalStyles.forEach(({ element, display, visibility }) => {
        element.style.display = display
        element.style.visibility = visibility
      })
    }
  }
}

const triggerExportEvent = (eventType: string, data?: unknown) => {
  const canvas = canvasContainerRef.value
  if (!canvas) return

  const event = new CustomEvent(`canvas-export-${eventType}`, {
    bubbles: true,
    detail: {
      canvasInfo: getCanvasInfo(),
      timestamp: new Date().toISOString(),
      ...data
    }
  })

  canvas.dispatchEvent(event)
}

// 暴露协作控制方法和路径更新标志
defineExpose({
  startCollaboration,
  stopCollaboration,
  handleClearCanvas,
  toggleDistanceLabels,
  isPathUpdateFromWebSocket, // 导出路径更新标志，供WebSocket处理函数使用
  sendFullCanvasState, // 导出发送完整画布状态方法
  isCreator, // 导出判断当前用户是否为创建者的方法
  // 导出系统集成方法
  getCanvasElement,
  getCanvasInfo,
  prepareCanvasForExport,
  triggerExportEvent
})

// 确保stopCollaboration方法可以被外部访问
window.debugCanvas = {
  startCollaboration,
  stopCollaboration
}
// 处理障碍物点击事件
const handleObstacleClick = (event: MouseEvent, obstacle: Obstacle) => {
  // 如果正在拖拽编号，阻止障碍物选择
  if (isDraggingNumber.value) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return
  }

  selectObstacle(obstacle, event.ctrlKey || event.metaKey)
}

// 选择障碍物
const selectObstacle = (obstacle: Obstacle, multiSelect = false) => {
  // 如果正在拖拽编号，阻止障碍物选择
  if (isDraggingNumber.value) {
    return
  }

  if (multiSelect) {
    // 如果是多选模式
    const index = selectedObstacles.value.findIndex((o) => o.id === obstacle.id)
    if (index === -1) {
      selectedObstacles.value.push(obstacle)
    } else {
      selectedObstacles.value.splice(index, 1)
    }
  } else {
    // 如果是单选模式
    selectedObstacles.value = [obstacle]
  }
  courseStore.selectedObstacle = selectedObstacles.value[0] // 保持兼容性

  // 如果在协作模式下，同步选择状态
  if (isCollaborating.value) {
    // 这里可以添加同步选择状态的代码
  }
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

const beginPointerInteraction = (event: CanvasInteractionEvent) => {
  if (!('pointerId' in event)) {
    return true
  }

  if (event.isPrimary === false) {
    return false
  }

  if (activePointerId.value !== null && activePointerId.value !== event.pointerId) {
    return false
  }

  activePointerId.value = event.pointerId
  return true
}

const matchesActivePointer = (event: PointerEvent) => {
  return activePointerId.value === null || activePointerId.value === event.pointerId
}

// 开始拖动障碍物
const startDragging = (event: CanvasInteractionEvent, obstacle: Obstacle) => {
  // 如果正在拖拽编号，阻止障碍物拖拽
  if (isDraggingNumber.value) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return
  }

  if (isRotating.value) return

  if (!beginPointerInteraction(event)) return

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
const startRotating = (event: CanvasInteractionEvent, obstacle: Obstacle) => {
  // 如果正在拖拽编号，阻止障碍物旋转
  if (isDraggingNumber.value) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return
  }

  if (!beginPointerInteraction(event)) return

  isRotating.value = true
  draggingObstacle.value = obstacle

  const rect = (event.currentTarget as HTMLElement).closest('.obstacle')?.getBoundingClientRect()
  if (!rect) return

  // 计算旋转中心点（使用缩放后的坐标）
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

// 编号位置边界限制函数
// 优化的编号位置边界限制函数
const applyNumberPositionBounds = (position: { x: number; y: number }) => {
  // 简化边界限制，只做基本的范围检查，避免复杂计算
  const maxOffset = 200 // 简化为固定的最大偏移值
  const minOffset = -200

  // 应用简单的边界限制
  const boundedX = Math.max(minOffset, Math.min(maxOffset, position.x))
  const boundedY = Math.max(minOffset, Math.min(maxOffset, position.y))

  return { x: boundedX, y: boundedY }
}

// 开始拖动编号
const startDraggingPoleNumber = (
  event: CanvasInteractionEvent,
  obstacle: Obstacle,
  poleIndex: number,
) => {
  if (!beginPointerInteraction(event)) return

  // 阻止事件冒泡和默认行为，确保不会触发其他交互
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  // 设置编号拖拽状态
  isDraggingNumber.value = true
  draggingNumberObstacle.value = obstacle
  draggingPoleIndex.value = poleIndex
  startMousePos.value = { x: event.clientX, y: event.clientY }

  // 记录编号的初始位置（使用原始坐标）
  const pole = obstacle.poles[poleIndex]
  startPos.value = {
    [obstacle.id]: {
      x: pole.numberPosition?.x ?? 0,
      y: pole.numberPosition?.y ?? -3,
    },
  }

  // 确保其他拖拽状态被清除
  isDragging.value = false
  isRotating.value = false
  isSelecting.value = false
  draggingObstacle.value = null
}

// 处理鼠标移动
const handleMouseMove = (event: CanvasInteractionEvent) => {
  // 如果正在拖拽编号，阻止其他交互操作
  if (isDraggingNumber.value) {
    event.preventDefault()
    event.stopPropagation()

    // 处理编号拖拽逻辑
    if (draggingNumberObstacle.value && draggingPoleIndex.value !== null) {
      // 计算鼠标移动距离
      const deltaX = event.clientX - startMousePos.value.x
      const deltaY = event.clientY - startMousePos.value.y

      // 将屏幕坐标转换为相对于障碍物的坐标
      const canvasRect = canvasContainerRef.value?.getBoundingClientRect()
      if (!canvasRect) return

      // 获取初始编号位置
      const initialPosition = startPos.value[draggingNumberObstacle.value.id]
      if (!initialPosition) return

      // 缓存缩放因子，避免重复计算
      const scaleFactor = meterScale.value

      // 计算新的相对位置（考虑缩放因子）
      const newRelativePosition = {
        x: initialPosition.x + deltaX / scaleFactor,
        y: initialPosition.y + deltaY / scaleFactor
      }

      // 应用边界限制
      const boundedPosition = applyNumberPositionBounds(newRelativePosition)

      // 直接更新障碍物的编号位置，避免通过store造成延迟
      const pole = draggingNumberObstacle.value.poles[draggingPoleIndex.value]
      if (pole) {
        // 直接修改pole对象的numberPosition属性，确保响应式更新
        if (!pole.numberPosition) {
          pole.numberPosition = { x: 0, y: -3 }
        }
        // 直接赋值，避免Object.assign的开销
        pole.numberPosition.x = boundedPosition.x
        pole.numberPosition.y = boundedPosition.y
      }

      // 如果在协作模式下，发送编号位置更新
      if (isCollaborating.value) {
        // 使用防抖机制避免过度发送消息
        const now = Date.now()
        const lastUpdateTimeStr = localStorage.getItem(`lastNumberUpdateTime_${draggingNumberObstacle.value.id}_${draggingPoleIndex.value}`)
        const lastUpdateTime = lastUpdateTimeStr ? parseInt(lastUpdateTimeStr) : 0

        if (now - lastUpdateTime > 100) { // 100ms防抖
          try {
            // 发送更新后的poles数组
            const result = sendObstacleUpdate(draggingNumberObstacle.value.id, {
              poles: [...draggingNumberObstacle.value.poles]
            })
            if (result) {
              localStorage.setItem(`lastNumberUpdateTime_${draggingNumberObstacle.value.id}_${draggingPoleIndex.value}`, now.toString())
            }
          } catch (error) {
            console.error('发送编号位置更新消息时出错:', error)
          }
        }
      }
    }
    return // 早期返回，阻止其他事件处理
  }

  // 更新框选区域
  if (isSelecting.value) {
    updateSelection(event)
  }

  // 处理障碍物拖拽
  if (isDragging.value) {
    // 计算鼠标移动距离（需要考虑缩放）
    const deltaX = (event.clientX - startMousePos.value.x) / meterScale.value
    const deltaY = (event.clientY - startMousePos.value.y) / meterScale.value

    // 更新所有选中障碍物的位置
    selectedObstacles.value.forEach((obstacle) => {
      if (startPos.value[obstacle.id]) {
        const startPosition = startPos.value[obstacle.id]
        const newPosition = {
          x: startPosition.x + deltaX,
          y: startPosition.y + deltaY,
        }

        // 直接修改障碍物对象的位置属性，确保标号能够实时跟随
        // 使用 Object.assign 来确保响应式更新
        Object.assign(obstacle.position, newPosition)

        // 在拖拽过程中，只更新位置，不触发路径重新计算和其他复杂操作
        // 使用 sendUpdate = false 来避免协作消息的频繁发送
        courseStore.updateObstacle(obstacle.id, {
          position: { ...newPosition },
        }, false)

        // 如果在协作模式下，发送障碍物更新消息
        if (isCollaborating.value) {
          // 获取上次发送的位置
          let lastSentPosition = null
          const lastPositionStr = localStorage.getItem(`lastPosition_${obstacle.id}`)
          if (lastPositionStr) {
            try {
              lastSentPosition = JSON.parse(lastPositionStr)
            } catch (e) {
              console.error('解析上次位置失败:', e)
            }
          }

          // 检查位置是否有实际变化（至少移动1像素）
          const hasPositionChanged = !lastSentPosition ||
            Math.abs(newPosition.x - lastSentPosition.x) > 1 ||
            Math.abs(newPosition.y - lastSentPosition.y) > 1

          // 使用当前时间戳来节流发送消息，每100毫秒发送一次（减少节流时间，提高流畅度）
          const now = Date.now()
          // 从localStorage获取上次更新时间，而不是从obstacle对象上获取
          const lastUpdateTimeStr = localStorage.getItem(`lastUpdateTime_${obstacle.id}`)
          const lastUpdateTime = lastUpdateTimeStr ? parseInt(lastUpdateTimeStr) : 0

          // 减小位置变化的阈值，只要移动超过1像素就发送更新，提高流畅度
          const hasSignificantPositionChange = !lastSentPosition ||
            Math.abs(newPosition.x - lastSentPosition.x) > 1 ||
            Math.abs(newPosition.y - lastSentPosition.y) > 1

          if (hasPositionChanged && hasSignificantPositionChange && (now - lastUpdateTime > 100)) {
            // 创建一个新的位置对象，避免引用问题
            const positionToSend = { ...newPosition }

            // 尝试发送消息
            try {
              const result = sendObstacleUpdate(obstacle.id, { position: positionToSend })
              if (result) {
                // 更新最后发送时间到localStorage
                localStorage.setItem(`lastUpdateTime_${obstacle.id}`, now.toString())
                // 将最后发送的位置保存到localStorage，以便在需要时重新发送
                localStorage.setItem(`lastPosition_${obstacle.id}`, JSON.stringify(positionToSend))
              } else {
                console.error('障碍物位置更新消息发送失败')
              }
            } catch (error) {
              console.error('发送障碍物位置更新消息时出错:', error)
            }
          }
        }
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

    // 更新本地障碍物旋转角度
    courseStore.updateObstacle(draggingObstacle.value.id, {
      rotation: newRotation,
    })

    // 如果在协作模式下，发送障碍物旋转更新消息
    if (isCollaborating.value) {
      // 获取上次发送的旋转角度
      let lastSentRotation = null
      const lastRotationStr = localStorage.getItem(`lastRotation_${draggingObstacle.value.id}`)
      if (lastRotationStr) {
        try {
          lastSentRotation = JSON.parse(lastRotationStr)
        } catch (e) {
          console.error('解析上次旋转角度失败:', e)
        }
      }

      // 检查旋转角度是否有实际变化（至少1度）
      const hasRotationChanged = lastSentRotation === null ||
        Math.abs(newRotation - lastSentRotation) > 1

      // 使用当前时间戳来节流发送消息，每100毫秒发送一次（减少节流时间，提高流畅度）
      const now = Date.now()
      // 从localStorage获取上次更新时间，而不是从obstacle对象上获取
      const lastRotationTimeStr = localStorage.getItem(`lastRotationTime_${draggingObstacle.value.id}`)
      const lastRotationTime = lastRotationTimeStr ? parseInt(lastRotationTimeStr) : 0

      // 减小角度变化的阈值，只要旋转超过1度就发送更新，提高流畅度
      const hasSignificantRotationChange = lastSentRotation === null ||
        Math.abs(newRotation - lastSentRotation) > 1

      if (hasRotationChanged && hasSignificantRotationChange && (now - lastRotationTime > 100)) {
        try {
          const result = sendObstacleUpdate(draggingObstacle.value.id, { rotation: newRotation })
          if (result) {
            // 更新最后发送时间到localStorage
            localStorage.setItem(`lastRotationTime_${draggingObstacle.value.id}`, now.toString())
            // 将最后发送的旋转角度保存到localStorage
            localStorage.setItem(`lastRotation_${draggingObstacle.value.id}`, JSON.stringify(newRotation))
          } else {
            console.error('障碍物旋转更新消息发送失败')
          }
        } catch (error) {
          console.error('发送障碍物旋转更新消息时出错:', error)
        }
      }
    }
  }

  // 处理起终点拖拽
  if (draggingPoint.value === 'start' || draggingPoint.value === 'end') {
    if (!startPointPos.value) {
      return
    }

    // 计算鼠标移动距离（像素），转换为米
    const deltaX = (event.clientX - startMousePos.value.x) / meterScale.value
    const deltaY = (event.clientY - startMousePos.value.y) / meterScale.value

    // 计算新位置
    const newPosition = {
      x: startPointPos.value.x + deltaX,
      y: startPointPos.value.y + deltaY,
    }

    if (draggingPoint.value === 'start') {
      courseStore.updateStartPoint(newPosition)

      // 如果在协作模式下，发送路径更新
      if (isCollaborating.value) {
        sendPathUpdate(courseStore.currentCourse.id, {
          visible: courseStore.coursePath.visible,
          points: courseStore.coursePath.points,
          startPoint: courseStore.startPoint,
          endPoint: courseStore.endPoint
        })
      }
    } else {
      courseStore.updateEndPoint(newPosition)

      // 如果在协作模式下，发送路径更新
      if (isCollaborating.value) {
        sendPathUpdate(courseStore.currentCourse.id, {
          visible: courseStore.coursePath.visible,
          points: courseStore.coursePath.points,
          startPoint: courseStore.startPoint,
          endPoint: courseStore.endPoint
        })
      }
    }
  } else if (draggingPoint.value === 'start-rotate' || draggingPoint.value === 'end-rotate') {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const pointPos =
      draggingPoint.value === 'start-rotate' ? courseStore.startPoint : courseStore.endPoint

    // 使用缩放后的坐标计算中心点
    const scaledPoint = scalePoint(pointPos)
    const centerX = rect.left + scaledPoint.x
    const centerY = rect.top + scaledPoint.y

    // 计算当前角度
    const currentAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI)
    const startAngle = startMousePos.value.x
    const startRotation = startMousePos.value.y

    // 计算角度差值，使用改进的方法
    let deltaAngle = currentAngle - startAngle
    // 确保角度差值在-180到180度之间
    deltaAngle = ((deltaAngle + 180) % 360) - 180

    // 计算新的旋转角度
    let newRotation = startRotation + deltaAngle
    // 规范化到0-360度范围
    newRotation = ((newRotation % 360) + 360) % 360

    // 更新旋转角度
    if (draggingPoint.value === 'start-rotate') {
      courseStore.updateStartRotation(newRotation)
    } else {
      courseStore.updateEndRotation(newRotation)
    }

    // 如果在协作模式下，发送路径更新
    if (isCollaborating.value) {
      sendPathUpdate(courseStore.currentCourse.id, {
        visible: courseStore.coursePath.visible,
        points: courseStore.coursePath.points,
        startPoint: courseStore.startPoint,
        endPoint: courseStore.endPoint
      })
    }
  }

  // 处理控制点拖拽
  if (draggingControlPoint.value) {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    // 直接使用鼠标位置，不再加上偏移量
    const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
    const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height))

    // 将屏幕坐标转换回原始坐标
    const unscaledPoint = unscalePoint({ x, y })

    courseStore.updateControlPoint(
      draggingControlPoint.value.pointIndex,
      draggingControlPoint.value.controlPointNumber,
      unscaledPoint
    )

    // 应用增强的弧线形变
    applyEnhancedCurveEffect(draggingControlPoint.value.pointIndex, draggingControlPoint.value.controlPointNumber)

    // 如果在协作模式下，发送路径更新
    if (isCollaborating.value) {
      sendPathUpdate(courseStore.currentCourse.id, {
        visible: courseStore.coursePath.visible,
        points: courseStore.coursePath.points,
        startPoint: courseStore.startPoint,
        endPoint: courseStore.endPoint
      })
    }
  }


}

// 处理拖放新障碍物
const handleDrop = (event: DragEvent) => {
  event.preventDefault()

  // 获取拖放的数据
  const obstacleData = event.dataTransfer?.getData('text/plain')

  if (!obstacleData) {
    console.error('拖放事件中没有障碍物数据')
    return
  }

  // 获取鼠标在画布上的位置
  const canvasRect = canvasContainerRef.value?.getBoundingClientRect()
  if (!canvasRect) {
    console.error('无法获取画布位置')
    return
  }

  // 计算鼠标在画布上的位置（需要考虑缩放）
  const screenX = event.clientX - canvasRect.left
  const screenY = event.clientY - canvasRect.top

  // 将屏幕坐标转换为原始坐标
  const position = unscalePoint({ x: screenX, y: screenY })

  // 检查是否是自定义障碍物
  if (obstacleData.startsWith('CUSTOM:')) {
    // 处理自定义障碍物
    const customId = obstacleData.substring(7) // 移除前缀 "CUSTOM:"

    try {
      // 动态导入障碍物存储
      import('@/stores/obstacle').then(({ useObstacleStore }) => {
        const obstacleStore = useObstacleStore()
        const template = obstacleStore.getObstacleById(customId)

        if (!template) {
          console.error('未找到自定义障碍物模板:', customId)
          return
        }

        // 从模板创建新障碍物
        const newObstacle: Omit<Obstacle, 'id'> = {
          type: ObstacleType.CUSTOM,
          position: position, // 使用转换后的坐标
          rotation: 0,
          poles: JSON.parse(JSON.stringify(template.poles)),
          customId: template.id,
        }

        // 根据基础类型添加相应属性
        if (template.baseType === ObstacleType.WALL && template.wallProperties) {
          newObstacle.wallProperties = JSON.parse(JSON.stringify(template.wallProperties))
        } else if (template.baseType === ObstacleType.LIVERPOOL && template.liverpoolProperties) {
          newObstacle.liverpoolProperties = JSON.parse(JSON.stringify(template.liverpoolProperties))
        } else if (template.baseType === ObstacleType.DECORATION && template.decorationProperties) {
          // 添加装饰物属性
          newObstacle.decorationProperties = JSON.parse(JSON.stringify(template.decorationProperties))
          // 确保类型正确设置为DECORATION
          newObstacle.type = ObstacleType.DECORATION
        } else if (template.baseType === ObstacleType.WATER && template.waterProperties) {
          // 添加水障属性
          newObstacle.waterProperties = JSON.parse(JSON.stringify(template.waterProperties))
          // 确保类型正确设置
          newObstacle.type = ObstacleType.WATER
        }

        // 添加障碍物到本地
        const addedObstacle = courseStore.addObstacle(newObstacle)

        // 立即选中新添加的障碍物
        if (addedObstacle) {
          selectObstacle(addedObstacle, false)
        }

        // 如果在协作模式下，发送添加障碍物的消息
        if (isCollaborating.value) {

          if (!addedObstacle) {
            console.error('添加障碍物失败，无法发送消息')
            return
          }

          // 确保localStorage中的协作状态正确
          localStorage.setItem('isCollaborating', 'true')

          try {
            // 发送完整的障碍物数据，包括ID
            const result = sendAddObstacle(addedObstacle)

            if (!result) {
              // 如果发送失败，尝试重新连接WebSocket，但不退出协作模式

              // 确保协作状态保持为true
              isCollaborating.value = true
              localStorage.setItem('isCollaborating', 'true')

              // 检查是否有权限重连（会员或通过链接加入）
              const viaLinkValue = webSocketStore.viaLink || localStorage.getItem('via_link') === 'true'
              const userStore = useUserStore()
              const canReconnect = viaLinkValue || userStore.currentUser?.is_premium_active

              if (!canReconnect) {
                isCollaborating.value = false
                return
              }

              if (typeof connect === 'function') {
                // 使用静默模式连接，避免触发协作停止事件
                try {
                  connect(courseStore.currentCourse.id, viaLinkValue, true) // 使用保存的viaLink值，第三个参数为true表示静默模式
                  // 延迟后再次尝试发送
                  setTimeout(() => {
                    // 再次确保协作状态为true
                    localStorage.setItem('isCollaborating', 'true')

                    if (connectionStatus === ConnectionStatus.CONNECTED) {
                      sendAddObstacle(addedObstacle)
                    } else {
                      // 即使连接失败，也不退出协作模式
                    }
                  }, 1000)
                } catch (reconnectError) {
                  console.error('重连失败:', reconnectError)
                }
              }
            }
          } catch (error) {
            console.error('发送添加障碍物消息时出错:', error)
            // 即使发送失败，也不退出协作模式
            isCollaborating.value = true
            localStorage.setItem('isCollaborating', 'true')
          }
        }
      })
    } catch (error) {
      console.error('处理自定义障碍物时出错:', error)
    }

    return
  }

  // 检查是否是共享障碍物
  if (obstacleData.startsWith('SHARED:')) {
    // 处理共享障碍物
    const sharedId = obstacleData.substring(7) // 移除前缀 "SHARED:"

    try {
      // 动态导入障碍物存储
      import('@/stores/obstacle').then(({ useObstacleStore }) => {
        const obstacleStore = useObstacleStore()
        // 从共享障碍物列表中获取模板
        const template = obstacleStore.sharedObstacles.find(o => o.id === sharedId)

        if (!template) {
          console.error('未找到共享障碍物模板:', sharedId)
          return
        }

        // 从模板创建新障碍物
        const newObstacle: Omit<Obstacle, 'id'> = {
          type: ObstacleType.CUSTOM, // 初始设置为CUSTOM
          position: position, // 使用转换后的坐标
          rotation: 0,
          poles: JSON.parse(JSON.stringify(template.poles)),
          // 因为共享障碍物直接使用而不是引用，所以不设置customId
        }

        // 根据基础类型添加相应属性
        if (template.baseType === ObstacleType.WALL && template.wallProperties) {
          newObstacle.wallProperties = JSON.parse(JSON.stringify(template.wallProperties))
          newObstacle.type = ObstacleType.WALL
        } else if (template.baseType === ObstacleType.LIVERPOOL && template.liverpoolProperties) {
          newObstacle.liverpoolProperties = JSON.parse(JSON.stringify(template.liverpoolProperties))
          newObstacle.type = ObstacleType.LIVERPOOL
        } else if (template.baseType === ObstacleType.DECORATION && template.decorationProperties) {
          newObstacle.decorationProperties = JSON.parse(JSON.stringify(template.decorationProperties))
          newObstacle.type = ObstacleType.DECORATION
        } else if (template.baseType === ObstacleType.WATER && template.waterProperties) {
          newObstacle.waterProperties = JSON.parse(JSON.stringify(template.waterProperties))
          newObstacle.type = ObstacleType.WATER
        } else {
          // 对于基础类型，直接使用该类型
          newObstacle.type = template.baseType
        }

        // 添加障碍物到本地
        const addedObstacle = courseStore.addObstacle(newObstacle)

        // 立即选中新添加的障碍物
        if (addedObstacle) {
          selectObstacle(addedObstacle, false)
        }

        // 如果在协作模式下，发送添加障碍物的消息
        if (isCollaborating.value) {
          if (!addedObstacle) {
            console.error('添加障碍物失败，无法发送消息')
            return
          }
          sendAddObstacle(addedObstacle)
        }
      })
    } catch (error) {
      console.error('处理共享障碍物时出错:', error)
    }

    return
  }

  // 以下是处理内置障碍物类型
  // 创建新障碍物
  const newObstacle: Omit<Obstacle, 'id'> = {
    type: obstacleData as ObstacleType,
    position: position, // 使用转换后的坐标
    rotation: 0,
    poles: []
  }


  const meterScale = computed(() => {
    if (!canvasContainerRef.value) return 1
    const rect = canvasContainerRef.value.getBoundingClientRect()
    // 使用场地宽度计算比例，确保横杆宽度正确
    const scaleByWidth = rect.width / courseStore.currentCourse.fieldWidth
    // 使用场地高度计算比例，确保高度正确
    const scaleByHeight = rect.height / courseStore.currentCourse.fieldHeight
    // 使用较小的比例以保持宽高比
    return Math.min(scaleByWidth, scaleByHeight)
  })

  // 根据障碍物类型设置属性
  switch (obstacleData) {
    case ObstacleType.SINGLE:
    case 'SINGLE':
      newObstacle.poles = [{
        height: 0.5,
        width: 3.5,
        color: '#8B4513'
      }]
      break
    case ObstacleType.DOUBLE:
    case 'DOUBLE':
      newObstacle.poles = [
        {
          height: 0.5,
          width: 3.5,
          color: '#8B4513',
          spacing: 0.5,
        },
        {
          height: 0.5,
          width: 3.5,
          color: '#8B4513',
          spacing: 0
        }
      ]
      break
    case ObstacleType.COMBINATION:
    case 'COMBINATION':
      newObstacle.poles = [
        {
          height: 0.5,
          width: 3.5,
          color: '#8B4513',
          spacing: 0.5,
        },
        {
          height: 0.5,
          width: 3.5,
          color: '#8B4513',
          spacing: 0.5,
        },
        {
          height: 0.5,
          width: 3.5,
          color: '#8B4513',
          spacing: 0
        }
      ]
      break
    case ObstacleType.WALL:
    case 'WALL':
      newObstacle.wallProperties = {
        height: 1.5,
        width: 3.5,
        color: '#8B4513'
      }
      break
    case ObstacleType.LIVERPOOL:
    case 'LIVERPOOL':
      newObstacle.liverpoolProperties = {
        height: 0.5,
        width: 3.5,
        waterDepth: 0.3,
        waterColor: 'rgba(0, 100, 255, 0.3)',
        hasRail: true,
        railHeight: 0.2
      }
      newObstacle.poles = [{
        height: 0.5,
        width: 3.5,
        color: '#8B4513'
      }]
      break
    case ObstacleType.WATER:
    case 'WATER':
      newObstacle.waterProperties = {
        width: 3.5,
        depth: 2.0,
        color: 'rgba(0, 100, 255, 0.4)',
        borderColor: 'rgba(0, 50, 150, 0.5)',
        borderWidth: 0.1
      }
      newObstacle.poles = []
      break
    case ObstacleType.DECORATION:
    case 'DECORATION':
      newObstacle.decorationProperties = {
        category: DecorationCategory.TABLE,
        width: 4,
        height: 3,
        color: '#8B4513',
        borderColor: '#593b22',
        borderWidth: 2,
        text: '裁判桌',
        textColor: '#ffffff'
      }
      newObstacle.poles = []
      newObstacle.type = ObstacleType.DECORATION
      break
    default:
      console.warn('未知的障碍物类型:', obstacleData)
      newObstacle.poles = [{
        height: 0.5,
        width: 3.5,
        color: '#8B4513'
      }]
      break
  }

  // 添加障碍物到本地
  const addedObstacle = courseStore.addObstacle(newObstacle)

  // 立即选中新添加的障碍物，确保用户可以看到它的选中状态
  if (addedObstacle) {
    selectObstacle(addedObstacle, false)
  }

  // 如果在协作模式下，发送添加障碍物的消息
  if (isCollaborating.value) {

    if (!addedObstacle) {
      console.error('添加障碍物失败，无法发送消息')
      return
    }

    // 确保localStorage中的协作状态正确
    localStorage.setItem('isCollaborating', 'true')
    // 发送完整的障碍物数据，包括ID
    const result = sendAddObstacle(addedObstacle)

    if (!result) {
      // 如果发送失败，尝试重新连接WebSocket

      // 检查是否有权限重连（会员或通过链接加入）
      const viaLinkValue = webSocketStore.viaLink || localStorage.getItem('via_link') === 'true'
      const userStore = useUserStore()
      const canReconnect = viaLinkValue || userStore.currentUser?.is_premium_active

      if (!canReconnect) {
        isCollaborating.value = false
        return
      }

      if (typeof connect === 'function') {
        connect(courseStore.currentCourse.id, viaLinkValue, true) // 使用保存的viaLink值，静默模式重连
        // 延迟后再次尝试发送
        setTimeout(() => {
          if (connectionStatus === ConnectionStatus.CONNECTED) {
            sendAddObstacle(addedObstacle)
          }
        }, 1000)
      }
    }
  } else {
  }
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
const meterScale = computed(() => {
  if (!canvasContainerRef.value) return 1
  const rect = canvasContainerRef.value.getBoundingClientRect()
  // 使用场地宽度计算比例，确保横杆宽度正确
  const scaleByWidth = rect.width / courseStore.currentCourse.fieldWidth
  // 使用场地高度计算比例，确保高度正确
  const scaleByHeight = rect.height / courseStore.currentCourse.fieldHeight
  // 使用较小的比例以保持宽高比
  return Math.min(scaleByWidth, scaleByHeight)
})

// 计算比例尺长度（像素）
const scaleWidth = computed(() => {
  return 5 * meterScale.value // 5米的参考线
})

// 添加缩放比例的计算
const pathScaleFactor = computed(() => {
  // 获取原始设计的视口信息
  const originalViewportInfo = courseStore.currentCourse.viewportInfo;

  // 确保 originalViewportInfo 和其属性存在且有效
  if (!originalViewportInfo || !originalViewportInfo.canvasWidth || !originalViewportInfo.canvasHeight || originalViewportInfo.canvasWidth <= 0 || originalViewportInfo.canvasHeight <= 0) {
    console.warn("原始视口信息缺失或无效，使用基于场地尺寸的缩放因子。");
    // 使用基于场地尺寸的缩放因子作为备选方案
    return meterScale.value;
  }

  // 获取当前画布元素
  const currentCanvas = canvasContainerRef.value;
  if (!currentCanvas) {
    console.warn("当前画布引用不可用，使用基于场地尺寸的缩放因子。");
    return meterScale.value;
  }

  // 获取当前画布的尺寸
  const currentRect = currentCanvas.getBoundingClientRect();
  const currentWidth = currentRect.width;
  const currentHeight = currentRect.height;

  // 防止除以零或无效尺寸
  if (currentWidth <= 0 || currentHeight <= 0) {
    console.warn("当前画布尺寸无效，使用基于场地尺寸的缩放因子。");
    return meterScale.value;
  }

  // 计算宽度和高度的缩放比例
  const widthScale = currentWidth / originalViewportInfo.canvasWidth;
  const heightScale = currentHeight / originalViewportInfo.canvasHeight;

  // 使用较小的缩放比例以保持宽高比并适应较小维度的缩放
  const scale = Math.min(widthScale, heightScale);

  // 考虑设备像素比的影响
  const devicePixelRatio = window.devicePixelRatio || 1;
  const originalDevicePixelRatio = originalViewportInfo.devicePixelRatio || 1;
  const pixelRatioAdjustment = devicePixelRatio / originalDevicePixelRatio;

  // 应用像素比调整
  const adjustedScale = scale * pixelRatioAdjustment;

  // 检查计算出的缩放因子是否有效
  if (adjustedScale <= 0 || !isFinite(adjustedScale)) {
    console.warn(`计算出无效的缩放因子: ${adjustedScale}。将使用基于场地尺寸的缩放因子代替。
      W: ${currentWidth}/${originalViewportInfo.canvasWidth},
      H: ${currentHeight}/${originalViewportInfo.canvasHeight},
      DPR: ${devicePixelRatio}/${originalDevicePixelRatio}`);
    return meterScale.value;
  }

  return adjustedScale;
});

// 添加坐标点缩放函数
const scalePoint = (point: { x: number; y: number }) => {
  if (!point) {
    console.warn('尝试缩放空点，返回默认值 {x: 0, y: 0}')
    return { x: 0, y: 0 }
  }

  const scale = meterScale.value

  // 检查坐标是否有效
  if (typeof point.x !== 'number' || typeof point.y !== 'number' ||
    isNaN(point.x) || isNaN(point.y)) {
    console.warn(`尝试缩放无效点 ${JSON.stringify(point)}，返回默认值 {x: 0, y: 0}`)
    return { x: 0, y: 0 }
  }

  // 应用缩放
  const scaledX = point.x * scale
  const scaledY = point.y * scale

  // 检查缩放后的坐标是否有效
  if (isNaN(scaledX) || isNaN(scaledY) || !isFinite(scaledX) || !isFinite(scaledY)) {
    console.warn(`缩放后的坐标无效 {x: ${scaledX}, y: ${scaledY}}，使用原始坐标`)
    return { ...point }
  }

  // 返回缩放后的坐标
  return {
    x: scaledX,
    y: scaledY
  }
}

// 添加反向缩放函数
const unscalePoint = (point: { x: number; y: number }) => {
  if (!point) {
    console.warn('尝试反向缩放空点，返回默认值 {x: 0, y: 0}')
    return { x: 0, y: 0 }
  }

  const scale = meterScale.value

  // 防止除以零
  if (scale === 0) {
    console.warn('缩放因子为零，无法进行反向缩放，返回原始坐标')
    return { ...point }
  }

  // 检查坐标是否有效
  if (typeof point.x !== 'number' || typeof point.y !== 'number' ||
    isNaN(point.x) || isNaN(point.y)) {
    console.warn(`尝试反向缩放无效点 ${JSON.stringify(point)}，返回默认值 {x: 0, y: 0}`)
    return { x: 0, y: 0 }
  }

  // 应用反向缩放
  const unscaledX = point.x / scale
  const unscaledY = point.y / scale

  // 检查反向缩放后的坐标是否有效
  if (isNaN(unscaledX) || isNaN(unscaledY) || !isFinite(unscaledX) || !isFinite(unscaledY)) {
    console.warn(`反向缩放后的坐标无效 {x: ${unscaledX}, y: ${unscaledY}}，使用原始坐标`)
    return { ...point }
  }

  // 返回反向缩放后的坐标
  return {
    x: unscaledX,
    y: unscaledY
  }
}

// 修改 canvasStyle computed 属性
const canvasStyle = computed(() => {
  // 获取视口宽度和高度
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // 计算理想的宽高比
  const idealRatio = courseStore.currentCourse.fieldWidth / courseStore.currentCourse.fieldHeight

  // 获取原始设计的视口信息
  const originalViewportInfo = courseStore.currentCourse.viewportInfo

  // 检测设备方向
  const isLandscape = viewportWidth > viewportHeight

  // 计算比例调整因子
  let scaleFactor = 1
  if (originalViewportInfo) {
    // 计算当前视口和原始视口的宽度比例
    const widthRatio = viewportWidth / originalViewportInfo.width
    // 计算当前视口和原始视口的高度比例
    const heightRatio = viewportHeight / originalViewportInfo.height
    // 使用较小的比例作为缩放因子，确保内容完全显示
    scaleFactor = Math.min(widthRatio, heightRatio)

    // 考虑设备像素比
    const devicePixelRatio = window.devicePixelRatio || 1
    const originalDevicePixelRatio = originalViewportInfo.devicePixelRatio || 1

    // 应用像素比调整
    if (originalDevicePixelRatio > 0) {
      scaleFactor = scaleFactor * (devicePixelRatio / originalDevicePixelRatio)
    }

  }

  // 根据设备方向调整最大尺寸
  let maxWidth, maxHeight
  if (isLandscape) {
    // 横屏模式
    maxWidth = viewportWidth * 0.9 // 横屏时可以使用更多宽度
    maxHeight = viewportHeight * 0.85 // 横屏时高度限制稍微放宽
  } else {
    // 竖屏模式
    maxWidth = viewportWidth * 0.95 // 竖屏时宽度几乎占满
    maxHeight = viewportHeight * 0.7 // 竖屏时高度限制更严格，留出更多空间给其他UI元素
  }

  // 根据当前视口和场地比例，确定最合适的尺寸
  let width, height

  // 先尝试基于宽度计算
  width = maxWidth
  height = width / idealRatio

  // 如果高度超出了最大高度，则基于高度计算
  if (height > maxHeight) {
    height = maxHeight
    width = height * idealRatio
  }

  // 如果有原始视口信息并且缩放因子不为1，尝试使用原始画布尺寸和缩放因子
  if (originalViewportInfo && Math.abs(scaleFactor - 1) > 0.1 && originalViewportInfo.canvasWidth > 0) {
    // 基于原始画布尺寸和缩放因子计算新尺寸
    const adjustedWidth = originalViewportInfo.canvasWidth * scaleFactor
    const adjustedHeight = originalViewportInfo.canvasHeight * scaleFactor

    // 检查调整后的尺寸是否在允许范围内
    if (adjustedWidth <= maxWidth && adjustedHeight <= maxHeight) {
      // 如果在允许范围内，直接使用调整后的尺寸
      width = adjustedWidth
      height = adjustedHeight
    } else {
      // 否则，保持宽高比，但缩小到允许范围内
      const widthRatio = maxWidth / adjustedWidth
      const heightRatio = maxHeight / adjustedHeight
      const adjustmentRatio = Math.min(widthRatio, heightRatio)

      width = adjustedWidth * adjustmentRatio
      height = adjustedHeight * adjustmentRatio
    }

    // 确保尺寸不会太小
    width = Math.max(width, viewportWidth * 0.5)
    height = Math.max(height, viewportHeight * 0.3)

  }

  // 返回最终的样式
  return {
    width: `${width}px`,
    height: `${height}px`,
    aspectRatio: `${courseStore.currentCourse.fieldWidth}/${courseStore.currentCourse.fieldHeight}`,
    margin: '0 auto'
  }
})

// 根据场地尺寸计算网格大小
const gridSize = computed(() => ({
  width: `calc(100% / ${courseStore.currentCourse.fieldWidth})`,
  height: `calc(100% / ${courseStore.currentCourse.fieldHeight})`,
}))

// 处理键盘事件
const handleKeyDown = (event: KeyboardEvent) => {
  if ((event.target as HTMLElement)?.tagName === 'INPUT') return

  // 如果正在拖拽编号，阻止所有键盘快捷键操作
  if (isDraggingNumber.value) {
    // 只允许Escape键来取消编号拖拽
    if (event.key === 'Escape') {
      isDraggingNumber.value = false
      draggingNumberObstacle.value = null
      draggingPoleIndex.value = null
      event.preventDefault()
      event.stopPropagation()
    } else {
      // 阻止其他所有键盘操作
      event.preventDefault()
      event.stopPropagation()
    }
    return
  }

  // 如果按下Delete键，删除选中的障碍物
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedObstacles.value.length > 0) {
    selectedObstacles.value.forEach((obstacle) => {
      // 先从本地移除障碍物
      courseStore.removeObstacle(obstacle.id)

      // 如果在协作模式下，发送移除障碍物消息
      if (isCollaborating.value) {
        sendRemoveObstacle(obstacle.id)
      }
    })
    clearSelection()
  }

  // 如果按下Escape键，取消所有选择
  if (event.key === 'Escape') {
    // 清除障碍物选择
    clearSelection()

    // 清除起终点选择
    draggingPoint.value = null

    // 如果正在框选，取消框选
    if (isSelecting.value) {
      isSelecting.value = false
    }
  }

  // 复制粘贴和全选功能
  if (event.ctrlKey || event.metaKey) {
    if (event.key === 'c' && selectedObstacles.value.length > 0) {
      copyObstacle()
    } else if (event.key === 'v' && copiedObstacles.value.length > 0) {
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

  // 获取选择框的起点和终点（需要转换回屏幕坐标）
  const scaledStart = scalePoint(selectionStart.value)
  const scaledEnd = scalePoint(selectionEnd.value)

  const left = Math.min(scaledStart.x, scaledEnd.x)
  const top = Math.min(scaledStart.y, scaledEnd.y)
  const width = Math.abs(scaledEnd.x - scaledStart.x)
  const height = Math.abs(scaledEnd.y - scaledStart.y)

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  }
})

// 开始框选
const startSelection = (event: CanvasInteractionEvent) => {
  // 如果正在拖拽编号，阻止框选操作
  if (isDraggingNumber.value) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (!beginPointerInteraction(event)) return

  event.preventDefault()

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  // 将屏幕坐标转换为原始坐标
  const unscaledPoint = unscalePoint({ x, y })

  isSelecting.value = true
  selectionStart.value = unscaledPoint
  selectionEnd.value = unscaledPoint

  // 如果没按住Ctrl/Command键，清除当前选中
  if (!event.ctrlKey && !event.metaKey) {
    clearSelection()
  }
}

// 更新框选区域
const updateSelection = (event: CanvasInteractionEvent) => {
  if (!isSelecting.value) return

  const canvas = document.querySelector('.course-canvas')
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
  const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height))

  // 将屏幕坐标转换为原始坐标
  const unscaledPoint = unscalePoint({ x, y })
  selectionEnd.value = unscaledPoint
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

  // 检查起点是否在选择域内
  let startSelected = false
  if (courseStore.coursePath.visible) {
    const startEl = document.querySelector('.start-indicator')
    if (startEl) {
      const startRect = startEl.getBoundingClientRect()
      const canvas = document.querySelector('.course-canvas')?.getBoundingClientRect()
      if (canvas) {
        const relativeRect = {
          left: startRect.left - canvas.left,
          top: startRect.top - canvas.top,
          right: startRect.right - canvas.left,
          bottom: startRect.bottom - canvas.top,
        }

        startSelected = !(
          relativeRect.right < left ||
          relativeRect.left > right ||
          relativeRect.bottom < top ||
          relativeRect.top > bottom
        )
      }
    }
  }

  // 检查终点是否在选择域内
  let endSelected = false
  if (courseStore.coursePath.visible) {
    const endEl = document.querySelector('.end-indicator')
    if (endEl) {
      const endRect = endEl.getBoundingClientRect()
      const canvas = document.querySelector('.course-canvas')?.getBoundingClientRect()
      if (canvas) {
        const relativeRect = {
          left: endRect.left - canvas.left,
          top: endRect.top - canvas.top,
          right: endRect.right - canvas.left,
          bottom: endRect.bottom - canvas.top,
        }

        endSelected = !(
          relativeRect.right < left ||
          relativeRect.left > right ||
          relativeRect.bottom < top ||
          relativeRect.top > bottom
        )
      }
    }
  }

  // 更新选中态
  selectedObstacles.value = newSelectedObstacles
  courseStore.selectedObstacle = newSelectedObstacles[0] || null

  // 更新起终点选中状态，但不设置拖拽状态
  if (startSelected) {
    // 仅标记为选中，不设置拖拽状态
    courseStore.selectedPoint = 'start'
  } else if (endSelected) {
    // 仅标记为选中，不设置拖拽状态
    courseStore.selectedPoint = 'end'
  } else {
    courseStore.selectedPoint = null
  }

  isSelecting.value = false
}

// 修改事件监听
const handleGlobalMouseMove = (event: PointerEvent) => {
  if (!matchesActivePointer(event)) {
    return
  }

  // 如果正在拖拽编号，优先处理编号拖拽，阻止其他所有交互
  if (isDraggingNumber.value) {
    event.preventDefault()
    event.stopPropagation()
    handleMouseMove(event)
    return // 早期返回，阻止其他事件处理
  }

  handleMouseMove(event)
  updateSelection(event)

  if (draggingPoint.value === 'start-rotate' || draggingPoint.value === 'end-rotate') {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const pointPos =
      draggingPoint.value === 'start-rotate' ? courseStore.startPoint : courseStore.endPoint

    // 使用缩放后的坐标计算中心点
    const scaledPoint = scalePoint(pointPos)
    const centerX = rect.left + scaledPoint.x
    const centerY = rect.top + scaledPoint.y

    // 计算当前角度
    const currentAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI)
    const startAngle = startMousePos.value.x
    const startRotation = startMousePos.value.y

    // 计算角度差值，使用改进的方法
    let deltaAngle = currentAngle - startAngle
    // 确保角度差值在-180到180度之间
    deltaAngle = ((deltaAngle + 180) % 360) - 180

    // 计算新的旋转角度
    let newRotation = startRotation + deltaAngle
    // 规范化到0-360度范围
    newRotation = ((newRotation % 360) + 360) % 360

    // 更新旋转角度
    if (draggingPoint.value === 'start-rotate') {
      courseStore.updateStartRotation(newRotation)
    } else {
      courseStore.updateEndRotation(newRotation)
    }

    // 如果在协作模式下，发送路径更新
    if (isCollaborating.value) {
      sendPathUpdate(courseStore.currentCourse.id, {
        visible: courseStore.coursePath.visible,
        points: courseStore.coursePath.points,
        startPoint: courseStore.startPoint,
        endPoint: courseStore.endPoint
      })
    }
  }

  // 处理控制点拖拽
  if (draggingControlPoint.value) {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    // 直接使用鼠标位置，不再加上偏移量
    const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
    const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height))

    // 将屏幕坐标转换回原始坐标
    const unscaledPoint = unscalePoint({ x, y })

    courseStore.updateControlPoint(
      draggingControlPoint.value.pointIndex,
      draggingControlPoint.value.controlPointNumber,
      unscaledPoint
    )

    // 应用增强的弧线形变
    applyEnhancedCurveEffect(draggingControlPoint.value.pointIndex, draggingControlPoint.value.controlPointNumber)

    // 如果在协作模式下，发送路径更新
    if (isCollaborating.value) {
      sendPathUpdate(courseStore.currentCourse.id, {
        visible: courseStore.coursePath.visible,
        points: courseStore.coursePath.points,
        startPoint: courseStore.startPoint,
        endPoint: courseStore.endPoint
      })
    }
  }
}

// 修改全局鼠标抬起事件处理
const handleGlobalMouseUp = (event: PointerEvent) => {
  if (!matchesActivePointer(event)) {
    return
  }

  // 结束框选
  if (isSelecting.value) {
    endSelection()
  }

  // 结束障碍物拖拽
  if (isDragging.value) {
    // 在拖拽结束时，确保所有障碍物的最终位置都正确更新到store中
    selectedObstacles.value.forEach((obstacle) => {
      // 最终更新到store，触发所有必要的计算和同步
      courseStore.updateObstacle(obstacle.id, {
        position: { ...obstacle.position },
      }, true) // 允许发送协作消息
    })

    // 在拖拽结束时发送所有选中障碍物的最终位置，确保其他协作者能看到最终位置
    if (isCollaborating.value) {
      try {
        // 为所有选中的障碍物发送最终位置，无论是否有变化
        selectedObstacles.value.forEach((obstacle) => {
          // 创建一个新的位置对象，避免引用问题
          const positionToSend = { ...obstacle.position }

          const result = sendObstacleUpdate(obstacle.id, { position: positionToSend })
          if (result) {
            // 更新最后发送的位置
            localStorage.setItem(`lastPosition_${obstacle.id}`, JSON.stringify(positionToSend))
            // 清除节流时间戳，确保下次拖拽可以立即发送
            localStorage.removeItem(`lastUpdateTime_${obstacle.id}`)
          } else {
            console.error('障碍物', obstacle.id, '的最终位置更新消息发送失败')
            // 尝试重新发送
            setTimeout(() => {
              sendObstacleUpdate(obstacle.id, { position: positionToSend })
            }, 100)
          }
        })
      } catch (error) {
        console.error('发送最终位置更新失败:', error)
      }
    }

    isDragging.value = false
    draggingObstacle.value = null
  }

  // 结束障碍物旋转
  if (isRotating.value && draggingObstacle.value) {
    // 在旋转结束时发送最终旋转角度，确保其他协作者能看到最终角度
    if (isCollaborating.value) {
      try {
        // 直接发送最终角度，不检查是否有变化
        const obstacleId = draggingObstacle.value.id // 保存ID以便在setTimeout中使用
        const rotationToSend = draggingObstacle.value.rotation

        const result = sendObstacleUpdate(obstacleId, { rotation: rotationToSend })
        if (result) {
          // 更新最后发送的旋转角度
          localStorage.setItem(`lastRotation_${obstacleId}`, JSON.stringify(rotationToSend))
          // 清除节流时间戳，确保下次旋转可以立即发送
          localStorage.removeItem(`lastRotationTime_${obstacleId}`)
        } else {
          console.error('最终角度更新消息发送失败')
          // 尝试重新发送
          setTimeout(() => {
            sendObstacleUpdate(obstacleId, { rotation: rotationToSend })
          }, 100)
        }
      } catch (error) {
        console.error('发送最终角度更新失败:', error)
      }
    }

    isRotating.value = false
    draggingObstacle.value = null
  }

  // 结束控制点拖拽
  if (draggingControlPoint.value) {
    // 不再在控制点拖拽结束时发送最终位置，因为在拖拽过程中已经实时发送了位置更新
    draggingControlPoint.value = null
  }

  // 结束杆号拖拽
  if (isDraggingNumber.value) {
    // 在编号拖拽结束时，确保最终位置同步到store
    if (draggingNumberObstacle.value && draggingPoleIndex.value !== null) {
      // 最终同步到store，确保数据一致性
      courseStore.updateObstacle(draggingNumberObstacle.value.id, {
        poles: [...draggingNumberObstacle.value.poles]
      }, true) // 允许发送协作消息
    }

    isDraggingNumber.value = false
    draggingNumberObstacle.value = null
    draggingPoleIndex.value = null
  }

  // 结束起终点拖拽
  if (!event.shiftKey) {
    // 不再在起终点拖拽结束时发送最终位置，因为在拖拽过程中已经实时发送了位置更新

    // 如果是起点或终点的旋转状态，转换为普通选中状态
    if (draggingPoint.value === 'start-rotate') {
      draggingPoint.value = null
      courseStore.selectedPoint = 'start'
    } else if (draggingPoint.value === 'end-rotate') {
      draggingPoint.value = null
      courseStore.selectedPoint = 'end'
    } else if (!event.ctrlKey && !event.metaKey) {
      // 如果没有按下Ctrl/Command键，则完全清除拖拽和选中状态
      draggingPoint.value = null
      courseStore.selectedPoint = null
    }
  }

  // 重置鼠标位置和点位置
  startMousePos.value = { x: 0, y: 0 }
  startPointPos.value = null
  activePointerId.value = null
}

// 组件挂载时添加事件监听
onMounted(() => {
  // 将 course store 暴露到全局，供导出功能使用
  if (typeof window !== 'undefined') {
    (window as unknown).__COURSE_STORE__ = courseStore
  }

  // 只在非编辑模式下（即没有 design_id_to_update）才清除
  const fromMyDesigns = localStorage.getItem('from_my_designs')

  if (!fromMyDesigns) {
    localStorage.removeItem('design_id_to_update')
  } else {
    // 清除标记，为下次判断做准备
    localStorage.removeItem('from_my_designs')
  }

  // 添加事件监听器
  window.addEventListener('pointermove', handleGlobalMouseMove, { passive: false })
  window.addEventListener('pointerup', handleGlobalMouseUp, { passive: false })
  window.addEventListener('pointercancel', handleGlobalMouseUp, { passive: false })
  window.addEventListener('keydown', handleKeyDown)

  // 添加生成路线事件监听
  const canvas = document.querySelector('.course-canvas')
  if (canvas) {
    canvas.addEventListener('generate-course-path', handleGenerateCoursePath)
    // 添加清空画布事件监听
    canvas.addEventListener('clear-canvas', handleClearCanvas)
  }

  // 添加障碍物更新事件监听
  document.addEventListener('obstacle-updated', handleObstacleUpdated)

  // 初始化控制点和控制线的显示状态
  if (!showDistanceLabels.value) {
    setTimeout(() => {
      const controlElements = document.querySelectorAll('.control-point, .control-line')
      controlElements.forEach(element => {
        element.classList.add('hidden-control')
      })
    }, 100) // 短暂延迟确保DOM已更新
  }

  // 在组件卸载时移除事件监听
  onUnmounted(() => {
    window.removeEventListener('pointermove', handleGlobalMouseMove)
    window.removeEventListener('pointerup', handleGlobalMouseUp)
    window.removeEventListener('pointercancel', handleGlobalMouseUp)
    window.removeEventListener('keydown', handleKeyDown)

    // 移除障碍物更新事件监听
    document.removeEventListener('obstacle-updated', handleObstacleUpdated)

    // 移除生成路线事件监听
    const canvas = document.querySelector('.course-canvas')
    if (canvas) {
      canvas.removeEventListener('generate-course-path', handleGenerateCoursePath)
      // 移除清空画布事件监听
      canvas.removeEventListener('clear-canvas', handleClearCanvas)
    }
  })
})

// 组件卸载时移除事件监听
onUnmounted(() => {
  window.removeEventListener('pointermove', handleGlobalMouseMove)
  window.removeEventListener('pointerup', handleGlobalMouseUp)
  window.removeEventListener('pointercancel', handleGlobalMouseUp)
  window.removeEventListener('keydown', handleKeyDown)
  // 移除生成路线事件监听
  const canvas = document.querySelector('.course-canvas')
  if (canvas) {
    canvas.removeEventListener('generate-course-path', handleGenerateCoursePath)
    // 移除清空画布事件监听
    canvas.removeEventListener('clear-canvas', handleClearCanvas)
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

    // 如果在协作模式下，发送添加障碍物的消息
    if (isCollaborating.value) {
      sendAddObstacle(newObstacle)
    }
  })
}

// 开始拖拽起点或终点
const startDraggingPoint = (point: 'start' | 'end', event: CanvasInteractionEvent) => {
  // 如果正在拖拽编号，阻止起终点拖拽
  if (isDraggingNumber.value) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return
  }

  if (!beginPointerInteraction(event)) return

  draggingPoint.value = point

  // 记录初始鼠标位置和点位置
  const pointPos = point === 'start' ? courseStore.startPoint : courseStore.endPoint
  startMousePos.value = { x: event.clientX, y: event.clientY }
  startPointPos.value = { x: pointPos.x, y: pointPos.y }

  event.preventDefault()
  event.stopPropagation()
}

// 开始旋转起点或终点
const startRotatingPoint = (point: 'start' | 'end', event: CanvasInteractionEvent) => {
  // 如果正在拖拽编号，阻止起终点旋转
  if (isDraggingNumber.value) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return
  }

  if (!beginPointerInteraction(event)) return

  draggingPoint.value = point === 'start' ? 'start-rotate' : 'end-rotate'

  const pointPos = point === 'start' ? courseStore.startPoint : courseStore.endPoint
  const canvas = document.querySelector('.course-canvas')
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const centerX = rect.left + pointPos.x
  const centerY = rect.top + pointPos.y

  // 计算当前角度
  const currentAngle = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI

  // 记录当前角度和当前旋转值
  startMousePos.value = {
    x: currentAngle,
    y: point === 'start' ? courseStore.startPoint.rotation : courseStore.endPoint.rotation
  }

  event.preventDefault()
  event.stopPropagation()
}

// 开始拖拽控制点
const startDraggingControlPoint = (
  pointIndex: number,
  controlPointNumber: 1 | 2,
  event: CanvasInteractionEvent,
) => {
  // 如果正在拖拽编号，阻止控制点拖拽
  if (isDraggingNumber.value) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return
  }

  if (!beginPointerInteraction(event)) return

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

  event.preventDefault()
  event.stopPropagation()
}

// 计算路径段
const CURVE_CONTROL_POINT_MULTIPLIER = 1
const MANUAL_CURVE_RESPONSE_MIN_MULTIPLIER = 1.2
const MANUAL_CURVE_RESPONSE_MAX_MULTIPLIER = 2.4
const MANUAL_CURVE_RESPONSE_DISTANCE_THRESHOLD = 18

const getRenderedControlPoint = (
  anchorPoint: { x: number; y: number },
  controlPoint: { x: number; y: number },
  isManuallyMoved: boolean
) => {
  const controlDistance = Math.sqrt(
    Math.pow(controlPoint.x - anchorPoint.x, 2) +
    Math.pow(controlPoint.y - anchorPoint.y, 2)
  )
  const controlAngle = Math.atan2(
    controlPoint.y - anchorPoint.y,
    controlPoint.x - anchorPoint.x
  )

  let responseMultiplier = CURVE_CONTROL_POINT_MULTIPLIER

  if (isManuallyMoved) {
    const normalizedDistance = Math.min(controlDistance, MANUAL_CURVE_RESPONSE_DISTANCE_THRESHOLD)
      / MANUAL_CURVE_RESPONSE_DISTANCE_THRESHOLD
    const manualBoost = MANUAL_CURVE_RESPONSE_MIN_MULTIPLIER +
      (MANUAL_CURVE_RESPONSE_MAX_MULTIPLIER - MANUAL_CURVE_RESPONSE_MIN_MULTIPLIER)
      * Math.sin(normalizedDistance * Math.PI / 2)
    responseMultiplier *= manualBoost
  }

  return {
    x: anchorPoint.x + Math.cos(controlAngle) * (controlDistance * responseMultiplier),
    y: anchorPoint.y + Math.sin(controlAngle) * (controlDistance * responseMultiplier)
  }
}

const getRenderedBezierControlPoints = (
  startPoint: PathPoint,
  endPoint: PathPoint
) => {
  if (!startPoint.controlPoint2 || !endPoint.controlPoint1) {
    return null
  }

  return {
    cp1: getRenderedControlPoint(
      startPoint,
      startPoint.controlPoint2,
      Boolean(startPoint.isControlPoint2Moved)
    ),
    cp2: getRenderedControlPoint(
      endPoint,
      endPoint.controlPoint1,
      Boolean(endPoint.isControlPoint1Moved)
    )
  }
}

const pathSegments = computed(() => {
  const segments: string[] = []
  const points = courseStore.coursePath.points

  for (let i = 1; i < points.length; i++) {
    const current = points[i]
    const previous = points[i - 1]
    const scaledCurrent = scalePoint(current)
    const scaledPrevious = scalePoint(previous)

    // 检查是否是障碍物连接线（每5个点为一组，其中点2-4为障碍物连接线）
    const isObstacleLine = (index: number) => {
      const pointInGroup = (index - 1) % 5
      return pointInGroup >= 1 && pointInGroup <= 3
    }

    // 如果当前点或前一个点在直线部分，使用直线连接
    if (isObstacleLine(i) || isObstacleLine(i - 1)) {
      // 使用 SVG 的 L 命令绘制直线
      segments.push(`M ${scaledPrevious.x} ${scaledPrevious.y} L ${scaledCurrent.x} ${scaledCurrent.y}`)
    } else if (previous.controlPoint2 && current.controlPoint1) {
      const curveControlPoints = getRenderedBezierControlPoints(previous, current)

      if (!curveControlPoints) {
        segments.push(`M ${scaledPrevious.x} ${scaledPrevious.y} L ${scaledCurrent.x} ${scaledCurrent.y}`)
        continue
      }

      const scaledCP1 = scalePoint(curveControlPoints.cp1)
      const scaledCP2 = scalePoint(curveControlPoints.cp2)

      // 使用与标签计算一致的控制点创建贝塞尔曲线
      const bezierPath = `M ${scaledPrevious.x} ${scaledPrevious.y} C ${scaledCP1.x} ${scaledCP1.y}, ${scaledCP2.x} ${scaledCP2.y}, ${scaledCurrent.x} ${scaledCurrent.y}`
      segments.push(bezierPath)
    } else {
      // 如果没有控制点，使用直线
      segments.push(`M ${scaledPrevious.x} ${scaledPrevious.y} L ${scaledCurrent.x} ${scaledCurrent.y}`)
    }
  }
  return segments
})

// 修改起终点的样式绑定，使用缩放后的坐标
const startStyle = computed(() => {
  const scaledPoint = scalePoint(courseStore.startPoint)
  return {
    left: `${scaledPoint.x}px`,
    top: `${scaledPoint.y}px`,
    transform: `translate(-50%, -50%) rotate(${courseStore.startPoint.rotation}deg)`,
  }
})

const endStyle = computed(() => {
  const scaledPoint = scalePoint(courseStore.endPoint)
  return {
    left: `${scaledPoint.x}px`,
    top: `${scaledPoint.y}px`,
    transform: `translate(-50%, -50%) rotate(${courseStore.endPoint.rotation}deg)`,
  }
})

const shouldRenderControlPoint = (pointIndex: number, controlPointNumber: 1 | 2) => {
  const points = courseStore.coursePath.points
  const currentPoint = points[pointIndex]

  if (!currentPoint) {
    return false
  }

  if (controlPointNumber === 1) {
    const previousPoint = points[pointIndex - 1]
    return Boolean(currentPoint.controlPoint1 && previousPoint?.controlPoint2)
  }

  const nextPoint = points[pointIndex + 1]
  return Boolean(currentPoint.controlPoint2 && nextPoint?.controlPoint1)
}

const PATH_CONNECTION_BUFFER_METERS = 1

const formatDisplayedDistance = (segmentLength: number, extraMeters = 0) => {
  return (segmentLength + extraMeters).toFixed(1)
}

// 修改生成路线的方法
const handleGenerateCoursePath = () => {
  if (courseStore.currentCourse.obstacles.length === 0) {
    ElMessage.warning('请先添加障碍物')
    return
  }

  // 检查障碍物编号是否都是数字
  const obstacles = courseStore.currentCourse.obstacles.filter(
    obstacle => obstacle.type !== ObstacleType.DECORATION
  )

  // 检查是否有非数字编号的障碍物
  const invalidNumberObstacles = obstacles.filter(
    obstacle => obstacle.number && !/^\d+$/.test(obstacle.number)
  )

  if (invalidNumberObstacles.length > 0) {
    ElMessage.warning('存在非数字编号的障碍物，请修改为数字编号后再生成路线')
    return
  }

  // 检查是否有未编号的障碍物
  const unnumberedObstacles = obstacles.filter(obstacle => !obstacle.number)

  if (unnumberedObstacles.length > 0) {
    ElMessage.warning('存在未编号的障碍物，请为所有障碍物添加数字编号后再生成路线')
    return
  }

  // 先清除现有路径
  courseStore.clearPath()
  // 生成新路径
  courseStore.generatePath(true)
  // 显示路径
  courseStore.togglePathVisibility(true)

  // 显示成功消息
  ElMessage.success('已根据障碍物编号顺序生成路线')

  // 如果在协作模式下，发送路径更新
  if (isCollaborating.value) {
    // 发送路径更新消息给其他协作者
    sendPathUpdate(courseStore.currentCourse.id, {
      visible: courseStore.coursePath.visible,
      points: courseStore.coursePath.points,
      startPoint: courseStore.startPoint,
      endPoint: courseStore.endPoint
    })
  }
}

// 调整标签角度，使其更易读
const adjustLabelAngle = (angle: number) => {
  // 标准化角度到 -180 到 180 度范围
  let normalizedAngle = angle % 360
  if (normalizedAngle > 180) normalizedAngle -= 360
  if (normalizedAngle < -180) normalizedAngle += 360

  // 如果角度接近垂直（上下），调整为水平方向
  if (normalizedAngle > 70 && normalizedAngle < 110) {
    return normalizedAngle - 90
  }
  if (normalizedAngle < -70 && normalizedAngle > -110) {
    return normalizedAngle + 90
  }

  // 如果角度在右半边（文字会倒置），翻转180度
  if (normalizedAngle > 90 || normalizedAngle < -90) {
    return normalizedAngle + 180
  }

  return normalizedAngle
}

// 修改计算贝塞尔曲线长度的函数
const calculateBezierLength = (
  p0: { x: number; y: number },
  p1: { x: number; y: number } | undefined,
  p2: { x: number; y: number } | undefined,
  p3: { x: number; y: number },
  steps = 20
) => {
  // 如果没有控制点，返回直线距离
  if (!p1 || !p2) {
    return Math.sqrt(
      Math.pow(p3.x - p0.x, 2) +
      Math.pow(p3.y - p0.y, 2)
    )
  }

  const curveControlPoints = getRenderedBezierControlPoints(
    { x: p0.x, y: p0.y, controlPoint2: p1 },
    { x: p3.x, y: p3.y, controlPoint1: p2 }
  )

  if (!curveControlPoints) {
    return Math.sqrt(
      Math.pow(p3.x - p0.x, 2) +
      Math.pow(p3.y - p0.y, 2)
    )
  }

  let length = 0
  let prevPoint = p0

  // 使用与实际渲染一致的控制点计算曲线长度
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const t1 = 1 - t

    // 三次贝塞尔曲线的参数方程
    const x = t1 * t1 * t1 * p0.x +
      3 * t1 * t1 * t * curveControlPoints.cp1.x +
      3 * t1 * t * t * curveControlPoints.cp2.x +
      t * t * t * p3.x

    const y = t1 * t1 * t1 * p0.y +
      3 * t1 * t1 * t * curveControlPoints.cp1.y +
      3 * t1 * t * t * curveControlPoints.cp2.y +
      t * t * t * p3.y

    const currentPoint = { x, y }

    // 计算当前点与前一点之间的距离并累加
    length += Math.sqrt(
      Math.pow(currentPoint.x - prevPoint.x, 2) +
      Math.pow(currentPoint.y - prevPoint.y, 2)
    )

    prevPoint = currentPoint
  }

  return length
}

// 修改计算路径段长度的函数
const calculatePathSegmentLength = (
  startPoint: PathPoint,
  endPoint: PathPoint
) => {
  // 如果有控制点，使用贝塞尔曲线计算
  return calculateBezierLength(
    startPoint,
    startPoint.controlPoint2,
    endPoint.controlPoint1,
    endPoint
  )
}

// 添加贝塞尔曲线计算的辅助函数
const bezierPoint = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t1 = 1 - t
  return t1 * t1 * t1 * p0 +
    3 * t1 * t1 * t * p1 +
    3 * t1 * t * t * p2 +
    t * t * t * p3
}

const bezierTangent = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t1 = 1 - t
  return -3 * p0 * t1 * t1 +
    p1 * (3 * t1 * t1 - 6 * t1 * t) +
    p2 * (6 * t1 * t - 3 * t * t) +
    3 * p3 * t * t
}

// 修改距离标签计算函数
const calculateDistanceLabel = (
  startPoint: PathPoint,
  endPoint: PathPoint,
  hasControlPoints: boolean
) => {
  const start = { x: startPoint.x, y: startPoint.y }
  const end = { x: endPoint.x, y: endPoint.y }

  if (!hasControlPoints || !startPoint.controlPoint2 || !endPoint.controlPoint1) {
    // 线性插值计算标签位置
    const position = {
      x: start.x + (end.x - start.x) * 0.5,
      y: start.y + (end.y - start.y) * 0.5
    }
    const angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI)
    return { position, angle }
  }

  const curveControlPoints = getRenderedBezierControlPoints(startPoint, endPoint)

  if (!curveControlPoints) {
    const position = {
      x: start.x + (end.x - start.x) * 0.5,
      y: start.y + (end.y - start.y) * 0.5
    }
    const angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI)
    return { position, angle }
  }

  // 使用与实际渲染一致的贝塞尔曲线计算标签位置
  const t = 0.5
  const cp1 = curveControlPoints.cp1
  const cp2 = curveControlPoints.cp2

  const position = {
    x: bezierPoint(start.x, cp1.x, cp2.x, end.x, t),
    y: bezierPoint(start.y, cp1.y, cp2.y, end.y, t)
  }

  const dx = bezierTangent(start.x, cp1.x, cp2.x, end.x, t)
  const dy = bezierTangent(start.y, cp1.y, cp2.y, end.y, t)
  const angle = Math.atan2(dy, dx) * (180 / Math.PI)

  return { position, angle }
}

// 计算障碍物之间的距离
const obstacleDistances = computed(() => {
  // 检查路径是否可见以及是否有足够的点
  if (!courseStore.coursePath.visible || courseStore.coursePath.points.length < 2) {
    return [] // 如果不可见或点不足，返回空数组
  }

  const distances = []
  const points = courseStore.coursePath.points
  const obstacles = courseStore.currentCourse.obstacles

  if (points.length >= 3) {
    const startPoint = points[0]
    const firstObstacleEntry = points[1]

    if (startPoint && firstObstacleEntry) {
      const segmentLength = calculatePathSegmentLength(startPoint, firstObstacleEntry)
      const distanceInMeters = formatDisplayedDistance(
        segmentLength,
        PATH_CONNECTION_BUFFER_METERS,
      )

      // 如果距离有效，则添加标签信息
      if (parseFloat(distanceInMeters) > 0) {
        // 计算标签的位置和角度
        const label = calculateDistanceLabel(startPoint, firstObstacleEntry,
          Boolean(startPoint.controlPoint2 && firstObstacleEntry.controlPoint1))

        // 添加起点到第一个障碍物的距离信息
        distances.push({
          distance: distanceInMeters, // 距离值
          position: scalePoint(label.position), // 标签位置（应用缩放）
          angle: label.angle, // 标签旋转角度
          fromNumber: 'S', // 起始点标记为 'S'
          toNumber: '1' // 第一个障碍物标记为 '1'
        })
      }
    }
  }

  // 计算障碍物之间的距离 (修正后的逻辑)
  // 循环遍历每个障碍物的连接点
  // i 代表当前障碍物的中心点索引 (3, 8, 13, ...)
  // 循环条件调整为 points.length - 3，确保 nextEntryPointIndex (i+3) 不会越界
  for (let i = 3; i < points.length - 3; i += 5) {
    const exitPointIndex = i + 2; // 正确：当前障碍物的出口连接点索引 (点5, 10, 15...)
    const nextEntryPointIndex = i + 3; // 正确：下一个障碍物的入口连接点索引 (点6, 11, 16...)

    // 再次检查索引是否在有效范围内（虽然循环条件已调整，双重检查更安全）
    if (exitPointIndex < points.length && nextEntryPointIndex < points.length) {
      const exitPoint = points[exitPointIndex]; // 获取当前障碍物的出口连接点
      const nextEntryPoint = points[nextEntryPointIndex]; // 获取下一个障碍物的入口连接点

      if (exitPoint && nextEntryPoint) {
        const segmentLength = calculatePathSegmentLength(exitPoint, nextEntryPoint)
        const distanceInMeters = formatDisplayedDistance(
          segmentLength,
          PATH_CONNECTION_BUFFER_METERS * 2,
        )

        // 仅当距离大于0时才添加标签
        if (parseFloat(distanceInMeters) > 0) {
          // 计算标签的位置和角度
          const label = calculateDistanceLabel(exitPoint, nextEntryPoint,
            Boolean(exitPoint.controlPoint2 && nextEntryPoint.controlPoint1))

          // 计算当前和下一个障碍物的编号
          // (i-3)/5 得到从0开始的障碍物索引
          const currentObstacleIndex = Math.floor((i - 3) / 5)
          const nextObstacleIndex = currentObstacleIndex + 1

          // 添加障碍物之间的距离信息到数组中
          distances.push({
            distance: distanceInMeters, // 距离值（米）
            position: scalePoint(label.position), // 标签位置（缩放后）
            angle: label.angle, // 标签角度
            fromNumber: (currentObstacleIndex + 1).toString(), // 起始障碍物编号 (从1开始)
            toNumber: (nextObstacleIndex + 1).toString() // 结束障碍物编号 (从1开始)
          })
        }
      }
    } else {
      // 如果索引越界（理论上不应发生），在控制台打印错误信息，帮助调试
      console.error("计算障碍物距离时索引越界:", exitPointIndex, nextEntryPointIndex, points.length);
    }
  }


  // 计算最后一个障碍物到终点的距离
  // 检查是否有足够的点来计算 (至少 Start, Obs1_..., LastObs_Exit, End)
  // 最后一个障碍物的出口连接点索引是 points.length - 2
  if (points.length >= 5) { // 至少需要起点、一个障碍物的5个点、终点 = 7个点？不对，是起点+障碍物组+终点。 5个点代表起点+一个障碍物的入口+中心+出口+终点？ 检查逻辑。
    // 需要： Start(0), Obs1_Entry(1), ..., ObsN_Exit(len-2), End(len-1)
    // 最后一个障碍物的 Exit 连接点是 len-2
    const lastObstacleExit = points[points.length - 2] // 获取最后一个障碍物的出口连接点
    const endPoint = points[points.length - 1] // 获取终点

    if (lastObstacleExit && endPoint) {
      const segmentLength = calculatePathSegmentLength(lastObstacleExit, endPoint)
      const distanceInMeters = formatDisplayedDistance(
        segmentLength,
        PATH_CONNECTION_BUFFER_METERS,
      )

      // 如果距离有效，则添加标签信息
      if (parseFloat(distanceInMeters) > 0) {
        // 计算标签位置和角度
        const label = calculateDistanceLabel(lastObstacleExit, endPoint,
          Boolean(lastObstacleExit.controlPoint2 && endPoint.controlPoint1))

        // 计算最后一个障碍物的编号
        // (总点数 - 2) / 5 = 障碍物数量 ?
        // (len - 2) = 最后一个障碍物的 exit 连接点索引
        // 假设最后一个障碍物中心点是 len - 4 (i = len - 4)
        // 则索引是 (len - 4 - 3) / 5 = (len - 7) / 5 ?? 不对
        // 最后一个障碍物的 exit 连接点是 points.length - 2
        // 该障碍物的中心点是 points.length - 4
        // 该障碍物的编号是 ((points.length - 4) - 3) / 5 + 1 = (points.length - 7) / 5 + 1
        // 另一种方法：计算非装饰障碍物数量
        const numNonDecorationObstacles = obstacles.filter(o => o.type !== ObstacleType.DECORATION).length;

        // 添加最后一个障碍物到终点的距离信息
        distances.push({
          distance: distanceInMeters, // 距离值
          position: scalePoint(label.position), // 标签位置
          angle: label.angle, // 标签角度
          fromNumber: numNonDecorationObstacles.toString(), // 最后一个障碍物的编号
          toNumber: 'F' // 终点标记为 'F'
        })
      }
    }
  }

  // 返回包含所有计算出的距离信息的数组
  return distances
})

// 计算总距离
const totalDistance = computed(() => {
  if (!obstacleDistances.value.length) return '0'

  // 获取障碍物数量（不包括起点到终点的连接）
  const obstacles = courseStore.currentCourse.obstacles.filter(
    obstacle => obstacle.type !== ObstacleType.DECORATION
  )
  const obstacleCount = obstacles.length

  // 计算路径总长度
  const pathDistance = obstacleDistances.value.reduce((sum, item) => {
    return sum + parseFloat(item.distance)
  }, 0)

  // 计算障碍物总长度（包括横杆宽度和间距）
  const obstacleTotalLength = obstacles.reduce((accumulator, obstacle) => {
    let obstacleLength = 0

    // 根据障碍物类型计算长度
    if (obstacle.type === ObstacleType.DOUBLE && obstacle.poles.length > 1) {
      // 双横杆障碍物：横杆宽度 + 间距 + 横杆宽度
      obstacleLength = obstacle.poles[0].height + (obstacle.poles[0].spacing || 0) + obstacle.poles[1].height
    } else if (obstacle.type === ObstacleType.COMBINATION) {
      // 组合障碍物：所有横杆宽度 + 间距
      obstacleLength = obstacle.poles.reduce((poleSum, pole, index) => {
        return poleSum + pole.height + (index < obstacle.poles.length - 1 ? (pole.spacing || 0) : 0)
      }, 0)
    } else {
      // 单横杆障碍物：横杆宽度
      obstacleLength = obstacle.poles[0]?.height || 0
    }

    return accumulator + (obstacleLength / meterScale.value)
  }, 0)

  // 每个障碍物需要加上6米的穿过长度（前3米+后3米）
  const obstaclePassDistance = obstacleCount * 6

  // 总距离 = 路径长度 + 障碍物穿过长度 + 障碍物总长度
  const total = pathDistance + obstaclePassDistance + obstacleTotalLength

  // 保留一位小数
  return total.toFixed(1)
})

// 定义障碍物更新事件处理函数
const handleObstacleUpdated = () => {
  // 完全禁用此函数，不再处理障碍物更新事件
  // 这样可以避免循环更新问题
  return

  /*
  const customEvent = event as CustomEvent
  if (isCollaborating.value && customEvent.detail) {
    const { obstacleId, updates, senderId } = customEvent.detail

    // 检查是否是从WebSocket接收到的消息
    // 如果是从WebSocket接收到的消息，senderId会存在且不为空
    // 这种情况下不需要再发送回去，因为这是其他协作者发来的消息
    const isFromWebSocket = senderId !== undefined && senderId !== null

    // 只有当不是从WebSocket接收到的消息，且当前不在拖拽或旋转状态时，才发送更新
    if (!isFromWebSocket && !isDragging.value && !isRotating.value) {
      sendObstacleUpdate(obstacleId, updates)
    }
  }
  */
}

// 设置 inheritAttrs 为 false，防止属性自动继承
defineOptions({
  inheritAttrs: false
})

// 增加新函数：应用增强的弧线形变效果
const applyEnhancedCurveEffect = (pointIndex: number, controlPointNumber: 1 | 2) => {
  const points = courseStore.coursePath.points
  const point = points[pointIndex]

  // 标记控制点已被手动移动
  if (controlPointNumber === 1) {
    point.isControlPoint1Moved = true
  } else {
    point.isControlPoint2Moved = true
  }

  // 触发响应式更新，实际增强逻辑统一在路径渲染计算中处理
  courseStore.coursePath.points = [...points]
}

// 添加删除路线的方法
const handleDeletePath = () => {
  // 清除路径
  courseStore.clearPath()
  // 如果在协作模式下，发送路径更新
  if (isCollaborating.value) {
    sendPathUpdate(courseStore.currentCourse.id, {
      visible: false,
      points: [],
      startPoint: courseStore.startPoint,
      endPoint: courseStore.endPoint
    })
  }
}
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
  touch-action: none;
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
  touch-action: none;

  &.selected {
    z-index: 4;

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
  z-index: 4;
  transform-origin: center center;
  pointer-events: auto;
  transition: all 0.2s ease;
  user-select: none;
  touch-action: none;

  /* 确保在不同背景下的可见性 */
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.2);

  /* 悬停状态 */
  &:hover {
    cursor: grab;
    background: #043072; /* 淡蓝色背景 */
    color: #87CEFA; /* 淡蓝色文字 */
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    transform: translate(-50%, -50%) scale(1.05);
    border-color: rgba(255, 255, 255, 0.4);
  }

  /* 拖拽状态 - 优化性能 */
  &.dragging {
    cursor: grabbing !important;
    background: var(--primary-dark, #2d54c5);
    color: white;
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.25);
    transform: translate(-50%, -50%) scale(1.1);
    z-index: 1000;
    transition: none !important;
    border-color: rgba(255, 255, 255, 0.3);
    /* 启用硬件加速，确保流畅拖拽 */
    will-change: transform;
    /* 简化动画，减少性能开销 */
    animation: none;
  }

  /* 障碍物拖拽时的状态 - 标号跟随障碍物移动 */
  &.obstacle-dragging {
    transition: none !important;
    z-index: 5;
    /* 确保在障碍物拖拽时标号能够流畅跟随 */
    will-change: transform;
    /* 轻微的视觉提示表明标号正在跟随障碍物移动 */
    opacity: 0.9;
  }
}

/* 拖拽时的脉冲动画 */
@keyframes pulse-drag {
  0%, 100% {
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.25), 0 0 0 0 rgba(58, 106, 248, 0.4);
  }
  50% {
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.25), 0 0 0 4px rgba(58, 106, 248, 0.1);
  }
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
    background-color: #ff0000e8;
    border: 2px solid white;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    pointer-events: auto;
    touch-action: none;

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
  top: calc(-3 * v-bind(meterScale) * 1px);
  bottom: calc(-3 * v-bind(meterScale) * 1px);
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
  // z-index: 10;
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
  // z-index: 10;
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
  z-index: 4;

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
    background-image: repeating-linear-gradient(90deg,
        rgba(0, 0, 0, 0.1) 0px,
        rgba(0, 0, 0, 0.1) 4px,
        transparent 4px,
        transparent 8px),
      repeating-linear-gradient(0deg,
        rgba(0, 0, 0, 0.1) 0px,
        rgba(0, 0, 0, 0.1) 4px,
        transparent 4px,
        transparent 8px);
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

.water-obstacle {
  border-radius: 4px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
  border-style: solid;
  transition: all 0.3s ease;
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
  /* 设置宽度为6米（障碍物前3米+后3米），并转换为像素 */
  /* 这确保了路径指示器的宽度与实际路径的直线部分长度一致 */
  width: calc(6 * v-bind(meterScale) * 1px);
  height: 40px;
  transform-origin: center center;
  cursor: move;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;

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
    touch-action: none;

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

    &.selected,
    &:active {
      color: #ff6b6b;
      box-shadow: 0 0 0 4px rgba(255, 107, 107, 0.3);
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

    &.selected,
    &:active {
      color: #ff6b6b;
      box-shadow: 0 0 0 4px rgba(255, 107, 107, 0.3);
    }
  }

  .path-line {
    position: absolute;
    top: 50%;
    /* 将线条放置在指示器的中心 */
    left: 50%;
    /* 设置宽度为6米（障碍物前3米+后3米），并转换为像素 */
    /* 这确保了虚线的长度与实际路径的直线部分长度一致 */
    width: calc(6 * v-bind(meterScale) * 1px);
    height: 0;
    /* 使线条在指示器中居中显示 */
    transform: translate(-50%, -50%);
  }

  .direction-arrow {
    position: absolute;
    /* 设置高度为6米（障碍物前3米+后3米），并转换为像素 */
    /* 这确保了箭头的长度与实际路径的直线部分长度一致 */
    height: calc(6 * v-bind(meterScale) * 1px);
    /* 将箭头放置在指示器的中心 */
    top: 50%;
    left: 50%;
    width: 2px;
    /* 使箭头在指示器中居中显示 */
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;

    .arrow-line {
      /* 箭头线条占据整个高度 */
      height: 100%;
      width: 100%;
      background: currentColor;
    }

    .arrow-head {
      /* 箭头头部位于线条底部 */
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      /* 创建三角形形状的箭头头部 */
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 12px solid currentColor;
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
  z-index: 4;
  /* 降低路线的z-index，确保低于障碍物 */
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
  touch-action: none;

  &:hover {
    fill: var(--primary-color-light);
    r: 8;
  }

  &.hidden-control {
    display: none;
  }
}

.control-line {
  stroke: var(--primary-color);
  stroke-width: 1;
  stroke-dasharray: 4, 4;
  opacity: 0.3;
  pointer-events: none;

  &.hidden-control {
    display: none;
  }
}

.distance-label-bg {
  fill: white;
  stroke: var(--primary-color);
  stroke-width: 1;
  opacity: 0.9;
  filter: drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.1));
}

.distance-label-text {
  font-size: 12px;
  text-anchor: middle;
  fill: var(--primary-color);
  font-weight: 500;
}

.distance-toggle {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 10;
  display: flex;
  gap: 8px;
}

.total-distance {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: white;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--primary-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.obstacle-number-text {
  font-size: 11px;
  text-anchor: middle;
  fill: var(--primary-color);
  font-weight: 500;
}

.decoration {
  position: relative;
  border-radius: 4px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  overflow: hidden;

  .decoration-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 14px;
    font-weight: bold;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }
}

.decoration-poles {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;

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
}

.decoration-table {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
  border: 1px solid #ccc;
  padding: 10px;

  .decoration-text {
    color: #333;
    font-size: 14px;
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90%;
    text-align: center;
  }
}

.decoration-tree {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;

  .decoration-foliage {
    width: 100%;
    height: 50%;
    background-color: #4CAF50;
    border-radius: 50%;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1;
  }

  .decoration-trunk {
    width: 100%;
    height: 50%;
    background-color: #333;
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 0;
  }
}

.decoration-gate {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid #ccc;
  padding: 10px;

  .decoration-text {
    color: #333;
    font-size: 16px;
    font-weight: bold;
  }
}

.decoration-flower {
  display: flex;
  flex-direction: column;
  align-items: center;

  .decoration-petal {
    width: 100%;
    height: 50%;
    background-color: #FFD700;
    border-radius: 50%;
    margin-bottom: -10px;
  }

  .decoration-leaf {
    width: 40px;
    height: 30px;
    background-color: #555;
    border-radius: 50%;
    position: absolute;
    left: -10px;
    top: 10px;
  }

  .decoration-leaf:last-child {
    left: auto;
    right: -10px;
    top: 10px;
  }
}

.decoration-fence {
  display: flex;
  justify-content: space-between;
  width: 100%;

  .decoration-post {
    width: 4px;
    height: 100%;
    background-color: #ccc;
  }
}

.decoration-custom-image {
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
}

.decoration-custom-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #ccc;
  font-size: 12px;
  color: #999;
}

/* 添加调试信息样式 */
.debug-info {
  position: absolute;
  top: 10px;
  left: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px;
  border-radius: 5px;
  font-size: 12px;
  z-index: 2000;
  pointer-events: auto;
}

.debug-info button {
  margin-top: 5px;
  padding: 3px 8px;
  background-color: #409EFF;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.debug-info button:hover {
  background-color: #66b1ff;
}
</style>
