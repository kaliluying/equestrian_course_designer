<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showTour" class="onboarding-tour" :class="{ 'interactive-step': currentStep?.interactive }">
        <!-- 遮罩层 -->
        <div class="tour-overlay" :class="{ 'interactive-step': currentStep?.interactive }"
          @click="!allowClickOutside && !currentStep?.interactive && nextStep()"></div>

        <!-- 高亮区域 -->
        <div v-if="currentStep && highlightElement" class="tour-highlight"
          :class="{ 'interactive-step': currentStep?.interactive }" :style="highlightStyle"></div>

        <!-- 引导卡片 -->
        <div v-if="currentStep" class="tour-card" :style="cardStyle" ref="cardRef">
          <div class="tour-card-header">
            <h3>{{ currentStep.title }}</h3>
            <div class="tour-step-indicator">
              {{ currentStepIndex + 1 }} / {{ steps.length }}
            </div>
          </div>
          <div class="tour-card-body">
            <p v-html="currentStep.content"></p>
            <div v-if="currentStep.image" class="tour-image">
              <el-icon :size="48">
                <component :is="currentStep.image" />
              </el-icon>
            </div>
          </div>
          <div class="tour-card-footer">
            <el-button v-if="currentStepIndex > 0 && !currentStep.interactive" @click="prevStep">
              上一步
            </el-button>
            <div class="tour-footer-right">
              <el-button text @click="skipTour">跳过</el-button>
              <el-button v-if="!currentStep.interactive || !isWaitingForAction" type="primary" @click="nextStep">
                {{ currentStepIndex === steps.length - 1 ? '完成' : '下一步' }}
              </el-button>
              <el-button v-else type="info" disabled>
                等待操作中...
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import type { CSSProperties } from 'vue'
import {
  Tools,
  Document,
  Setting,
  Connection,
  Position
} from '@element-plus/icons-vue'
import type { Component } from 'vue'
import { useCourseStore } from '@/stores/course'
import { ObstacleType } from '@/types/obstacle'
import type { Obstacle } from '@/types/obstacle'

interface TourStep {
  title: string
  content: string
  target?: string // CSS选择器
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  image?: Component
  allowClickOutside?: boolean
  interactive?: boolean // 是否为交互式步骤
  waitForAction?: () => Promise<boolean> // 等待用户操作的函数
}

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'complete'): void
  (e: 'close'): void
}>()

const showTour = ref(false)
const currentStepIndex = ref(0)
const highlightElement = ref<HTMLElement | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const courseStore = useCourseStore()

// 交互式步骤的状态追踪
const obstacleCountWhenStepStarted = ref(0)
const firstObstacleId = ref<string | null>(null)
const secondObstacleId = ref<string | null>(null)
const isWaitingForAction = ref(false)

// 引导步骤配置
const steps: TourStep[] = [
  {
    title: '欢迎使用马术障碍赛路线设计器！',
    content: '这是一个专业的马术障碍赛路线设计工具。让我们快速了解如何使用它。',
    position: 'center',
    image: Position,
    allowClickOutside: false
  },
  {
    title: '左侧工具栏',
    content: '在<strong>左侧工具栏</strong>中，您可以添加各种障碍物到设计区域。<strong>点击障碍物图标</strong>即可添加到画布中。',
    target: '.toolbar',
    position: 'right',
    image: Tools,
    allowClickOutside: false
  },
  {
    title: '设计画布',
    content: '中间是您的<strong>设计画布</strong>，您可以在这里<strong>拖放、移动和调整</strong>障碍物的位置。<strong>点击障碍物</strong>可以选中它进行编辑。',
    target: '.canvas',
    position: 'bottom',
    image: Document,
    allowClickOutside: false
  },
  {
    title: '属性面板',
    content: '<strong>右侧属性面板</strong>可以编辑选中障碍物的详细属性，包括<strong>长宽、角度、颜色</strong>等。',
    target: '.properties-panel',
    position: 'left',
    image: Setting,
    allowClickOutside: false
  },
  {
    title: '登录与协作',
    content: '<strong>登录后</strong>可以保存您的设计、与他人协作、分享作品。点击<strong>右上角的登录或注册按钮</strong>开始使用完整功能。',
    target: '.user-info',
    position: 'bottom',
    image: Connection,
    allowClickOutside: false
  },
  {
    title: '开始设计第一个路线！',
    content: '让我们通过实际操作来设计第一个路线图。请按照引导完成每个步骤。',
    position: 'center',
    image: Position,
    allowClickOutside: false
  },
  {
    title: '步骤 1: 拖动障碍物到画布',
    content: '请从<strong>左侧工具栏</strong>拖动一个障碍物（如<strong>单横杆</strong>）到画布上。您可以<strong>点击障碍物图标并拖动</strong>到画布区域。',
    target: '.toolbar',
    position: 'right',
    image: Tools,
    allowClickOutside: true,
    interactive: true
  },
  {
    title: '步骤 2: 旋转障碍物至水平',
    content: '现在请拖动障碍物上的<strong>红色旋转控制点</strong>（位于障碍物上方），将障碍物旋转至<strong>水平方向</strong>。',
    target: '.canvas',
    position: 'bottom',
    image: Document,
    allowClickOutside: true,
    interactive: true
  },
  {
    title: '步骤 3: 添加第二个障碍物并设置间距',
    content: '请再添加一个<strong>组合障碍</strong>，然后在<strong>右侧属性面板</strong>中的<strong>横木1</strong>中设置<strong>"与下一个障碍间距"为1米</strong>。',
    target: '.canvas',
    position: 'bottom',
    image: Document,
    allowClickOutside: true,
    interactive: true
  },
  {
    title: '步骤 4: 自动生成路线',
    content: '现在点击左侧工具栏的<strong>"操作"按钮</strong>，然后点击<strong>"自动生成路线"按钮</strong>，最后在确认对话框中点击<strong>"确定"</strong>。',
    target: '.toolbar',
    position: 'right',
    image: Setting,
    allowClickOutside: true,
    interactive: true
  },
  {
    title: '恭喜！您已完成第一个路线设计',
    content: '您已经成功创建了第一个马术障碍赛路线！路线已自动生成。继续尝试添加更多障碍物，设计更复杂的路线吧！',
    position: 'center',
    image: Position,
    allowClickOutside: false
  }
]

const currentStep = computed(() => steps[currentStepIndex.value])
const allowClickOutside = computed(() => currentStep.value?.allowClickOutside ?? false)

// 高亮区域样式
const highlightStyle = computed(() => {
  if (!highlightElement.value) return {}

  const rect = highlightElement.value.getBoundingClientRect()
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
})

// 引导卡片样式
const cardStyle = computed((): CSSProperties => {
  if (!currentStep.value?.target || !highlightElement.value) {
    // 居中显示
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      position: 'fixed'
    } as CSSProperties
  }

  const rect = highlightElement.value.getBoundingClientRect()
  const cardWidth = 320
  const cardHeight = cardRef.value?.offsetHeight || 200
  const spacing = 20

  let left = 0
  let top = 0

  switch (currentStep.value.position) {
    case 'top':
      left = rect.left + rect.width / 2 - cardWidth / 2
      top = rect.top - cardHeight - spacing
      break
    case 'bottom':
      left = rect.left + rect.width / 2 - cardWidth / 2
      top = rect.bottom + spacing
      break
    case 'left':
      left = rect.left - cardWidth - spacing
      top = rect.top + rect.height / 2 - cardHeight / 2
      break
    case 'right':
      left = rect.right + spacing
      top = rect.top + rect.height / 2 - cardHeight / 2
      break
    default:
      left = rect.left + rect.width / 2 - cardWidth / 2
      top = rect.bottom + spacing
  }

  // 确保卡片不超出视窗
  left = Math.max(20, Math.min(left, window.innerWidth - cardWidth - 20))
  top = Math.max(20, Math.min(top, window.innerHeight - cardHeight - 20))

  return {
    left: `${left}px`,
    top: `${top}px`,
    position: 'fixed'
  } as CSSProperties
})

// 更新高亮元素
const updateHighlight = async () => {
  await nextTick()

  // 延迟一点确保DOM已完全渲染
  await new Promise(resolve => setTimeout(resolve, 100))

  if (currentStep.value?.target) {
    const element = document.querySelector(currentStep.value.target) as HTMLElement
    highlightElement.value = element

    if (element) {
      // 滚动到目标元素
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // 再次延迟，确保滚动完成
      await new Promise(resolve => setTimeout(resolve, 300))
    } else {
      console.warn(`引导目标元素未找到: ${currentStep.value.target}`)
    }
  } else {
    highlightElement.value = null
  }
}

// 检查障碍物是否水平（rotation接近90度或270度）
const isObstacleHorizontal = (obstacle: Obstacle): boolean => {
  const rotation = obstacle.rotation % 360
  console.log('检查障碍物水平状态 - rotation:', rotation)
  const normalizedRotation = rotation < 0 ? rotation + 360 : rotation
  console.log('normalizedRotation:', normalizedRotation)

  // 水平方向：90度（±15度）或270度（±15度）
  // 在你的设计中，90度和270度是水平方向
  const isHorizontal90 = (normalizedRotation >= 75 && normalizedRotation <= 105) // 90度附近
  const isHorizontal270 = (normalizedRotation >= 255 && normalizedRotation <= 285) // 270度附近

  const result = isHorizontal90 || isHorizontal270
  console.log('isHorizontal90:', isHorizontal90, 'isHorizontal270:', isHorizontal270, 'result:', result)

  return result
}

// 检查障碍物是否设置了合适的间距（米）
const checkObstacleSpacing = (obstacle: Obstacle): number => {
  console.log("检查障碍物间距属性：", obstacle)

  // 检查障碍物的poles中是否有设置spacing
  if (obstacle.poles && obstacle.poles.length > 0) {
    // 查找第一个有spacing属性的pole
    const poleWithSpacing = obstacle.poles.find(pole => pole.spacing !== undefined && pole.spacing > 0)
    if (poleWithSpacing && poleWithSpacing.spacing) {
      // spacing是以像素为单位，需要转换为米
      // 计算画布的缩放比例
      const canvasElement = document.querySelector('.course-canvas') as HTMLElement
      if (canvasElement) {
        const rect = canvasElement.getBoundingClientRect()
        const meterScale = Math.min(
          rect.width / courseStore.currentCourse.fieldWidth,
          rect.height / courseStore.currentCourse.fieldHeight
        )
        const spacingInMeters = poleWithSpacing.spacing / meterScale
        console.log('找到spacing属性:', poleWithSpacing.spacing, '像素，转换为:', spacingInMeters.toFixed(2), '米')
        return spacingInMeters
      }
    }
  }

  console.log('未找到spacing属性或spacing为0')
  return 0
}

// 检查交互式步骤是否完成
const checkInteractiveStep = async (stepIndex: number): Promise<boolean> => {
  const step = steps[stepIndex]
  if (!step.interactive) return false

  const obstacles = courseStore.currentCourse.obstacles.filter(
    (obs) => obs.type !== ObstacleType.DECORATION
  )

  console.log(`检查步骤 ${stepIndex + 1} 完成状态，当前障碍物数量:`, obstacles.length)

  // 步骤7: 检查是否添加了第一个障碍物
  if (stepIndex === 6) {
    const completed = obstacles.length > obstacleCountWhenStepStarted.value
    console.log('步骤7检查 - 初始障碍物数量:', obstacleCountWhenStepStarted.value, '当前数量:', obstacles.length, '完成:', completed)
    return completed
  }

  // 步骤8: 检查第一个障碍物是否水平
  if (stepIndex === 7) {
    if (obstacles.length === 0) {
      console.log('步骤8检查 - 没有障碍物')
      return false
    }

    // 找到第一个添加的障碍物
    let firstObstacle = obstacles.find(obs => obs.id === firstObstacleId.value)
    if (!firstObstacle) {
      // 如果没有记录ID，使用最后添加的障碍物
      firstObstacle = obstacles[obstacles.length - 1]
      firstObstacleId.value = firstObstacle.id
    }

    console.log('步骤8检查 - 检查障碍物:', firstObstacle.id, '旋转角度:', firstObstacle.rotation)
    const isHorizontal = isObstacleHorizontal(firstObstacle)
    console.log('步骤8检查 - 是否水平:', isHorizontal)
    return isHorizontal
  }

  // 步骤9: 检查是否添加了第二个障碍物并设置了合适的间距
  if (stepIndex === 8) {
    if (obstacles.length < 2) {
      console.log('步骤9检查 - 障碍物数量不足:', obstacles.length)
      return false
    }

    // 检查最后添加的障碍物（第二个障碍物）是否设置了间距
    const secondObstacle = obstacles[obstacles.length - 1]
    console.log('步骤9检查 - 检查第二个障碍物的间距设置:', secondObstacle.id)

    const spacing = checkObstacleSpacing(secondObstacle)
    console.log('步骤9检查 - 障碍物间距设置:', spacing.toFixed(2), '米')

    // 检查是否精确设置为1米（允许很小的浮点数误差）
    const completed = Math.abs(spacing - 1.0) < 0.01
    console.log('步骤9检查 - 间距是否为1米:', completed, '(误差范围: ±0.01米)')
    return completed

  }

  // 步骤10: 检查是否生成了路线
  if (stepIndex === 9) {
    const completed = courseStore.coursePath.visible && courseStore.coursePath.points.length > 0
    console.log('步骤10检查 - 路线是否生成:', completed, '可见:', courseStore.coursePath.visible, '点数量:', courseStore.coursePath.points.length)
    return completed
  }

  return false
}

// 等待用户操作完成
const waitForAction = async () => {
  if (!currentStep.value?.interactive) return

  console.log('开始等待用户操作，步骤:', currentStepIndex.value + 1)
  isWaitingForAction.value = true

  // 设置初始状态
  if (currentStepIndex.value === 6) {
    obstacleCountWhenStepStarted.value = courseStore.currentCourse.obstacles.filter(
      (obs) => obs.type !== ObstacleType.DECORATION
    ).length
    console.log('设置初始障碍物数量:', obstacleCountWhenStepStarted.value)
  }

  // 清除之前的检查定时器
  if (checkStepTimeout) {
    window.clearTimeout(checkStepTimeout)
    checkStepTimeout = null
  }
}

// 自动进入下一步（用于交互式步骤）
const autoNextStep = () => {
  console.log('自动进入下一步，当前步骤:', currentStepIndex.value + 1)

  if (currentStepIndex.value < steps.length - 1) {
    currentStepIndex.value++
    console.log('进入步骤:', currentStepIndex.value + 1)
    updateHighlight()

    // 如果下一步也是交互式步骤，继续等待
    if (steps[currentStepIndex.value]?.interactive) {
      console.log('下一步是交互式步骤，开始等待用户操作')
      waitForAction()
    }
  } else {
    console.log('引导完成')
    completeTour()
  }
}

// 下一步
const nextStep = () => {
  if (currentStepIndex.value < steps.length - 1) {
    currentStepIndex.value++
    updateHighlight()
    // 如果下一步是交互式步骤，开始等待用户操作
    if (steps[currentStepIndex.value]?.interactive) {
      waitForAction()
    }
  } else {
    completeTour()
  }
}

// 上一步
const prevStep = () => {
  if (currentStepIndex.value > 0) {
    currentStepIndex.value--
    updateHighlight()
  }
}

// 跳过引导
const skipTour = () => {
  saveTourCompleted()
  showTour.value = false
  emit('close')
}

// 完成引导
const completeTour = () => {
  saveTourCompleted()
  showTour.value = false
  emit('complete')
}

// 保存引导完成状态
const saveTourCompleted = () => {
  localStorage.setItem('onboarding_completed', 'true')
}

// 监听窗口大小变化，更新位置
const handleResize = () => {
  if (showTour.value) {
    updateHighlight()
  }
}

// 监听show prop变化
watch(() => props.show, (newVal) => {
  if (newVal) {
    showTour.value = true
    currentStepIndex.value = 0
    // 重置交互状态
    obstacleCountWhenStepStarted.value = 0
    firstObstacleId.value = null
    secondObstacleId.value = null
    isWaitingForAction.value = false
    updateHighlight()
    // 如果第一步是交互式步骤，开始等待
    if (steps[0]?.interactive) {
      waitForAction()
    }
  } else {
    showTour.value = false
    isWaitingForAction.value = false
  }
}, { immediate: true })

// 防抖处理函数
let checkStepTimeout: number | null = null

const debouncedCheckStep = () => {
  if (checkStepTimeout) {
    window.clearTimeout(checkStepTimeout)
  }

  checkStepTimeout = window.setTimeout(async () => {
    if (!isWaitingForAction.value || !currentStep.value?.interactive) return

    console.log('防抖检查步骤:', currentStepIndex.value + 1)
    const completed = await checkInteractiveStep(currentStepIndex.value)

    if (completed && isWaitingForAction.value) {
      console.log('步骤完成，准备进入下一步')
      isWaitingForAction.value = false
      setTimeout(() => {
        autoNextStep()
      }, 500)
    }
  }, 300) // 300ms防抖
}

// 监听障碍物变化（用于交互式步骤检测）
watch(() => courseStore.currentCourse.obstacles.length, (newLength, oldLength) => {
  console.log('障碍物数量变化:', oldLength, '->', newLength)
  if (isWaitingForAction.value && currentStep.value?.interactive && currentStepIndex.value === 6) {
    debouncedCheckStep()
  }
}, { deep: true })

// 监听障碍物旋转变化
watch(() => courseStore.currentCourse.obstacles.map(obs => obs.rotation), () => {
  if (isWaitingForAction.value && currentStep.value?.interactive && currentStepIndex.value === 7) {
    console.log('障碍物旋转变化检测')
    debouncedCheckStep()
  }
}, { deep: true })

// 监听障碍物属性变化（用于检测间距设置）
watch(() => courseStore.currentCourse.obstacles.map(obs => obs.poles), () => {
  if (isWaitingForAction.value && currentStep.value?.interactive && currentStepIndex.value === 8) {
    console.log('障碍物属性变化检测（poles）')
    debouncedCheckStep()
  }
}, { deep: true })

// 监听路径变化（用于检测路线生成）
watch(() => courseStore.coursePath.visible, (newVal) => {
  if (newVal && isWaitingForAction.value && currentStepIndex.value === 9) {
    setTimeout(() => {
      if (courseStore.coursePath.points.length > 0) {
        isWaitingForAction.value = false
        setTimeout(() => {
          autoNextStep()
        }, 500)
      }
    }, 500)
  }
})

onMounted(() => {
  window.addEventListener('resize', handleResize)
  window.addEventListener('scroll', handleResize, true)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('scroll', handleResize, true)

  // 清理定时器
  if (checkStepTimeout) {
    window.clearTimeout(checkStepTimeout)
    checkStepTimeout = null
  }
})
</script>

<style scoped lang="scss">
.onboarding-tour {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;

  &.interactive-step {
    pointer-events: none;

    .tour-card {
      pointer-events: auto;
    }
  }
}

.tour-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);

  &.interactive-step {
    pointer-events: none;
    background-color: transparent;
  }
}

.tour-highlight {
  position: fixed;
  border: 3px solid var(--el-color-primary);
  border-radius: 8px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6),
    0 0 20px rgba(58, 106, 248, 0.5);
  background-color: transparent;
  pointer-events: none;
  z-index: 10001;
  transition: all 0.3s ease;

  &.interactive-step {
    pointer-events: none;
    box-shadow: 0 0 0 0 transparent,
      0 0 20px rgba(58, 106, 248, 0.3);
  }
}

.tour-card {
  position: fixed;
  width: 320px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  z-index: 10002;
  animation: slideIn 0.3s ease-out;
  pointer-events: auto;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px) scale(0.95);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.tour-card-header {
  padding: 20px 20px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .tour-step-indicator {
    font-size: 14px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
    padding: 4px 12px;
    border-radius: 12px;
  }
}

.tour-card-body {
  padding: 20px;

  p {
    margin: 0 0 16px;
    font-size: 15px;
    line-height: 1.6;
    color: var(--el-text-color-regular);

    :deep(strong) {
      color: var(--el-color-primary);
      font-weight: 600;
    }
  }

  .tour-image {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-top: 12px;
    color: var(--el-color-primary);
  }
}

.tour-card-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  .tour-footer-right {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
