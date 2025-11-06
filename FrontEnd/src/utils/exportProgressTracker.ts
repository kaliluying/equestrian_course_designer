/**
 * 导出进度跟踪系统
 * 负责跟踪导出过程的进度，提供详细的状态反馈和用户提示
 *
 * 功能特性:
 * - 实时进度跟踪和阶段管理
 * - 智能时间估算和剩余时间计算
 * - 事件发射和回调处理
 * - 用户友好的通知系统
 * - 多导出任务并发管理
 */

import { ElLoading, ElMessage, ElNotification } from 'element-plus'
import type { LoadingInstance } from 'element-plus/es/components/loading/src/loading'
import {
  ExportStage
} from '@/types/export'
import type {
  ProgressState,
  ProgressCallback,
  CompletionCallback,
  ErrorCallback,
  ExportResult,
  ExportError,
  ExportWarning
} from '@/types/export'
import { exportNotificationService } from './exportNotificationService'

// 扩展的导出阶段定义，与types/export.ts保持一致
export type ExtendedExportStage = ExportStage | 'completed' | 'failed'

// 扩展的进度接口，兼容现有代码
export interface ExportProgress extends ProgressState {
  details?: string
}

export interface ExportStageConfig {
  stage: ExtendedExportStage
  message: string
  estimatedDuration: number // 预估持续时间（毫秒）
  weight: number // 在总进度中的权重
  description?: string // 阶段描述
  criticalPath?: boolean // 是否为关键路径
}

export interface ProgressOptions {
  showDetailedMessages: boolean
  showPercentage: boolean
  enableNotifications: boolean
  autoClose: boolean
  closeDelay: number
  enableTimeEstimation: boolean // 启用时间估算
  enableEventEmission: boolean // 启用事件发射
  adaptiveStaging: boolean // 自适应阶段调整
}

// 时间估算配置
export interface TimeEstimationConfig {
  enableLearning: boolean // 启用学习算法
  historicalDataWeight: number // 历史数据权重 (0-1)
  complexityFactors: {
    elementCount: number
    svgComplexity: number
    canvasSize: number
  }
}

// 事件发射器接口
export interface ProgressEventEmitter {
  on(event: string, callback: Function): void
  off(event: string, callback: Function): void
  emit(event: string, data: any): void
}

/**
 * 增强的导出进度跟踪器类
 * 提供实时进度跟踪、时间估算和事件管理功能
 */
export class ExportProgressTracker implements ProgressEventEmitter {
  private loadingInstance: LoadingInstance | null = null
  private currentProgress: ExportProgress | null = null
  private startTime: number = 0
  private stageStartTime: number = 0
  private stageHistory: Array<{ stage: ExtendedExportStage; duration: number; timestamp: number }> = []
  private eventListeners: Map<string, Function[]> = new Map()

  // 回调函数
  private progressCallback?: ProgressCallback
  private completionCallback?: CompletionCallback
  private errorCallback?: ErrorCallback

  // 时间估算相关
  private timeEstimationConfig: TimeEstimationConfig
  private complexityMetrics: { elementCount: number; svgComplexity: number; canvasSize: number } = {
    elementCount: 0,
    svgComplexity: 1,
    canvasSize: 1
  }

  // 增强的阶段配置
  private readonly stageConfigs: ExportStageConfig[] = [
    {
      stage: 'initializing',
      message: '正在初始化导出...',
      description: '准备导出环境和配置',
      estimatedDuration: 500,
      weight: 5,
      criticalPath: true
    },
    {
      stage: 'preparing_canvas',
      message: '正在准备画布内容...',
      description: '分析画布元素和结构',
      estimatedDuration: 1000,
      weight: 10,
      criticalPath: true
    },
    {
      stage: 'processing_svg',
      message: '正在处理SVG路径元素...',
      description: '优化SVG元素和路径数据',
      estimatedDuration: 2000,
      weight: 25,
      criticalPath: true
    },
    {
      stage: 'rendering',
      message: '正在渲染图像...',
      description: '执行画布到图像的转换',
      estimatedDuration: 3000,
      weight: 40,
      criticalPath: true
    },
    {
      stage: 'validating_quality',
      message: '正在验证导出质量...',
      description: '检查导出结果的完整性和质量',
      estimatedDuration: 800,
      weight: 8,
      criticalPath: false
    },
    {
      stage: 'generating_file',
      message: '正在生成文件...',
      description: '创建最终的导出文件',
      estimatedDuration: 1500,
      weight: 10,
      criticalPath: true
    },
    {
      stage: 'finalizing',
      message: '正在完成处理...',
      description: '清理资源和完成导出',
      estimatedDuration: 500,
      weight: 2,
      criticalPath: false
    }
  ]

  private defaultOptions: ProgressOptions = {
    showDetailedMessages: true,
    showPercentage: true,
    enableNotifications: true,
    autoClose: true,
    closeDelay: 2000,
    enableTimeEstimation: true,
    enableEventEmission: true,
    adaptiveStaging: true
  }

  private defaultTimeEstimationConfig: TimeEstimationConfig = {
    enableLearning: true,
    historicalDataWeight: 0.3,
    complexityFactors: {
      elementCount: 1.0,
      svgComplexity: 1.5,
      canvasSize: 1.2
    }
  }

  constructor(options?: Partial<ProgressOptions>, timeConfig?: Partial<TimeEstimationConfig>) {
    this.defaultOptions = { ...this.defaultOptions, ...options }
    this.timeEstimationConfig = { ...this.defaultTimeEstimationConfig, ...timeConfig }

    // 配置通知服务
    exportNotificationService.updateConfig({
      enableToast: this.defaultOptions.enableNotifications,
      enableNotification: this.defaultOptions.enableNotifications,
      showProgress: this.defaultOptions.showPercentage,
      showDetails: this.defaultOptions.showDetailedMessages
    })
  }

  // 事件发射器实现
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

  emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error)
        }
      })
    }
  }

  /**
   * 设置复杂度指标，用于更准确的时间估算
   * @param metrics 复杂度指标
   */
  setComplexityMetrics(metrics: Partial<typeof this.complexityMetrics>): void {
    this.complexityMetrics = { ...this.complexityMetrics, ...metrics }
  }

  /**
   * 设置回调函数
   * @param callbacks 回调函数对象
   */
  setCallbacks(callbacks: {
    onProgress?: ProgressCallback
    onComplete?: CompletionCallback
    onError?: ErrorCallback
  }): void {
    this.progressCallback = callbacks.onProgress
    this.completionCallback = callbacks.onComplete
    this.errorCallback = callbacks.onError
  }

  /**
   * 开始导出进度跟踪
   * @param options 进度选项
   * @param callback 进度回调函数（向后兼容）
   */
  startProgress(
    options: Partial<ProgressOptions> = {},
    callback?: (progress: ExportProgress) => void
  ): void {
    const mergedOptions = { ...this.defaultOptions, ...options }

    // 向后兼容性支持
    if (callback) {
      this.progressCallback = callback
    }

    this.startTime = Date.now()
    this.stageStartTime = this.startTime
    this.stageHistory = []

    // 创建加载实例
    this.loadingInstance = ElLoading.service({
      lock: true,
      text: '正在准备导出...',
      background: 'rgba(0, 0, 0, 0.7)',
      customClass: 'export-loading'
    })

    // 发射开始事件
    if (mergedOptions.enableEventEmission) {
      this.emit('progress:started', {
        timestamp: this.startTime,
        options: mergedOptions
      })
    }

    // 开始第一个阶段
    this.updateStage('initializing')
  }

  /**
   * 更新导出阶段
   * @param stage 新的阶段
   * @param details 详细信息
   */
  updateStage(stage: ExtendedExportStage, details?: string): void {
    const stageConfig = this.stageConfigs.find(config => config.stage === stage)
    if (!stageConfig) {
      console.warn(`未知的导出阶段: ${stage}`)
      return
    }

    // 记录上一个阶段的持续时间
    if (this.currentProgress && this.stageStartTime > 0) {
      const previousStageDuration = Date.now() - this.stageStartTime
      this.stageHistory.push({
        stage: this.currentProgress.stage as ExtendedExportStage,
        duration: previousStageDuration,
        timestamp: this.stageStartTime
      })
    }

    // 计算进度百分比
    const completedWeight = this.stageConfigs
      .filter(config => this.getStageOrder(config.stage) < this.getStageOrder(stage))
      .reduce((sum, config) => sum + config.weight, 0)

    const percentage = Math.min(100, completedWeight)

    // 计算预计剩余时间
    const estimatedTimeRemaining = this.calculateEstimatedTimeRemaining(stage)

    // 更新当前进度
    this.currentProgress = {
      stage: stage as ExportStage,
      progress: percentage,
      percentage, // 向后兼容
      message: stageConfig.message,
      details,
      timestamp: Date.now(),
      estimatedTimeRemaining
    }

    // 更新加载实例文本
    if (this.loadingInstance) {
      const displayText = this.formatProgressText(this.currentProgress)
      this.loadingInstance.setText(displayText)
    }

    // 调用回调函数
    if (this.progressCallback) {
      this.progressCallback(this.currentProgress)
    }

    // 通过通知服务显示进度
    if (this.defaultOptions.enableNotifications) {
      exportNotificationService.showProgressNotification(this.currentProgress)
    }

    // 发射进度事件
    if (this.defaultOptions.enableEventEmission) {
      this.emit('progress:stage-changed', {
        stage,
        progress: percentage,
        message: stageConfig.message,
        details,
        estimatedTimeRemaining
      })
    }

    // 记录阶段开始时间
    this.stageStartTime = Date.now()

    console.log(`导出进度: ${stage} (${percentage}%) - ${stageConfig.message}${estimatedTimeRemaining ? ` (预计剩余: ${this.formatDuration(estimatedTimeRemaining)})` : ''}`)
  }

  /**
   * 更新当前阶段的子进度
   * @param subPercentage 子进度百分比 (0-100)
   * @param subMessage 子进度消息
   */
  updateSubProgress(subPercentage: number, subMessage?: string): void {
    if (!this.currentProgress) return

    const stageConfig = this.stageConfigs.find(config => config.stage === this.currentProgress!.stage)
    if (!stageConfig) return

    // 计算当前阶段在总进度中的范围
    const completedWeight = this.stageConfigs
      .filter(config => this.getStageOrder(config.stage) < this.getStageOrder(this.currentProgress!.stage))
      .reduce((sum, config) => sum + config.weight, 0)

    // 计算当前阶段内的进度
    const stageProgress = (subPercentage / 100) * stageConfig.weight
    const totalPercentage = Math.min(100, completedWeight + stageProgress)

    // 重新计算预计剩余时间（基于子进度）
    const estimatedTimeRemaining = this.calculateEstimatedTimeRemaining(
      this.currentProgress.stage as ExtendedExportStage,
      subPercentage
    )

    // 更新进度
    this.currentProgress = {
      ...this.currentProgress,
      progress: totalPercentage,
      percentage: totalPercentage, // 向后兼容
      details: subMessage || this.currentProgress.details,
      timestamp: Date.now(),
      estimatedTimeRemaining
    }

    // 更新加载实例文本
    if (this.loadingInstance) {
      const displayText = this.formatProgressText(this.currentProgress)
      this.loadingInstance.setText(displayText)
    }

    // 调用回调函数
    if (this.progressCallback) {
      this.progressCallback(this.currentProgress)
    }

    // 发射子进度事件
    if (this.defaultOptions.enableEventEmission) {
      this.emit('progress:sub-progress', {
        stage: this.currentProgress.stage,
        subProgress: subPercentage,
        totalProgress: totalPercentage,
        message: subMessage,
        estimatedTimeRemaining
      })
    }
  }

  /**
   * 计算预计剩余时间
   * @param currentStage 当前阶段
   * @param subProgress 当前阶段的子进度 (0-100)
   * @returns 预计剩余时间（毫秒）
   */
  private calculateEstimatedTimeRemaining(currentStage: ExtendedExportStage, subProgress: number = 0): number | undefined {
    if (!this.defaultOptions.enableTimeEstimation || this.startTime === 0) {
      return undefined
    }

    const currentTime = Date.now()
    const elapsedTime = currentTime - this.startTime

    // 获取当前阶段配置
    const currentStageConfig = this.stageConfigs.find(config => config.stage === currentStage)
    if (!currentStageConfig) return undefined

    // 计算已完成的权重
    const completedStages = this.stageConfigs.filter(config =>
      this.getStageOrder(config.stage) < this.getStageOrder(currentStage)
    )
    const completedWeight = completedStages.reduce((sum, config) => sum + config.weight, 0)

    // 计算当前阶段的完成权重
    const currentStageProgress = (subProgress / 100) * currentStageConfig.weight
    const totalCompletedWeight = completedWeight + currentStageProgress

    // 总权重
    const totalWeight = this.stageConfigs.reduce((sum, config) => sum + config.weight, 0)

    if (totalCompletedWeight === 0) return undefined

    // 基础时间估算
    const estimatedTotalTime = (elapsedTime / totalCompletedWeight) * totalWeight
    const estimatedRemainingTime = Math.max(0, estimatedTotalTime - elapsedTime)

    // 应用复杂度因子
    const complexityMultiplier = this.calculateComplexityMultiplier()
    const adjustedRemainingTime = estimatedRemainingTime * complexityMultiplier

    // 应用历史数据学习（如果启用）
    if (this.timeEstimationConfig.enableLearning && this.stageHistory.length > 0) {
      const historicalAdjustment = this.calculateHistoricalAdjustment(currentStage)
      return Math.max(1000, adjustedRemainingTime * historicalAdjustment) // 最少1秒
    }

    return Math.max(1000, adjustedRemainingTime)
  }

  /**
   * 计算复杂度乘数
   * @returns 复杂度乘数
   */
  private calculateComplexityMultiplier(): number {
    const { elementCount, svgComplexity, canvasSize } = this.complexityMetrics
    const { complexityFactors } = this.timeEstimationConfig

    // 元素数量影响 (对数缩放)
    const elementFactor = Math.log10(Math.max(1, elementCount / 10)) * complexityFactors.elementCount

    // SVG复杂度影响
    const svgFactor = (svgComplexity - 1) * complexityFactors.svgComplexity

    // 画布大小影响 (平方根缩放)
    const sizeFactor = Math.sqrt(canvasSize) * complexityFactors.canvasSize

    return Math.max(0.5, Math.min(3.0, 1 + elementFactor + svgFactor + sizeFactor))
  }

  /**
   * 基于历史数据计算调整因子
   * @param currentStage 当前阶段
   * @returns 历史调整因子
   */
  private calculateHistoricalAdjustment(currentStage: ExtendedExportStage): number {
    // 简化的历史学习算法
    const relevantHistory = this.stageHistory.filter(h => h.stage === currentStage)
    if (relevantHistory.length === 0) return 1.0

    const avgHistoricalDuration = relevantHistory.reduce((sum, h) => sum + h.duration, 0) / relevantHistory.length
    const currentStageConfig = this.stageConfigs.find(c => c.stage === currentStage)

    if (!currentStageConfig) return 1.0

    const expectedDuration = currentStageConfig.estimatedDuration
    const historicalRatio = avgHistoricalDuration / expectedDuration

    // 应用历史数据权重
    const { historicalDataWeight } = this.timeEstimationConfig
    return (1 - historicalDataWeight) + (historicalDataWeight * historicalRatio)
  }

  /**
   * 完成导出进度
   * @param success 是否成功
   * @param message 完成消息
   * @param result 导出结果（可选）
   */
  completeProgress(success: boolean, message?: string, result?: ExportResult): void {
    const stage: ExtendedExportStage = success ? 'completed' : 'failed'
    const finalMessage = message || (success ? '导出完成！' : '导出失败')

    // 记录最后阶段的持续时间
    if (this.currentProgress && this.stageStartTime > 0) {
      const lastStageDuration = Date.now() - this.stageStartTime
      this.stageHistory.push({
        stage: this.currentProgress.stage as ExtendedExportStage,
        duration: lastStageDuration,
        timestamp: this.stageStartTime
      })
    }

    // 更新最终进度
    this.currentProgress = {
      stage: stage as ExportStage,
      progress: success ? 100 : this.currentProgress?.progress || 0,
      percentage: success ? 100 : this.currentProgress?.percentage || 0, // 向后兼容
      message: finalMessage,
      timestamp: Date.now(),
      estimatedTimeRemaining: 0
    }

    // 计算总耗时
    const totalDuration = Date.now() - this.startTime
    const durationText = this.formatDuration(totalDuration)

    // 关闭加载实例
    if (this.loadingInstance) {
      this.loadingInstance.close()
      this.loadingInstance = null
    }

    // 调用完成回调
    if (this.completionCallback && result) {
      this.completionCallback(result)
    }

    // 调用进度回调（向后兼容）
    if (this.progressCallback) {
      this.progressCallback(this.currentProgress)
    }

    // 发射完成事件
    if (this.defaultOptions.enableEventEmission) {
      this.emit(success ? 'progress:completed' : 'progress:failed', {
        success,
        message: finalMessage,
        duration: totalDuration,
        result,
        stageHistory: this.stageHistory
      })
    }

    // 通过通知服务显示完成通知
    if (success && result) {
      exportNotificationService.showSuccessNotification(result, finalMessage)
    } else if (!success) {
      exportNotificationService.showInfoNotification('导出失败', finalMessage)
    }

    // 显示完成通知（向后兼容）
    this.showCompletionNotification(success, finalMessage, durationText, result)

    console.log(`导出${success ? '成功' : '失败'}: ${finalMessage} (总耗时: ${durationText})`)
  }

  /**
   * 处理导出错误
   * @param error 导出错误
   * @param context 错误上下文
   */
  handleError(error: ExportError, context?: any): void {
    // 调用错误回调
    if (this.errorCallback) {
      this.errorCallback(error)
    }

    // 发射错误事件
    if (this.defaultOptions.enableEventEmission) {
      this.emit('progress:error', {
        error,
        context,
        stage: this.currentProgress?.stage,
        timestamp: Date.now()
      })
    }

    // 通过通知服务显示错误通知
    exportNotificationService.showErrorNotification(error, context)

    // 显示错误通知（向后兼容）
    this.showErrorNotification(error)

    // 完成进度（失败状态）
    this.completeProgress(false, `导出失败: ${error.message}`)
  }

  /**
   * 显示完成通知
   * @param success 是否成功
   * @param message 消息
   * @param duration 持续时间文本
   * @param result 导出结果
   */
  private showCompletionNotification(success: boolean, message: string, duration: string, result?: ExportResult): void {
    if (!this.defaultOptions.enableNotifications) return

    if (success) {
      let notificationMessage = `${message} (耗时: ${duration})`

      // 添加质量信息
      if (result?.qualityReport) {
        const qualityScore = Math.round(result.qualityReport.overallScore * 100)
        notificationMessage += `\n质量评分: ${qualityScore}%`

        if (result.warnings.length > 0) {
          notificationMessage += ` (${result.warnings.length} 个警告)`
        }
      }

      ElNotification({
        title: '导出成功',
        message: notificationMessage,
        type: 'success',
        duration: 4000,
        showClose: true
      })
    } else {
      ElNotification({
        title: '导出失败',
        message: message,
        type: 'error',
        duration: 6000,
        showClose: true
      })
    }
  }

  /**
   * 显示错误通知
   * @param error 导出错误
   */
  private showErrorNotification(error: ExportError): void {
    if (!this.defaultOptions.enableNotifications) return

    let errorMessage = error.message

    // 添加建议操作
    if (error.suggestedActions && error.suggestedActions.length > 0) {
      errorMessage += `\n\n建议操作:\n${error.suggestedActions.slice(0, 2).join('\n')}`
    }

    ElNotification({
      title: `导出错误 (${error.stage})`,
      message: errorMessage,
      type: 'error',
      duration: 8000,
      showClose: true
    })
  }

  /**
   * 取消导出进度
   */
  cancelProgress(): void {
    if (this.loadingInstance) {
      this.loadingInstance.close()
      this.loadingInstance = null
    }

    ElMessage.info('导出已取消')
    console.log('导出进度已取消')
  }

  /**
   * 获取当前进度
   * @returns 当前进度信息
   */
  getCurrentProgress(): ExportProgress | null {
    return this.currentProgress
  }

  /**
   * 显示阶段详细信息
   * @param stage 阶段
   * @param details 详细信息
   */
  showStageDetails(stage: ExtendedExportStage, details: string): void {
    if (!this.defaultOptions.enableNotifications) return

    ElMessage({
      message: `${this.getStageDisplayName(stage)}: ${details}`,
      type: 'info',
      duration: 2000,
      showClose: true
    })

    // 发射阶段详情事件
    if (this.defaultOptions.enableEventEmission) {
      this.emit('progress:stage-details', { stage, details })
    }
  }

  /**
   * 显示警告信息
   * @param warning 警告对象或消息字符串
   */
  showWarning(warning: ExportWarning | string): void {
    if (!this.defaultOptions.enableNotifications) return

    const warningMessage = typeof warning === 'string' ? warning : warning.message
    const severity = typeof warning === 'object' ? warning.severity : 'medium'

    // 根据严重程度调整显示时间
    const duration = severity === 'high' ? 5000 : severity === 'medium' ? 3000 : 2000

    ElMessage({
      message: warningMessage,
      type: 'warning',
      duration,
      showClose: true
    })

    // 发射警告事件
    if (this.defaultOptions.enableEventEmission) {
      this.emit('progress:warning', {
        warning: typeof warning === 'object' ? warning : {
          type: 'performance',
          message: warning,
          severity: 'medium'
        }
      })
    }
  }

  /**
   * 显示错误信息
   * @param error 错误对象或消息字符串
   */
  showError(error: ExportError | string): void {
    if (!this.defaultOptions.enableNotifications) return

    const errorMessage = typeof error === 'string' ? error : error.message

    ElMessage({
      message: errorMessage,
      type: 'error',
      duration: 6000,
      showClose: true
    })

    // 发射错误事件
    if (this.defaultOptions.enableEventEmission) {
      this.emit('progress:error-message', {
        error: typeof error === 'object' ? error : new Error(error)
      })
    }
  }

  /**
   * 批量显示警告
   * @param warnings 警告数组
   */
  showWarnings(warnings: ExportWarning[]): void {
    if (!warnings.length) return

    // 通过通知服务显示警告
    exportNotificationService.showWarningNotification(warnings, '导出过程中')

    // 向后兼容的警告显示
    if (!this.defaultOptions.enableNotifications) return

    // 按严重程度分组
    const criticalWarnings = warnings.filter(w => w.severity === 'high')
    const mediumWarnings = warnings.filter(w => w.severity === 'medium')
    const lowWarnings = warnings.filter(w => w.severity === 'low')

    // 显示关键警告
    if (criticalWarnings.length > 0) {
      ElNotification({
        title: `发现 ${criticalWarnings.length} 个重要警告`,
        message: criticalWarnings.slice(0, 3).map(w => `• ${w.message}`).join('\n'),
        type: 'warning',
        duration: 8000,
        showClose: true
      })
    }

    // 显示汇总信息
    if (mediumWarnings.length > 0 || lowWarnings.length > 0) {
      const totalCount = mediumWarnings.length + lowWarnings.length
      ElMessage({
        message: `导出完成，但有 ${totalCount} 个一般警告`,
        type: 'warning',
        duration: 4000,
        showClose: true
      })
    }

    // 发射批量警告事件
    if (this.defaultOptions.enableEventEmission) {
      this.emit('progress:warnings', { warnings })
    }
  }

  /**
   * 格式化进度文本
   * @param progress 进度信息
   * @returns 格式化的文本
   */
  private formatProgressText(progress: ExportProgress): string {
    let text = progress.message

    if (this.defaultOptions.showPercentage && progress.percentage > 0) {
      text += ` (${Math.round(progress.percentage)}%)`
    }

    if (progress.details && this.defaultOptions.showDetailedMessages) {
      text += `\n${progress.details}`
    }

    return text
  }

  /**
   * 获取阶段顺序
   * @param stage 阶段
   * @returns 阶段顺序号
   */
  private getStageOrder(stage: ExtendedExportStage): number {
    const stageOrder: Record<ExtendedExportStage, number> = {
      'initializing': 0,
      'preparing_canvas': 1,
      'processing_svg': 2,
      'rendering': 3,
      'validating_quality': 4,
      'generating_file': 5,
      'finalizing': 6,
      'completed': 7,
      'failed': 7
    }
    return stageOrder[stage] || 0
  }

  /**
   * 获取阶段显示名称
   * @param stage 阶段
   * @returns 显示名称
   */
  private getStageDisplayName(stage: ExtendedExportStage): string {
    const stageNames: Record<ExtendedExportStage, string> = {
      'initializing': '初始化',
      'preparing_canvas': '准备画布',
      'processing_svg': '处理SVG',
      'rendering': '渲染图像',
      'validating_quality': '质量验证',
      'generating_file': '生成文件',
      'finalizing': '完成处理',
      'completed': '已完成',
      'failed': '失败'
    }
    return stageNames[stage] || stage
  }

  /**
   * 获取当前阶段的详细信息
   * @returns 当前阶段配置
   */
  getCurrentStageInfo(): ExportStageConfig | null {
    if (!this.currentProgress) return null
    return this.stageConfigs.find(config => config.stage === this.currentProgress!.stage) || null
  }

  /**
   * 获取导出统计信息
   * @returns 统计信息
   */
  getExportStatistics(): {
    totalDuration: number
    stageCount: number
    averageStageTime: number
    slowestStage?: { stage: ExtendedExportStage; duration: number }
    fastestStage?: { stage: ExtendedExportStage; duration: number }
  } {
    const totalDuration = this.startTime > 0 ? Date.now() - this.startTime : 0
    const stageCount = this.stageHistory.length
    const averageStageTime = stageCount > 0 ?
      this.stageHistory.reduce((sum, s) => sum + s.duration, 0) / stageCount : 0

    let slowestStage, fastestStage
    if (stageCount > 0) {
      const sortedStages = [...this.stageHistory].sort((a, b) => b.duration - a.duration)
      slowestStage = { stage: sortedStages[0].stage, duration: sortedStages[0].duration }
      fastestStage = { stage: sortedStages[sortedStages.length - 1].stage, duration: sortedStages[sortedStages.length - 1].duration }
    }

    return {
      totalDuration,
      stageCount,
      averageStageTime,
      slowestStage,
      fastestStage
    }
  }

  /**
   * 格式化持续时间
   * @param ms 毫秒数
   * @returns 格式化的时间字符串
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`
    } else {
      const minutes = Math.floor(ms / 60000)
      const seconds = Math.floor((ms % 60000) / 1000)
      return `${minutes}m ${seconds}s`
    }
  }
}

/**
 * 导出状态管理器
 * 管理多个并发导出操作的状态
 */
export class ExportStatusManager {
  private activeExports = new Map<string, ExportProgressTracker>()

  /**
   * 创建新的导出跟踪器
   * @param exportId 导出ID
   * @param options 进度选项
   * @returns 进度跟踪器
   */
  createTracker(exportId: string, options?: Partial<ProgressOptions>): ExportProgressTracker {
    const tracker = new ExportProgressTracker()
    this.activeExports.set(exportId, tracker)
    return tracker
  }

  /**
   * 获取导出跟踪器
   * @param exportId 导出ID
   * @returns 进度跟踪器或null
   */
  getTracker(exportId: string): ExportProgressTracker | null {
    return this.activeExports.get(exportId) || null
  }

  /**
   * 移除导出跟踪器
   * @param exportId 导出ID
   */
  removeTracker(exportId: string): void {
    const tracker = this.activeExports.get(exportId)
    if (tracker) {
      tracker.cancelProgress()
      this.activeExports.delete(exportId)
    }
  }

  /**
   * 获取活跃的导出数量
   * @returns 活跃导出数量
   */
  getActiveExportCount(): number {
    return this.activeExports.size
  }

  /**
   * 取消所有活跃的导出
   */
  cancelAllExports(): void {
    for (const [exportId, tracker] of this.activeExports) {
      tracker.cancelProgress()
    }
    this.activeExports.clear()
  }
}

// 创建全局实例
export const exportStatusManager = new ExportStatusManager()
