/**
 * 导出进度跟踪系统
 * 负责跟踪导出过程的进度，提供详细的状态反馈和用户提示
 */

import { ElLoading, ElMessage, ElNotification } from 'element-plus'
import type { LoadingInstance } from 'element-plus/es/components/loading/src/loading'

// 导出阶段定义
export type ExportStage =
  | 'initializing'      // 初始化
  | 'preparing_canvas'  // 准备画布
  | 'processing_svg'    // 处理SVG元素
  | 'rendering'         // 渲染图像
  | 'generating_file'   // 生成文件
  | 'finalizing'        // 完成处理
  | 'completed'         // 完成
  | 'failed'            // 失败

export interface ExportProgress {
  stage: ExportStage
  percentage: number
  message: string
  details?: string
  timestamp: number
}

export interface ExportStageConfig {
  stage: ExportStage
  message: string
  estimatedDuration: number // 预估持续时间（毫秒）
  weight: number // 在总进度中的权重
}

export interface ProgressOptions {
  showDetailedMessages: boolean
  showPercentage: boolean
  enableNotifications: boolean
  autoClose: boolean
  closeDelay: number
}

/**
 * 导出进度跟踪器类
 */
export class ExportProgressTracker {
  private loadingInstance: LoadingInstance | null = null
  private currentProgress: ExportProgress | null = null
  private startTime: number = 0
  private stageStartTime: number = 0
  private progressCallback?: (progress: ExportProgress) => void

  // 默认阶段配置
  private readonly stageConfigs: ExportStageConfig[] = [
    {
      stage: 'initializing',
      message: '正在初始化导出...',
      estimatedDuration: 500,
      weight: 5
    },
    {
      stage: 'preparing_canvas',
      message: '正在准备画布内容...',
      estimatedDuration: 1000,
      weight: 10
    },
    {
      stage: 'processing_svg',
      message: '正在处理SVG路径元素...',
      estimatedDuration: 2000,
      weight: 25
    },
    {
      stage: 'rendering',
      message: '正在渲染图像...',
      estimatedDuration: 3000,
      weight: 40
    },
    {
      stage: 'generating_file',
      message: '正在生成文件...',
      estimatedDuration: 1500,
      weight: 15
    },
    {
      stage: 'finalizing',
      message: '正在完成处理...',
      estimatedDuration: 500,
      weight: 5
    }
  ]

  private defaultOptions: ProgressOptions = {
    showDetailedMessages: true,
    showPercentage: true,
    enableNotifications: true,
    autoClose: true,
    closeDelay: 2000
  }

  /**
   * 开始导出进度跟踪
   * @param options 进度选项
   * @param callback 进度回调函数
   */
  startProgress(
    options: Partial<ProgressOptions> = {},
    callback?: (progress: ExportProgress) => void
  ): void {
    const mergedOptions = { ...this.defaultOptions, ...options }
    this.progressCallback = callback
    this.startTime = Date.now()
    this.stageStartTime = this.startTime

    // 创建加载实例
    this.loadingInstance = ElLoading.service({
      lock: true,
      text: '正在准备导出...',
      background: 'rgba(0, 0, 0, 0.7)',
      customClass: 'export-loading'
    })

    // 开始第一个阶段
    this.updateStage('initializing')
  }

  /**
   * 更新导出阶段
   * @param stage 新的阶段
   * @param details 详细信息
   */
  updateStage(stage: ExportStage, details?: string): void {
    const stageConfig = this.stageConfigs.find(config => config.stage === stage)
    if (!stageConfig) {
      console.warn(`未知的导出阶段: ${stage}`)
      return
    }

    // 计算进度百分比
    const completedWeight = this.stageConfigs
      .filter(config => this.getStageOrder(config.stage) < this.getStageOrder(stage))
      .reduce((sum, config) => sum + config.weight, 0)

    const percentage = Math.min(100, completedWeight)

    // 更新当前进度
    this.currentProgress = {
      stage,
      percentage,
      message: stageConfig.message,
      details,
      timestamp: Date.now()
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

    // 记录阶段开始时间
    this.stageStartTime = Date.now()

    console.log(`导出进度: ${stage} (${percentage}%) - ${stageConfig.message}`)
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

    // 更新进度
    this.currentProgress = {
      ...this.currentProgress,
      percentage: totalPercentage,
      details: subMessage || this.currentProgress.details,
      timestamp: Date.now()
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
  }

  /**
   * 完成导出进度
   * @param success 是否成功
   * @param message 完成消息
   */
  completeProgress(success: boolean, message?: string): void {
    const stage: ExportStage = success ? 'completed' : 'failed'
    const finalMessage = message || (success ? '导出完成！' : '导出失败')

    // 更新最终进度
    this.currentProgress = {
      stage,
      percentage: success ? 100 : this.currentProgress?.percentage || 0,
      message: finalMessage,
      timestamp: Date.now()
    }

    // 计算总耗时
    const totalDuration = Date.now() - this.startTime
    const durationText = this.formatDuration(totalDuration)

    // 关闭加载实例
    if (this.loadingInstance) {
      this.loadingInstance.close()
      this.loadingInstance = null
    }

    // 显示完成通知
    if (success) {
      ElNotification({
        title: '导出成功',
        message: `${finalMessage} (耗时: ${durationText})`,
        type: 'success',
        duration: 3000
      })
    } else {
      ElNotification({
        title: '导出失败',
        message: finalMessage,
        type: 'error',
        duration: 5000
      })
    }

    // 调用回调函数
    if (this.progressCallback) {
      this.progressCallback(this.currentProgress)
    }

    console.log(`导出${success ? '成功' : '失败'}: ${finalMessage} (总耗时: ${durationText})`)
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
  showStageDetails(stage: ExportStage, details: string): void {
    ElMessage({
      message: `${this.getStageDisplayName(stage)}: ${details}`,
      type: 'info',
      duration: 2000,
      showClose: true
    })
  }

  /**
   * 显示警告信息
   * @param message 警告消息
   */
  showWarning(message: string): void {
    ElMessage({
      message: message,
      type: 'warning',
      duration: 3000,
      showClose: true
    })
  }

  /**
   * 显示错误信息
   * @param message 错误消息
   */
  showError(message: string): void {
    ElMessage({
      message: message,
      type: 'error',
      duration: 5000,
      showClose: true
    })
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
  private getStageOrder(stage: ExportStage): number {
    const stageOrder: Record<ExportStage, number> = {
      'initializing': 0,
      'preparing_canvas': 1,
      'processing_svg': 2,
      'rendering': 3,
      'generating_file': 4,
      'finalizing': 5,
      'completed': 6,
      'failed': 6
    }
    return stageOrder[stage] || 0
  }

  /**
   * 获取阶段显示名称
   * @param stage 阶段
   * @returns 显示名称
   */
  private getStageDisplayName(stage: ExportStage): string {
    const stageNames: Record<ExportStage, string> = {
      'initializing': '初始化',
      'preparing_canvas': '准备画布',
      'processing_svg': '处理SVG',
      'rendering': '渲染图像',
      'generating_file': '生成文件',
      'finalizing': '完成处理',
      'completed': '已完成',
      'failed': '失败'
    }
    return stageNames[stage] || stage
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
