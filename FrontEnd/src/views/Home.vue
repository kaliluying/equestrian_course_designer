<template>
  <div class="home-container">
    <ToolBar class="toolbar" />
    <CourseCanvas class="canvas" ref="canvasRef" />
    <PropertiesPanel class="properties-panel" />

    <!-- 自动保存恢复提示 -->
    <el-dialog v-model="showRestoreDialog" title="恢复未完成的设计" width="400px" :close-on-click-modal="false"
      :show-close="false" :append-to-body="true" :destroy-on-close="false" :modal="true">
      <div class="restore-dialog-content">
        <p>检测到您有一个未完成的路线设计，是否恢复？</p>
        <p class="restore-time">保存时间: {{ formatSavedTime }}</p>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="discardAutosave">放弃</el-button>
          <el-button type="primary" @click="restoreAutosave">恢复</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 自动保存提示 -->
    <div class="autosave-notification" v-if="showAutosaveNotification">
      <el-icon>
        <Check />
      </el-icon>
      <span>已自动保存</span>
    </div>

    <!-- 调试按钮 - 在开发环境中显示 -->
    <div v-if="isDevelopment" class="debug-buttons">
      <el-button type="primary" size="small" @click="manualShowDialog">显示恢复对话框</el-button>
      <el-button type="warning" size="small" @click="clearLocalStorage">清除自动保存</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import ToolBar from '@/components/ToolBar.vue'
import CourseCanvas from '@/components/CourseCanvas.vue'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import { useCourseStore } from '@/stores/course'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'

const canvasRef = ref<InstanceType<typeof CourseCanvas> | null>(null)
const route = useRoute()
const courseStore = useCourseStore()
const userStore = useUserStore()
const isCollaborating = ref(false)
const showRestoreDialog = ref(false)
const savedTimestamp = ref('')
const showAutosaveNotification = ref(false)
let autosaveNotificationTimer: number | null = null

// 判断是否为开发环境
const isDevelopment = import.meta.env.MODE === 'development'

// 手动显示对话框（用于调试）
const manualShowDialog = () => {
  const timestamp = localStorage.getItem('autosaved_timestamp') || new Date().toISOString()
  savedTimestamp.value = timestamp
  showRestoreDialog.value = true
  console.log('手动显示对话框，状态:', showRestoreDialog.value)
}

// 清除localStorage（用于调试）
const clearLocalStorage = () => {
  localStorage.removeItem('autosaved_course')
  localStorage.removeItem('autosaved_timestamp')
  ElMessage.success('已清除自动保存数据')
  console.log('已清除自动保存数据')
}

// 协作停止事件处理函数
const handleCollaborationStopped = () => {
  isCollaborating.value = false
}

// 协作连接成功事件处理函数
const handleCollaborationConnected = () => {
  isCollaborating.value = true
}

// 格式化保存时间
const formatSavedTime = computed(() => {
  if (!savedTimestamp.value) return ''

  try {
    const date = new Date(savedTimestamp.value)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return savedTimestamp.value
  }
})

// 显示自动保存提示
const showAutosaveNotificationHandler = () => {
  // 显示自动保存提示
  showAutosaveNotification.value = true

  // 清除之前的定时器
  if (autosaveNotificationTimer !== null) {
    window.clearTimeout(autosaveNotificationTimer)
  }

  // 3秒后自动隐藏提示
  autosaveNotificationTimer = window.setTimeout(() => {
    showAutosaveNotification.value = false
    autosaveNotificationTimer = null
  }, 3000)
}

// 检查是否有自动保存的路线设计
const checkAutosave = () => {
  // 如果是协作模式，不检查自动保存
  if (route.name === 'collaborate') return

  console.log('检查是否有自动保存的路线设计')
  const timestamp = localStorage.getItem('autosaved_timestamp')
  const savedCourse = localStorage.getItem('autosaved_course')

  if (!timestamp || !savedCourse) {
    console.log('没有找到自动保存的数据', { timestamp, hasSavedCourse: !!savedCourse })
    return
  }

  console.log('找到自动保存的数据', {
    timestamp,
    dataSize: savedCourse.length,
    savedAt: new Date(timestamp).toLocaleString()
  })

  try {
    // 验证数据是否有效
    const courseData = JSON.parse(savedCourse)
    if (!courseData || !courseData.id) {
      console.error('自动保存数据无效')
      courseStore.clearAutosave()
      return
    }
  } catch (error) {
    console.error('解析自动保存数据失败:', error)
    courseStore.clearAutosave()
    return
  }

  // 检查自动保存的时间是否在24小时内
  const savedDate = new Date(timestamp)
  const now = new Date()
  const hoursDiff = (now.getTime() - savedDate.getTime()) / (1000 * 60 * 60)
  console.log('自动保存时间距现在:', { hoursDiff: hoursDiff.toFixed(2) + '小时' })

  if (hoursDiff <= 24) {
    savedTimestamp.value = timestamp
    // 确保对话框显示
    console.log('显示恢复对话框')
    showRestoreDialog.value = true

    // 使用直接的DOM操作确保对话框显示
    nextTick(() => {
      if (!showRestoreDialog.value) {
        console.log('对话框未显示，尝试强制显示')
        showRestoreDialog.value = true
      }
    })
  } else {
    // 如果自动保存的时间超过24小时，则清除localStorage
    console.log('自动保存数据已过期（超过24小时）')
    courseStore.clearAutosave()
  }
}

// 恢复自动保存的路线设计
const restoreAutosave = () => {
  console.log('尝试恢复自动保存的路线设计')
  const success = courseStore.restoreFromLocalStorage()
  if (success) {
    ElMessage.success('已恢复未完成的路线设计')
    console.log('恢复成功')
  } else {
    ElMessage.error('恢复失败，可能是数据已损坏')
    console.error('恢复失败')
  }
  showRestoreDialog.value = false
}

// 放弃自动保存的路线设计
const discardAutosave = () => {
  console.log('放弃恢复自动保存的路线设计')
  courseStore.clearAutosave()
  showRestoreDialog.value = false
  ElMessage.info('已放弃恢复')
}

// 监听协作事件
onMounted(() => {
  console.log('Home.vue已挂载，初始化事件监听器')

  // 处理协作路由
  if (route.name === 'collaborate' && route.params.designId) {
    handleCollaborationRoute()
  } else {
    // 检查是否有自动保存的路线设计
    console.log('准备检查自动保存数据')

    // 使用多种方法尝试显示对话框
    // 1. 立即检查
    checkAutosave()

    // 2. 使用nextTick
    nextTick(() => {
      checkAutosave()
    })

    // 3. 使用setTimeout
    setTimeout(() => {
      checkAutosave()

      // 4. 如果还是没有显示，尝试直接设置
      if (!showRestoreDialog.value) {
        const timestamp = localStorage.getItem('autosaved_timestamp')
        const savedCourse = localStorage.getItem('autosaved_course')

        if (timestamp && savedCourse) {
          try {
            JSON.parse(savedCourse) // 验证JSON格式
            savedTimestamp.value = timestamp
            console.log('直接设置对话框显示')
            showRestoreDialog.value = true
          } catch (e) {
            console.error('解析失败', e)
          }
        }
      }
    }, 500)
  }

  // 监听自动保存事件
  document.addEventListener('course-autosaved', showAutosaveNotificationHandler as EventListener)
  document.addEventListener('collaboration-stopped', handleCollaborationStopped as EventListener)
  document.addEventListener('collaboration-connected', handleCollaborationConnected as EventListener)
})

// 在组件卸载时移除事件监听
onUnmounted(() => {
  console.log('Home.vue已卸载，移除事件监听器')
  document.removeEventListener('course-autosaved', showAutosaveNotificationHandler as EventListener)
  document.removeEventListener('collaboration-stopped', handleCollaborationStopped as EventListener)
  document.removeEventListener('collaboration-connected', handleCollaborationConnected as EventListener)

  // 清除定时器
  if (autosaveNotificationTimer !== null) {
    window.clearTimeout(autosaveNotificationTimer)
    autosaveNotificationTimer = null
  }
})

// 处理协作路由
const handleCollaborationRoute = async () => {
  if (!route.params.designId) return

  const designId = route.params.designId as string
  console.log('协作路由包含设计ID:', designId)

  // 确保用户已登录
  if (!userStore.isAuthenticated) {
    console.log('用户未登录，存储协作信息')
    localStorage.setItem('pendingCollaboration', JSON.stringify({
      designId,
      timestamp: Date.now()
    }))
    return
  }

  // 设置当前设计ID
  courseStore.setCurrentCourseId(designId)
}

// 导出canvasRef，以便父组件访问
defineExpose({
  canvasRef
})
</script>

<style scoped>
.home-container {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.toolbar {
  width: 300px;
  background-color: white;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
}

.canvas {
  flex: 1;
  background-color: white;
  overflow: hidden;
}

.properties-panel {
  width: 300px;
  background-color: white;
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
}

.restore-dialog-content {
  text-align: center;
  margin-bottom: 20px;
}

.restore-time {
  font-size: 14px;
  color: #909399;
  margin-top: 10px;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.autosave-notification {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background-color: rgba(25, 190, 107, 0.9);
  color: white;
  padding: 10px 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  z-index: 9999;
  animation: fadeIn 0.3s ease-in-out;
}

.debug-buttons {
  position: fixed;
  bottom: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
