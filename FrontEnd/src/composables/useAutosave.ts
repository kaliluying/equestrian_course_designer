/**
 * 自动保存逻辑的 composable
 * 从 App.vue 提取的自动保存和恢复功能
 */
import { computed, ref, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'
import { useCourseStore } from '@/stores/course'

export function useAutosave() {
  const courseStore = useCourseStore()
  const route = useRoute()

  // 自动保存相关变量
  const showRestoreDialog = ref(false)
  const savedTimestamp = ref('')
  const showAutosaveNotification = ref(false)
  let autosaveNotificationTimer: number | null = null

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
    const timestamp = localStorage.getItem('autosaved_timestamp')
    const savedCourse = localStorage.getItem('autosaved_course')

    if (!timestamp || !savedCourse) return

    try {
      const courseData = JSON.parse(savedCourse)
      if (!courseData || !courseData.id) {
        courseStore.clearAutosave()
        return
      }
    } catch {
      courseStore.clearAutosave()
      return
    }

    const savedDate = new Date(timestamp)
    const now = new Date()
    const hoursDiff = (now.getTime() - savedDate.getTime()) / (1000 * 60 * 60)

    if (hoursDiff <= 24) {
      savedTimestamp.value = timestamp
      showRestoreDialog.value = true
    } else {
      courseStore.clearAutosave()
    }
  }

  // 恢复自动保存的路线设计
  const restoreAutosave = () => {
    const success = courseStore.restoreFromLocalStorage(true)
    if (success) {
      ElMessage.success('已恢复未完成的路线设计')
    } else {
      ElMessage.error('恢复失败，可能是数据已损坏')
    }
    showRestoreDialog.value = false
  }

  // 放弃自动保存的路线设计
  const discardAutosave = () => {
    courseStore.clearAutosave()
    showRestoreDialog.value = false
    ElMessage.info('已放弃恢复')
  }

  /**
   * 初始化自动保存检查（在 onMounted 中调用）
   * 包含多种重试机制确保对话框能正常显示
   */
  const initAutosaveCheck = () => {
    if (route.path === '/') {
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
              showRestoreDialog.value = true
            } catch (e) {
              console.error('解析失败', e)
            }
          }
        }
      }, 500)
    }
  }

  return {
    // State
    showRestoreDialog,
    savedTimestamp,
    showAutosaveNotification,
    // Computed
    formatSavedTime,
    // Methods
    showAutosaveNotificationHandler,
    checkAutosave,
    restoreAutosave,
    discardAutosave,
    initAutosaveCheck,
  }
}
