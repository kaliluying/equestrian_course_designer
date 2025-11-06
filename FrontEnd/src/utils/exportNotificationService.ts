/**
 * 导出通知服务
 * 提供统一的导出通知管理，包括进度通知、警告、错误和完成通知
 */

import { ElMessage, ElNotification, ElMessageBox } from 'element-plus'
import {
  ExportStage
} from '@/types/export'
import type {
  ExportResult,
  ExportError,
  ExportWarning,
  ProgressState
} from '@/types/export'

// 通知配置接口
export interface NotificationConfig {
  enableToast: boolean // 启用Toast消息
  enableNotification: boolean // 启用通知
  enableModal: boolean // 启用模态框
  enableSound: boolean // 启用声音提示
  autoClose: boolean // 自动关闭
  showProgress: boolean // 显示进度
  showDetails: boolean // 显示详细信息
  groupWarnings: boolean // 分组显示警告
}

// 通知优先级
export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// 通知类型
export enum NotificationType {
  PROGRESS = 'progress',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  INFO = 'info'
}

// 通知数据接口
export interface NotificationData {
  id: string
  type: NotificationType
  priority: NotificationPriority
  title: string
  message: string
  details?: string
  progress?: number
  estimatedTime?: number
  warnings?: ExportWarning[]
  errors?: ExportError[]
  actions?: NotificationAction[]
  timestamp: number
  autoClose?: number
  persistent?: boolean
}

// 通知操作接口
export interface NotificationAction {
  id: string
  label: string
  type: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'default'
  handler: () => void | Promise<void>
  closeAfterAction?: boolean
}

// 声音类型
export enum SoundType {
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  PROGRESS = 'progress'
}

/**
 * 导出通知服务类
 */
export class ExportNotificationService {
  private config: NotificationConfig
  private activeNotifications = new Map<string, NotificationData>()
  private notificationHistory: NotificationData[] = []
  private soundEnabled = false
  private eventListeners = new Map<string, Function[]>()

  // 默认配置
  private defaultConfig: NotificationConfig = {
    enableToast: true,
    enableNotification: true,
    enableModal: false,
    enableSound: false,
    autoClose: true,
    showProgress: true,
    showDetails: true,
    groupWarnings: true
  }

  constructor(config?: Partial<NotificationConfig>) {
    this.config = { ...this.defaultConfig, ...config }
    this.initializeSounds()
  }

  /**
   * 初始化声音系统
   */
  private initializeSounds(): void {
    if (this.config.enableSound && 'Audio' in window) {
      this.soundEnabled = true
    }
  }

  /**
   * 播放通知声音
   * @param soundType 声音类型
   */
  private playSound(soundType: SoundType): void {
    if (!this.soundEnabled) return

    try {
      // 这里可以根据需要添加实际的音频文件
      // const audio = new Audio(`/sounds/${soundType}.mp3`)
      // audio.play().catch(console.warn)

      // 使用Web Audio API生成简单的提示音
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // 根据类型设置不同的频率
      const frequencies = {
        [SoundType.SUCCESS]: 800,
        [SoundType.WARNING]: 600,
        [SoundType.ERROR]: 400,
        [SoundType.PROGRESS]: 1000
      }

      oscillator.frequency.setValueAtTime(frequencies[soundType], audioContext.currentTime)
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } catch (error) {
      console.warn('Failed to play notification sound:', error)
    }
  }

  /**
   * 显示进度通知
   * @param progress 进度状态
   */
  showProgressNotification(progress: ProgressState): void {
    const notificationId = 'export-progress'

    const notification: NotificationData = {
      id: notificationId,
      type: NotificationType.PROGRESS,
      priority: NotificationPriority.MEDIUM,
      title: '导出进度',
      message: progress.message,
      progress: progress.progress,
      estimatedTime: progress.estimatedTimeRemaining,
      timestamp: Date.now(),
      persistent: true
    }

    this.activeNotifications.set(notificationId, notification)

    // 显示进度Toast
    if (this.config.enableToast && this.config.showProgress) {
      const progressText = `${Math.round(progress.progress)}%`
      const timeText = progress.estimatedTimeRemaining ?
        ` (剩余: ${this.formatTime(progress.estimatedTimeRemaining)})` : ''

      ElMessage({
        message: `${progress.message} ${progressText}${timeText}`,
        type: 'info',
        duration: 1500,
        showClose: false
      })
    }

    // 发射进度事件
    this.emit('progress', { progress, notification })
  }

  /**
   * 显示成功通知
   * @param result 导出结果
   * @param customMessage 自定义消息
   */
  showSuccessNotification(result: ExportResult, customMessage?: string): void {
    const notificationId = `success-${Date.now()}`

    // 构建成功消息
    let message = customMessage || '导出完成！'
    if (result.metadata) {
      const duration = this.formatTime(result.metadata.exportTime)
      message += ` (耗时: ${duration})`

      if (result.qualityReport) {
        const qualityScore = Math.round(result.qualityReport.overallScore * 100)
        message += ` 质量评分: ${qualityScore}%`
      }
    }

    const notification: NotificationData = {
      id: notificationId,
      type: NotificationType.SUCCESS,
      priority: result.warnings.length > 0 ? NotificationPriority.MEDIUM : NotificationPriority.LOW,
      title: '导出成功',
      message,
      warnings: result.warnings,
      timestamp: Date.now(),
      autoClose: result.warnings.length > 0 ? 8000 : 4000
    }

    this.activeNotifications.set(notificationId, notification)
    this.addToHistory(notification)

    // 移除进度通知
    this.removeNotification('export-progress')

    // 显示成功通知
    if (this.config.enableNotification) {
      let notificationMessage = message

      // 添加警告信息
      if (result.warnings.length > 0) {
        const warningCount = result.warnings.length
        const criticalWarnings = result.warnings.filter(w => w.severity === 'high').length

        if (criticalWarnings > 0) {
          notificationMessage += `\n⚠️ ${criticalWarnings} 个重要警告`
        }
        if (warningCount > criticalWarnings) {
          notificationMessage += `\n⚠️ ${warningCount - criticalWarnings} 个一般警告`
        }
      }

      ElNotification({
        title: '导出成功',
        message: notificationMessage,
        type: 'success',
        duration: notification.autoClose || 4000,
        showClose: true,
        onClick: () => this.showResultDetails(result)
      })
    }

    // 播放成功声音
    this.playSound(SoundType.SUCCESS)

    // 发射成功事件
    this.emit('success', { result, notification })
  }

  /**
   * 显示警告通知
   * @param warnings 警告列表
   * @param context 上下文信息
   */
  showWarningNotification(warnings: ExportWarning[], context?: string): void {
    if (warnings.length === 0) return

    const notificationId = `warning-${Date.now()}`

    // 按严重程度分组
    const criticalWarnings = warnings.filter(w => w.severity === 'high')
    const mediumWarnings = warnings.filter(w => w.severity === 'medium')
    const lowWarnings = warnings.filter(w => w.severity === 'low')

    const priority = criticalWarnings.length > 0 ? NotificationPriority.HIGH :
                    mediumWarnings.length > 0 ? NotificationPriority.MEDIUM : NotificationPriority.LOW

    let title = '导出警告'
    let message = `发现 ${warnings.length} 个警告`

    if (context) {
      message = `${context}: ${message}`
    }

    const notification: NotificationData = {
      id: notificationId,
      type: NotificationType.WARNING,
      priority,
      title,
      message,
      warnings,
      timestamp: Date.now(),
      autoClose: priority === NotificationPriority.HIGH ? 10000 : 6000,
      actions: this.createWarningActions(warnings)
    }

    this.activeNotifications.set(notificationId, notification)
    this.addToHistory(notification)

    // 显示警告通知
    if (this.config.enableNotification) {
      let notificationMessage = message

      // 显示最重要的警告
      if (criticalWarnings.length > 0) {
        notificationMessage += '\n\n重要警告:'
        criticalWarnings.slice(0, 2).forEach(w => {
          notificationMessage += `\n• ${w.message}`
        })
        if (criticalWarnings.length > 2) {
          notificationMessage += `\n• 还有 ${criticalWarnings.length - 2} 个重要警告...`
        }
      }

      ElNotification({
        title,
        message: notificationMessage,
        type: 'warning',
        duration: notification.autoClose || 6000,
        showClose: true,
        onClick: () => this.showWarningDetails(warnings)
      })
    }

    // 播放警告声音
    this.playSound(SoundType.WARNING)

    // 发射警告事件
    this.emit('warning', { warnings, notification })
  }

  /**
   * 显示错误通知
   * @param error 导出错误
   * @param context 错误上下文
   */
  showErrorNotification(error: ExportError, context?: any): void {
    const notificationId = `error-${Date.now()}`

    const notification: NotificationData = {
      id: notificationId,
      type: NotificationType.ERROR,
      priority: NotificationPriority.CRITICAL,
      title: `导出失败 (${error.stage})`,
      message: error.message,
      details: this.formatErrorDetails(error, context),
      errors: [error],
      timestamp: Date.now(),
      persistent: true, // 错误通知不自动关闭
      actions: this.createErrorActions(error)
    }

    this.activeNotifications.set(notificationId, notification)
    this.addToHistory(notification)

    // 移除进度通知
    this.removeNotification('export-progress')

    // 显示错误通知
    if (this.config.enableNotification) {
      let notificationMessage = error.message

      // 添加建议操作
      if (error.suggestedActions && error.suggestedActions.length > 0) {
        notificationMessage += '\n\n建议操作:'
        error.suggestedActions.slice(0, 2).forEach(action => {
          notificationMessage += `\n• ${action}`
        })
      }

      ElNotification({
        title: notification.title,
        message: notificationMessage,
        type: 'error',
        duration: 0, // 不自动关闭
        showClose: true,
        onClick: () => this.showErrorDetails(error, context)
      })
    }

    // 播放错误声音
    this.playSound(SoundType.ERROR)

    // 发射错误事件
    this.emit('error', { error, context, notification })
  }

  /**
   * 显示信息通知
   * @param title 标题
   * @param message 消息
   * @param details 详细信息
   */
  showInfoNotification(title: string, message: string, details?: string): void {
    const notificationId = `info-${Date.now()}`

    const notification: NotificationData = {
      id: notificationId,
      type: NotificationType.INFO,
      priority: NotificationPriority.LOW,
      title,
      message,
      details,
      timestamp: Date.now(),
      autoClose: 3000
    }

    this.activeNotifications.set(notificationId, notification)
    this.addToHistory(notification)

    // 显示信息Toast
    if (this.config.enableToast) {
      ElMessage({
        message: `${title}: ${message}`,
        type: 'info',
        duration: 3000,
        showClose: true
      })
    }

    // 发射信息事件
    this.emit('info', { notification })
  }

  /**
   * 移除通知
   * @param notificationId 通知ID
   */
  removeNotification(notificationId: string): void {
    this.activeNotifications.delete(notificationId)
    this.emit('removed', { notificationId })
  }

  /**
   * 清空所有通知
   */
  clearAllNotifications(): void {
    this.activeNotifications.clear()
    this.emit('cleared', {})
  }

  /**
   * 获取活跃通知
   * @returns 活跃通知列表
   */
  getActiveNotifications(): NotificationData[] {
    return Array.from(this.activeNotifications.values())
  }

  /**
   * 获取通知历史
   * @returns 通知历史列表
   */
  getNotificationHistory(): NotificationData[] {
    return [...this.notificationHistory]
  }

  /**
   * 清空通知历史
   */
  clearHistory(): void {
    this.notificationHistory = []
    this.emit('history-cleared', {})
  }

  /**
   * 添加到历史记录
   * @param notification 通知数据
   */
  private addToHistory(notification: NotificationData): void {
    this.notificationHistory.unshift(notification)

    // 限制历史记录数量
    if (this.notificationHistory.length > 50) {
      this.notificationHistory = this.notificationHistory.slice(0, 50)
    }
  }

  /**
   * 创建警告操作
   * @param warnings 警告列表
   * @returns 操作列表
   */
  private createWarningActions(warnings: ExportWarning[]): NotificationAction[] {
    const actions: NotificationAction[] = []

    // 查看详情操作
    actions.push({
      id: 'view-warnings',
      label: '查看详情',
      type: 'info',
      handler: () => this.showWarningDetails(warnings),
      closeAfterAction: false
    })

    // 如果有建议操作，添加快速修复
    const actionableWarnings = warnings.filter(w => w.suggestedAction)
    if (actionableWarnings.length > 0) {
      actions.push({
        id: 'quick-fix',
        label: '快速修复',
        type: 'primary',
        handler: () => this.showQuickFixOptions(actionableWarnings),
        closeAfterAction: true
      })
    }

    return actions
  }

  /**
   * 创建错误操作
   * @param error 导出错误
   * @returns 操作列表
   */
  private createErrorActions(error: ExportError): NotificationAction[] {
    const actions: NotificationAction[] = []

    // 重试操作（如果错误可恢复）
    if (error.recoverable) {
      actions.push({
        id: 'retry',
        label: '重试',
        type: 'primary',
        handler: () => this.handleRetry(error),
        closeAfterAction: true
      })
    }

    // 查看详情操作
    actions.push({
      id: 'view-details',
      label: '查看详情',
      type: 'info',
      handler: () => this.showErrorDetails(error),
      closeAfterAction: false
    })

    // 报告问题操作
    actions.push({
      id: 'report',
      label: '报告问题',
      type: 'default',
      handler: () => this.reportError(error),
      closeAfterAction: false
    })

    return actions
  }

  /**
   * 显示结果详情
   * @param result 导出结果
   */
  private showResultDetails(result: ExportResult): void {
    let content = `导出格式: ${result.format.toUpperCase()}\n`

    if (result.metadata) {
      content += `文件大小: ${this.formatFileSize(result.metadata.fileSize)}\n`
      content += `导出时间: ${this.formatTime(result.metadata.exportTime)}\n`
      content += `渲染方法: ${result.metadata.renderingMethod}\n`

      if (result.qualityReport) {
        content += `质量评分: ${Math.round(result.qualityReport.overallScore * 100)}%\n`
      }
    }

    if (result.warnings.length > 0) {
      content += `\n警告 (${result.warnings.length}):\n`
      result.warnings.forEach((warning, index) => {
        content += `${index + 1}. ${warning.message}\n`
      })
    }

    ElMessageBox.alert(content, '导出详情', {
      confirmButtonText: '确定',
      type: 'info'
    })
  }

  /**
   * 显示警告详情
   * @param warnings 警告列表
   */
  private showWarningDetails(warnings: ExportWarning[]): void {
    let content = `发现 ${warnings.length} 个警告:\n\n`

    warnings.forEach((warning, index) => {
      content += `${index + 1}. [${warning.severity.toUpperCase()}] ${warning.message}\n`
      if (warning.suggestedAction) {
        content += `   建议: ${warning.suggestedAction}\n`
      }
      content += '\n'
    })

    ElMessageBox.alert(content, '导出警告详情', {
      confirmButtonText: '确定',
      type: 'warning'
    })
  }

  /**
   * 显示错误详情
   * @param error 导出错误
   * @param context 错误上下文
   */
  private showErrorDetails(error: ExportError, context?: any): void {
    let content = `错误类型: ${error.type}\n`
    content += `发生阶段: ${error.stage}\n`
    content += `错误信息: ${error.message}\n`
    content += `可恢复: ${error.recoverable ? '是' : '否'}\n\n`

    if (error.suggestedActions && error.suggestedActions.length > 0) {
      content += '建议操作:\n'
      error.suggestedActions.forEach((action, index) => {
        content += `${index + 1}. ${action}\n`
      })
      content += '\n'
    }

    if (context) {
      content += `上下文信息:\n${JSON.stringify(context, null, 2)}`
    }

    ElMessageBox.alert(content, '错误详情', {
      confirmButtonText: '确定',
      type: 'error'
    })
  }

  /**
   * 格式化错误详情
   * @param error 导出错误
   * @param context 错误上下文
   * @returns 格式化的详情字符串
   */
  private formatErrorDetails(error: ExportError, context?: any): string {
    let details = `错误类型: ${error.type}\n`
    details += `发生阶段: ${error.stage}\n`
    details += `时间戳: ${new Date().toLocaleString()}\n`

    if (context) {
      details += `\n上下文:\n${JSON.stringify(context, null, 2)}`
    }

    return details
  }

  /**
   * 显示快速修复选项
   * @param warnings 可操作的警告列表
   */
  private showQuickFixOptions(warnings: ExportWarning[]): void {
    // 这里可以实现快速修复逻辑
    console.log('Quick fix options for warnings:', warnings)
  }

  /**
   * 处理重试
   * @param error 导出错误
   */
  private handleRetry(error: ExportError): void {
    // 这里可以实现重试逻辑
    console.log('Retrying after error:', error)
    this.emit('retry-requested', { error })
  }

  /**
   * 报告错误
   * @param error 导出错误
   */
  private reportError(error: ExportError): void {
    // 这里可以实现错误报告逻辑
    console.log('Reporting error:', error)
    this.showInfoNotification('错误报告', '错误报告功能正在开发中')
  }

  /**
   * 格式化时间
   * @param milliseconds 毫秒数
   * @returns 格式化的时间字符串
   */
  private formatTime(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(1)}s`
    } else {
      const minutes = Math.floor(milliseconds / 60000)
      const seconds = Math.floor((milliseconds % 60000) / 1000)
      return `${minutes}m ${seconds}s`
    }
  }

  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化的文件大小字符串
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }
  }

  /**
   * 事件发射器方法
   */
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in notification event listener for ${event}:`, error)
        }
      })
    }
  }

  /**
   * 更新配置
   * @param config 新的配置
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   * @returns 当前配置
   */
  getConfig(): NotificationConfig {
    return { ...this.config }
  }
}

// 创建全局通知服务实例
export const exportNotificationService = new ExportNotificationService()

// 导出类型和枚举
export { NotificationConfig, NotificationPriority, NotificationType, NotificationData, NotificationAction, SoundType }
