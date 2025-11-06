/**
 * 导出通知组合式函数
 * 提供Vue组件中使用导出通知系统的便捷方法
 */

import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { exportNotificationService } from '@/utils/exportNotificationService'
import type {
  NotificationData,
  NotificationConfig,
  NotificationAction
} from '@/utils/exportNotificationService'
import type {
  ExportResult,
  ExportError,
  ExportWarning,
  ProgressState
} from '@/types/export'

/**
 * 导出通知组合式函数
 * @param config 通知配置
 * @returns 通知相关的响应式数据和方法
 */
export function useExportNotifications(config?: Partial<NotificationConfig>) {
  // 响应式数据
  const activeNotifications = ref<NotificationData[]>([])
  const notificationHistory = ref<NotificationData[]>([])
  const currentProgress = ref<ProgressState | null>(null)
  const isExporting = ref(false)

  // 通知统计
  const notificationStats = reactive({
    totalNotifications: 0,
    successCount: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0
  })

  // 初始化配置
  if (config) {
    exportNotificationService.updateConfig(config)
  }

  // 事件监听器
  const eventListeners = new Map<string, Function>()

  /**
   * 监听通知事件
   */
  const setupEventListeners = () => {
    // 进度更新事件
    const onProgress = (data: { progress: ProgressState }) => {
      currentProgress.value = data.progress
      isExporting.value = true
    }

    // 成功事件
    const onSuccess = (data: { result: ExportResult; notification: NotificationData }) => {
      isExporting.value = false
      notificationStats.successCount++
      updateNotificationLists()
    }

    // 错误事件
    const onError = (data: { error: ExportError; notification: NotificationData }) => {
      isExporting.value = false
      notificationStats.errorCount++
      updateNotificationLists()
    }

    // 警告事件
    const onWarning = (data: { warnings: ExportWarning[]; notification: NotificationData }) => {
      notificationStats.warningCount++
      updateNotificationLists()
    }

    // 信息事件
    const onInfo = (data: { notification: NotificationData }) => {
      notificationStats.infoCount++
      updateNotificationLists()
    }

    // 通知移除事件
    const onRemoved = () => {
      updateNotificationLists()
    }

    // 历史清空事件
    const onHistoryCleared = () => {
      notificationHistory.value = []
      resetStats()
    }

    // 注册事件监听器
    exportNotificationService.on('progress', onProgress)
    exportNotificationService.on('success', onSuccess)
    exportNotificationService.on('error', onError)
    exportNotificationService.on('warning', onWarning)
    exportNotificationService.on('info', onInfo)
    exportNotificationService.on('removed', onRemoved)
    exportNotificationService.on('history-cleared', onHistoryCleared)

    // 保存监听器引用以便清理
    eventListeners.set('progress', onProgress)
    eventListeners.set('success', onSuccess)
    eventListeners.set('error', onError)
    eventListeners.set('warning', onWarning)
    eventListeners.set('info', onInfo)
    eventListeners.set('removed', onRemoved)
    eventListeners.set('history-cleared', onHistoryCleared)
  }

  /**
   * 清理事件监听器
   */
  const cleanupEventListeners = () => {
    eventListeners.forEach((listener, event) => {
      exportNotificationService.off(event, listener)
    })
    eventListeners.clear()
  }

  /**
   * 更新通知列表
   */
  const updateNotificationLists = () => {
    activeNotifications.value = exportNotificationService.getActiveNotifications()
    notificationHistory.value = exportNotificationService.getNotificationHistory()
    notificationStats.totalNotifications = notificationHistory.value.length
  }

  /**
   * 重置统计数据
   */
  const resetStats = () => {
    notificationStats.totalNotifications = 0
    notificationStats.successCount = 0
    notificationStats.errorCount = 0
    notificationStats.warningCount = 0
    notificationStats.infoCount = 0
  }

  // 通知方法
  const showProgressNotification = (progress: ProgressState) => {
    exportNotificationService.showProgressNotification(progress)
  }

  const showSuccessNotification = (result: ExportResult, customMessage?: string) => {
    exportNotificationService.showSuccessNotification(result, customMessage)
  }

  const showErrorNotification = (error: ExportError, context?: any) => {
    exportNotificationService.showErrorNotification(error, context)
  }

  const showWarningNotification = (warnings: ExportWarning[], context?: string) => {
    exportNotificationService.showWarningNotification(warnings, context)
  }

  const showInfoNotification = (title: string, message: string, details?: string) => {
    exportNotificationService.showInfoNotification(title, message, details)
  }

  // 通知管理方法
  const removeNotification = (notificationId: string) => {
    exportNotificationService.removeNotification(notificationId)
  }

  const clearAllNotifications = () => {
    exportNotificationService.clearAllNotifications()
  }

  const clearHistory = () => {
    exportNotificationService.clearHistory()
  }

  // 配置管理
  const updateConfig = (newConfig: Partial<NotificationConfig>) => {
    exportNotificationService.updateConfig(newConfig)
  }

  const getConfig = () => {
    return exportNotificationService.getConfig()
  }

  // 便捷方法
  const hasActiveNotifications = () => {
    return activeNotifications.value.length > 0
  }

  const hasErrors = () => {
    return activeNotifications.value.some(n => n.type === 'error')
  }

  const hasWarnings = () => {
    return activeNotifications.value.some(n => n.type === 'warning')
  }

  const getLatestNotification = () => {
    return activeNotifications.value[0] || null
  }

  const getNotificationsByType = (type: string) => {
    return activeNotifications.value.filter(n => n.type === type)
  }

  // 创建自定义操作
  const createRetryAction = (retryHandler: () => void): NotificationAction => ({
    id: 'retry',
    label: '重试',
    type: 'primary',
    handler: retryHandler,
    closeAfterAction: true
  })

  const createViewDetailsAction = (detailsHandler: () => void): NotificationAction => ({
    id: 'view-details',
    label: '查看详情',
    type: 'info',
    handler: detailsHandler,
    closeAfterAction: false
  })

  const createDismissAction = (notificationId: string): NotificationAction => ({
    id: 'dismiss',
    label: '关闭',
    type: 'default',
    handler: () => removeNotification(notificationId),
    closeAfterAction: true
  })

  // 生命周期钩子
  onMounted(() => {
    setupEventListeners()
    updateNotificationLists()
  })

  onUnmounted(() => {
    cleanupEventListeners()
  })

  return {
    // 响应式数据
    activeNotifications,
    notificationHistory,
    currentProgress,
    isExporting,
    notificationStats,

    // 通知方法
    showProgressNotification,
    showSuccessNotification,
    showErrorNotification,
    showWarningNotification,
    showInfoNotification,

    // 管理方法
    removeNotification,
    clearAllNotifications,
    clearHistory,
    updateConfig,
    getConfig,

    // 便捷方法
    hasActiveNotifications,
    hasErrors,
    hasWarnings,
    getLatestNotification,
    getNotificationsByType,

    // 操作创建器
    createRetryAction,
    createViewDetailsAction,
    createDismissAction,

    // 手动更新方法
    updateNotificationLists,
    resetStats
  }
}

/**
 * 导出进度跟踪组合式函数
 * 专门用于跟踪导出进度的简化版本
 */
export function useExportProgress() {
  const currentStage = ref<string>('')
  const progress = ref<number>(0)
  const message = ref<string>('')
  const estimatedTime = ref<number | undefined>(undefined)
  const isActive = ref<boolean>(false)

  // 监听进度更新
  const onProgressUpdate = (data: { progress: ProgressState }) => {
    currentStage.value = data.progress.stage
    progress.value = data.progress.progress
    message.value = data.progress.message
    estimatedTime.value = data.progress.estimatedTimeRemaining
    isActive.value = true
  }

  // 监听完成事件
  const onComplete = () => {
    isActive.value = false
    progress.value = 100
  }

  // 监听错误事件
  const onError = () => {
    isActive.value = false
  }

  onMounted(() => {
    exportNotificationService.on('progress', onProgressUpdate)
    exportNotificationService.on('success', onComplete)
    exportNotificationService.on('error', onError)
  })

  onUnmounted(() => {
    exportNotificationService.off('progress', onProgressUpdate)
    exportNotificationService.off('success', onComplete)
    exportNotificationService.off('error', onError)
  })

  return {
    currentStage,
    progress,
    message,
    estimatedTime,
    isActive
  }
}

/**
 * 导出通知摘要组合式函数
 * 提供通知的汇总信息
 */
export function useExportNotificationSummary() {
  const summary = reactive({
    totalExports: 0,
    successfulExports: 0,
    failedExports: 0,
    warningsCount: 0,
    averageExportTime: 0,
    lastExportTime: null as Date | null,
    recentErrors: [] as ExportError[]
  })

  const updateSummary = () => {
    const history = exportNotificationService.getNotificationHistory()

    summary.totalExports = history.filter(n =>
      n.type === 'success' || n.type === 'error'
    ).length

    summary.successfulExports = history.filter(n => n.type === 'success').length
    summary.failedExports = history.filter(n => n.type === 'error').length
    summary.warningsCount = history.filter(n => n.type === 'warning').length

    // 计算平均导出时间（简化版本）
    const successfulExports = history.filter(n => n.type === 'success')
    if (successfulExports.length > 0) {
      // 这里需要从通知数据中提取实际的导出时间
      // 暂时使用简化的计算方法
      summary.averageExportTime = 5000 // 5秒，实际应该从导出结果中获取
    }

    // 最近的导出时间
    if (history.length > 0) {
      summary.lastExportTime = new Date(history[0].timestamp)
    }

    // 最近的错误
    summary.recentErrors = history
      .filter(n => n.type === 'error' && n.errors)
      .slice(0, 5)
      .flatMap(n => n.errors || [])
  }

  onMounted(() => {
    updateSummary()

    // 监听通知变化
    const onNotificationChange = () => {
      updateSummary()
    }

    exportNotificationService.on('success', onNotificationChange)
    exportNotificationService.on('error', onNotificationChange)
    exportNotificationService.on('warning', onNotificationChange)

    onUnmounted(() => {
      exportNotificationService.off('success', onNotificationChange)
      exportNotificationService.off('error', onNotificationChange)
      exportNotificationService.off('warning', onNotificationChange)
    })
  })

  return {
    summary,
    updateSummary
  }
}
