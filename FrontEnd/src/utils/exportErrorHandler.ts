/**
 * 增强导出系统 - 错误处理基础设施
 * 提供详细的错误处理、重试机制和回退策略
 */

import type {
  ExportError,
  ExportContext,
  RecoveryStrategy,
  RecoveryResult,
  AlternativeApproach,
  RetryConfig
} from '@/types/export'
import {
  ExportErrorType,
  ExportStage
} from '@/types/export'

/**
 * 导出错误类 - 扩展标准Error以包含详细上下文
 */
export class ExportErrorImpl extends Error implements ExportError {
  public readonly type: ExportErrorType
  public readonly stage: ExportStage
  public readonly recoverable: boolean
  public readonly context: any
  public readonly suggestedActions: string[]

  constructor(
    message: string,
    type: ExportErrorType,
    stage: ExportStage,
    recoverable: boolean = true,
    context: any = {},
    suggestedActions: string[] = []
  ) {
    super(message)
    this.name = 'ExportError'
    this.type = type
    this.stage = stage
    this.recoverable = recoverable
    this.context = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      ...context
    }
    this.suggestedActions = suggestedActions.length > 0 ? suggestedActions : this.getDefaultSuggestedActions()
  }

  /**
   * 获取默认的建议操作
   */
  private getDefaultSuggestedActions(): string[] {
    switch (this.type) {
      case ExportErrorType.CANVAS_ACCESS_ERROR:
        return ['检查画布元素是否存在', '确认画布内容已完全加载', '尝试刷新页面']
      case ExportErrorType.SVG_RENDERING_ERROR:
        return ['检查SVG元素样式', '尝试使用备用渲染器', '简化设计复杂度']
      case ExportErrorType.HTML2CANVAS_ERROR:
        return ['检查浏览器兼容性', '尝试降低导出质量', '使用备用渲染方法']
      case ExportErrorType.FILE_GENERATION_ERROR:
        return ['检查可用存储空间', '尝试降低导出分辨率', '重新尝试导出']
      case ExportErrorType.MEMORY_ERROR:
        return ['关闭其他浏览器标签页', '降低导出分辨率', '简化设计内容']
      case ExportErrorType.TIMEOUT_ERROR:
        return ['增加超时时间', '简化设计复杂度', '检查网络连接']
      default:
        return ['重新尝试操作', '检查浏览器控制台错误', '联系技术支持']
    }
  }
}

/**
 * 重试管理器 - 处理指数退避重试逻辑
 */
export class RetryManager {
  private config: RetryConfig

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxRetries: 3,
      baseDelay: 1000, // 1秒
      maxDelay: 10000, // 10秒
      backoffMultiplier: 2,
      retryableErrors: [
        ExportErrorType.HTML2CANVAS_ERROR,
        ExportErrorType.SVG_RENDERING_ERROR,
        ExportErrorType.TIMEOUT_ERROR,
        ExportErrorType.MEMORY_ERROR
      ],
      ...config
    }
  }

  /**
   * 执行带重试的操作
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ExportContext,
    onRetry?: (attempt: number, error: ExportError) => void
  ): Promise<T> {
    let lastError: ExportError | null = null

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // 等待退避时间
          const delay = this.calculateDelay(attempt)
          await this.sleep(delay)

          if (onRetry) {
            onRetry(attempt, lastError!)
          }
        }

        return await operation()
      } catch (error) {
        lastError = this.normalizeError(error, context)

        // 检查是否可重试
        if (!this.isRetryable(lastError) || attempt === this.config.maxRetries) {
          throw lastError
        }

        console.warn(`导出操作失败，将进行第 ${attempt + 1} 次重试:`, lastError.message)
      }
    }

    throw lastError!
  }

  /**
   * 检查错误是否可重试
   */
  isRetryable(error: ExportError): boolean {
    return error.recoverable && this.config.retryableErrors.includes(error.type)
  }

  /**
   * 计算退避延迟时间
   */
  private calculateDelay(attempt: number): number {
    const delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1)
    return Math.min(delay, this.config.maxDelay)
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 标准化错误对象
   */
  private normalizeError(error: any, context: ExportContext): ExportError {
    if (error instanceof ExportErrorImpl) {
      return error
    }

    // 根据错误消息推断错误类型
    let errorType = ExportErrorType.HTML2CANVAS_ERROR
    let stage = ExportStage.RENDERING

    if (error.message?.includes('canvas')) {
      errorType = ExportErrorType.CANVAS_ACCESS_ERROR
      stage = ExportStage.PREPARING_CANVAS
    } else if (error.message?.includes('svg')) {
      errorType = ExportErrorType.SVG_RENDERING_ERROR
      stage = ExportStage.PROCESSING_SVG
    } else if (error.message?.includes('memory') || error.message?.includes('Memory')) {
      errorType = ExportErrorType.MEMORY_ERROR
    } else if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
      errorType = ExportErrorType.TIMEOUT_ERROR
    }

    return new ExportErrorImpl(
      error.message || '未知导出错误',
      errorType,
      stage,
      true,
      { originalError: error, context }
    )
  }
}

/**
 * 回退管理器 - 提供替代渲染方法
 */
export class FallbackManager implements RecoveryStrategy {
  /**
   * 检查是否可以恢复
   */
  canRecover(error: ExportError): boolean {
    // 大多数渲染错误都可以通过回退方法恢复
    return [
      ExportErrorType.HTML2CANVAS_ERROR,
      ExportErrorType.SVG_RENDERING_ERROR,
      ExportErrorType.CANVAS_ACCESS_ERROR,
      ExportErrorType.MEMORY_ERROR
    ].includes(error.type)
  }

  /**
   * 执行恢复操作
   */
  async recover(error: ExportError, context: ExportContext): Promise<RecoveryResult> {
    const approach = this.getAlternativeApproach(error)

    try {
      console.log(`尝试使用回退方法: ${approach.method}`)

      // 这里将在后续任务中实现具体的回退渲染逻辑
      const result = await this.executeAlternativeApproach(approach, context)

      return {
        success: true,
        result,
        fallbackUsed: true,
        qualityDegraded: approach.expectedQuality < 0.9
      }
    } catch (fallbackError) {
      console.error('回退方法也失败了:', fallbackError)

      return {
        success: false,
        fallbackUsed: true,
        qualityDegraded: true
      }
    }
  }

  /**
   * 获取替代方法
   */
  getAlternativeApproach(error: ExportError): AlternativeApproach {
    switch (error.type) {
      case ExportErrorType.HTML2CANVAS_ERROR:
        return {
          method: 'backup_renderer',
          options: {
            useCanvas2D: true,
            elementByElement: true,
            simplifyPaths: false
          },
          expectedQuality: 0.85
        }

      case ExportErrorType.SVG_RENDERING_ERROR:
        return {
          method: 'simplified_svg',
          options: {
            removeComplexPaths: true,
            inlineStyles: true,
            convertToBasicShapes: true
          },
          expectedQuality: 0.75
        }

      case ExportErrorType.MEMORY_ERROR:
        return {
          method: 'reduced_quality',
          options: {
            scale: 1,
            quality: 0.7,
            removeNonEssentialElements: true
          },
          expectedQuality: 0.6
        }

      case ExportErrorType.CANVAS_ACCESS_ERROR:
        return {
          method: 'canvas_fallback',
          options: {
            recreateCanvas: true,
            waitForLoad: true,
            useAlternativeSelector: true
          },
          expectedQuality: 0.9
        }

      default:
        return {
          method: 'backup_renderer',
          options: {
            useCanvas2D: true,
            simplifyPaths: true
          },
          expectedQuality: 0.7
        }
    }
  }

  /**
   * 执行替代方法（占位符实现）
   */
  private async executeAlternativeApproach(
    approach: AlternativeApproach,
    context: ExportContext
  ): Promise<any> {
    // 这里将在后续任务中实现具体的替代渲染逻辑
    throw new ExportErrorImpl(
      '替代渲染方法尚未实现',
      ExportErrorType.HTML2CANVAS_ERROR,
      ExportStage.RENDERING,
      false
    )
  }
}

/**
 * 错误分析器 - 分析错误模式和趋势
 */
export class ErrorAnalyzer {
  private errorHistory: ExportError[] = []
  private readonly maxHistorySize = 100

  /**
   * 记录错误
   */
  recordError(error: ExportError): void {
    this.errorHistory.push(error)

    // 保持历史记录大小限制
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift()
    }
  }

  /**
   * 获取错误统计
   */
  getErrorStatistics(): {
    totalErrors: number
    errorsByType: Record<ExportErrorType, number>
    errorsByStage: Record<ExportStage, number>
    recentErrorRate: number
  } {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000

    const recentErrors = this.errorHistory.filter(error =>
      new Date(error.context.timestamp).getTime() > oneHourAgo
    )

    const errorsByType = {} as Record<ExportErrorType, number>
    const errorsByStage = {} as Record<ExportStage, number>

    this.errorHistory.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1
      errorsByStage[error.stage] = (errorsByStage[error.stage] || 0) + 1
    })

    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      errorsByStage,
      recentErrorRate: recentErrors.length
    }
  }

  /**
   * 获取最常见的错误类型
   */
  getMostCommonErrorType(): ExportErrorType | null {
    if (this.errorHistory.length === 0) return null

    const stats = this.getErrorStatistics()
    const entries = Object.entries(stats.errorsByType) as [ExportErrorType, number][]

    return entries.reduce((max, current) =>
      current[1] > max[1] ? current : max
    )[0]
  }

  /**
   * 检查是否存在错误模式
   */
  detectErrorPatterns(): {
    hasPattern: boolean
    pattern?: string
    recommendation?: string
  } {
    const recentErrors = this.errorHistory.slice(-10)

    if (recentErrors.length < 3) {
      return { hasPattern: false }
    }

    // 检查连续的相同错误类型
    const sameTypeCount = recentErrors.filter(error =>
      error.type === recentErrors[recentErrors.length - 1].type
    ).length

    if (sameTypeCount >= 3) {
      const errorType = recentErrors[recentErrors.length - 1].type
      return {
        hasPattern: true,
        pattern: `连续出现 ${sameTypeCount} 次 ${errorType} 错误`,
        recommendation: this.getPatternRecommendation(errorType)
      }
    }

    return { hasPattern: false }
  }

  /**
   * 获取模式建议
   */
  private getPatternRecommendation(errorType: ExportErrorType): string {
    switch (errorType) {
      case ExportErrorType.MEMORY_ERROR:
        return '考虑降低导出分辨率或简化设计复杂度'
      case ExportErrorType.SVG_RENDERING_ERROR:
        return '检查SVG元素的样式和结构，考虑使用备用渲染器'
      case ExportErrorType.TIMEOUT_ERROR:
        return '增加超时时间或优化渲染性能'
      default:
        return '检查浏览器兼容性和网络连接'
    }
  }
}

// 创建全局实例
export const retryManager = new RetryManager()
export const fallbackManager = new FallbackManager()
export const errorAnalyzer = new ErrorAnalyzer()

// 创建统一的错误处理器实例
export const exportErrorHandler = {
  retryManager,
  fallbackManager,
  errorAnalyzer,
  createError: createExportError
}

// 导出工厂函数
export function createExportError(
  message: string,
  type: ExportErrorType,
  stage: ExportStage,
  recoverable: boolean = true,
  context: any = {},
  suggestedActions: string[] = []
): ExportError {
  return new ExportErrorImpl(message, type, stage, recoverable, context, suggestedActions)
}

// 导出类型和实例
// 注意：ExportError 类型应该从 @/types/export 导入
// ExportErrorImpl 类已在上面通过 export class 导出
export type { ExportContext }
export default {
  RetryManager,
  FallbackManager,
  ErrorAnalyzer,
  createExportError,
  retryManager,
  fallbackManager,
  errorAnalyzer
}
