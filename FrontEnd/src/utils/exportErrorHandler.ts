/**
 * 导出错误处理系统
 * 负责处理导出过程中的各种错误情况，提供用户友好的错误信息和重试机制
 */

import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'

// 错误类型定义
export interface ExportError {
  type: 'svg_rendering' | 'html2canvas' | 'canvas_backup' | 'file_generation' | 'network' | 'permission' | 'unknown'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  originalError?: Error
  context?: ExportContext
  recoverable: boolean
  retryable: boolean
}

export interface ExportContext {
  operation: 'png_export' | 'pdf_export' | 'json_export' | 'save_design'
  canvas?: HTMLElement
  fileName?: string
  options?: Record<string, unknown>
  attempt: number
  maxAttempts: number
}

export interface RecoveryResult {
  success: boolean
  result?: unknown
  error?: ExportError
  usedFallback: boolean
  fallbackMethod?: string
}

export interface RetryOptions {
  maxAttempts: number
  delayMs: number
  backoffMultiplier: number
  retryableErrors: ExportError['type'][]
}

/**
 * 导出错误处理器类
 */
export class ExportErrorHandler {
  private defaultRetryOptions: RetryOptions = {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 1.5,
    retryableErrors: ['svg_rendering', 'html2canvas', 'network']
  }

  /**
   * 处理SVG渲染错误
   * @param error 原始错误
   * @param context 导出上下文
   * @returns 恢复结果
   */
  async handleSVGRenderingError(error: Error, context: ExportContext): Promise<RecoveryResult> {
    const exportError: ExportError = {
      type: 'svg_rendering',
      severity: 'high',
      message: 'SVG元素渲染失败，路径可能无法正确显示',
      originalError: error,
      context,
      recoverable: true,
      retryable: true
    }

    console.warn('SVG渲染错误:', exportError)

    // 尝试多种恢复方案
    const recoveryMethods = [
      () => this.tryStyleInlineRecovery(context),
      () => this.tryCanvasBackupRendering(context),
      () => this.trySimplifiedRendering(context)
    ]

    for (const [index, recoveryMethod] of recoveryMethods.entries()) {
      try {
        const result = await recoveryMethod()
        if (result.success) {
          this.showRecoverySuccess(`使用备用方案${index + 1}成功导出`)
          return { ...result, usedFallback: true, fallbackMethod: `recovery_method_${index + 1}` }
        }
      } catch (recoveryError) {
        console.warn(`恢复方案${index + 1}失败:`, recoveryError)
      }
    }

    // 所有恢复方案都失败
    this.showUserFriendlyError(exportError)
    return { success: false, error: exportError, usedFallback: false }
  }

  /**
   * 处理html2canvas错误
   * @param error 原始错误
   * @param context 导出上下文
   * @returns 恢复结果
   */
  async handleHtml2CanvasError(error: Error, context: ExportContext): Promise<RecoveryResult> {
    const exportError: ExportError = {
      type: 'html2canvas',
      severity: 'high',
      message: 'html2canvas库处理失败，可能是由于复杂的SVG元素或样式问题',
      originalError: error,
      context,
      recoverable: true,
      retryable: true
    }

    console.warn('html2canvas错误:', exportError)

    // 尝试Canvas备用渲染
    try {
      const backupResult = await this.tryCanvasBackupRendering(context)
      if (backupResult.success) {
        this.showRecoverySuccess('使用Canvas备用渲染成功导出')
        return { ...backupResult, usedFallback: true, fallbackMethod: 'canvas_backup' }
      }
    } catch (backupError) {
      console.warn('Canvas备用渲染失败:', backupError)
    }

    // 尝试简化配置重试
    try {
      const simplifiedResult = await this.trySimplifiedRendering(context)
      if (simplifiedResult.success) {
        this.showRecoverySuccess('使用简化配置成功导出')
        return { ...simplifiedResult, usedFallback: true, fallbackMethod: 'simplified_config' }
      }
    } catch (simplifiedError) {
      console.warn('简化配置重试失败:', simplifiedError)
    }

    this.showUserFriendlyError(exportError)
    return { success: false, error: exportError, usedFallback: false }
  }

  /**
   * 处理文件生成错误
   * @param error 原始错误
   * @param context 导出上下文
   * @returns 恢复结果
   */
  async handleFileGenerationError(error: Error, context: ExportContext): Promise<RecoveryResult> {
    const exportError: ExportError = {
      type: 'file_generation',
      severity: 'medium',
      message: '文件生成失败，可能是由于内存不足或文件过大',
      originalError: error,
      context,
      recoverable: true,
      retryable: true
    }

    console.warn('文件生成错误:', exportError)

    // 尝试降低质量重新生成
    try {
      const lowerQualityResult = await this.tryLowerQualityGeneration(context)
      if (lowerQualityResult.success) {
        this.showRecoverySuccess('使用较低质量设置成功导出')
        return { ...lowerQualityResult, usedFallback: true, fallbackMethod: 'lower_quality' }
      }
    } catch (lowerQualityError) {
      console.warn('降低质量重试失败:', lowerQualityError)
    }

    this.showUserFriendlyError(exportError)
    return { success: false, error: exportError, usedFallback: false }
  }

  /**
   * 处理网络错误
   * @param error 原始错误
   * @param context 导出上下文
   * @returns 恢复结果
   */
  async handleNetworkError(error: Error, context: ExportContext): Promise<RecoveryResult> {
    const exportError: ExportError = {
      type: 'network',
      severity: 'medium',
      message: '网络连接失败，请检查网络连接后重试',
      originalError: error,
      context,
      recoverable: true,
      retryable: true
    }

    console.warn('网络错误:', exportError)

    // 网络错误通常需要用户手动重试
    this.showNetworkErrorDialog(exportError)
    return { success: false, error: exportError, usedFallback: false }
  }

  /**
   * 执行带重试的操作
   * @param operation 要执行的操作
   * @param context 导出上下文
   * @param options 重试选项
   * @returns 操作结果
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ExportContext,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const retryOptions = { ...this.defaultRetryOptions, ...options }
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt++) {
      try {
        context.attempt = attempt
        context.maxAttempts = retryOptions.maxAttempts

        return await operation()
      } catch (error) {
        lastError = error as Error
        console.warn(`导出尝试 ${attempt}/${retryOptions.maxAttempts} 失败:`, error)

        // 如果不是最后一次尝试，等待后重试
        if (attempt < retryOptions.maxAttempts) {
          const delay = retryOptions.delayMs * Math.pow(retryOptions.backoffMultiplier, attempt - 1)
          await this.delay(delay)

          // 显示重试提示
          ElMessage.info(`导出失败，正在进行第 ${attempt + 1} 次尝试...`)
        }
      }
    }

    // 所有重试都失败，抛出最后的错误
    throw lastError || new Error('导出操作失败')
  }

  /**
   * 显示用户友好的错误信息
   * @param error 导出错误
   */
  private showUserFriendlyError(error: ExportError): void {
    const userMessage = this.getUserFriendlyMessage(error)
    const suggestions = this.getErrorSuggestions(error)

    ElMessageBox.alert(
      `${userMessage}\n\n建议解决方案：\n${suggestions.join('\n')}`,
      '导出失败',
      {
        confirmButtonText: '确定',
        type: 'error',
        dangerouslyUseHTMLString: false
      }
    )
  }

  /**
   * 显示网络错误对话框
   * @param error 导出错误
   */
  private showNetworkErrorDialog(error: ExportError): void {
    ElMessageBox.confirm(
      '网络连接失败，无法完成导出操作。请检查网络连接后重试。',
      '网络错误',
      {
        confirmButtonText: '重试',
        cancelButtonText: '取消',
        type: 'warning'
      }
    ).then(() => {
      // 用户选择重试，可以触发重新导出
      ElMessage.info('请重新点击导出按钮')
    }).catch(() => {
      // 用户取消
    })
  }

  /**
   * 显示恢复成功提示
   * @param message 成功消息
   */
  private showRecoverySuccess(message: string): void {
    ElNotification({
      title: '导出成功',
      message: message,
      type: 'success',
      duration: 3000
    })
  }

  /**
   * 获取用户友好的错误消息
   * @param error 导出错误
   * @returns 用户友好的消息
   */
  private getUserFriendlyMessage(error: ExportError): string {
    switch (error.type) {
      case 'svg_rendering':
        return '路线图导出时遇到问题，部分路径可能无法正确显示。'
      case 'html2canvas':
        return '图片生成过程中遇到技术问题，可能是由于复杂的图形元素。'
      case 'canvas_backup':
        return '备用渲染方案也失败了，建议简化设计后重试。'
      case 'file_generation':
        return '文件生成失败，可能是由于设计过于复杂或系统资源不足。'
      case 'network':
        return '网络连接失败，无法完成导出操作。'
      case 'permission':
        return '没有足够的权限执行导出操作。'
      default:
        return '导出过程中遇到未知错误。'
    }
  }

  /**
   * 获取错误建议
   * @param error 导出错误
   * @returns 建议列表
   */
  private getErrorSuggestions(error: ExportError): string[] {
    const suggestions: string[] = []

    switch (error.type) {
      case 'svg_rendering':
        suggestions.push('• 尝试简化路线设计，减少复杂的路径')
        suggestions.push('• 检查是否有重叠或过于复杂的SVG元素')
        suggestions.push('• 尝试使用不同的导出格式')
        break
      case 'html2canvas':
        suggestions.push('• 尝试降低导出质量设置')
        suggestions.push('• 简化画布内容，移除不必要的元素')
        suggestions.push('• 刷新页面后重试')
        break
      case 'file_generation':
        suggestions.push('• 尝试降低导出质量或分辨率')
        suggestions.push('• 关闭其他占用内存的应用程序')
        suggestions.push('• 简化设计内容')
        break
      case 'network':
        suggestions.push('• 检查网络连接是否正常')
        suggestions.push('• 稍后重试')
        suggestions.push('• 尝试使用其他网络环境')
        break
      default:
        suggestions.push('• 刷新页面后重试')
        suggestions.push('• 检查浏览器控制台是否有更多错误信息')
        suggestions.push('• 联系技术支持')
    }

    return suggestions
  }

  /**
   * 尝试样式内联恢复
   * @param context 导出上下文
   * @returns 恢复结果
   */
  private async tryStyleInlineRecovery(context: ExportContext): Promise<RecoveryResult> {
    // 这里应该调用样式内联转换系统
    // 由于这是一个模拟实现，我们返回失败
    return { success: false }
  }

  /**
   * 尝试Canvas备用渲染
   * @param context 导出上下文
   * @returns 恢复结果
   */
  private async tryCanvasBackupRendering(context: ExportContext): Promise<RecoveryResult> {
    // 这里应该调用Canvas备用渲染系统
    // 由于这是一个模拟实现，我们返回失败
    return { success: false }
  }

  /**
   * 尝试简化渲染
   * @param context 导出上下文
   * @returns 恢复结果
   */
  private async trySimplifiedRendering(context: ExportContext): Promise<RecoveryResult> {
    // 这里应该使用简化的渲染配置
    // 由于这是一个模拟实现，我们返回失败
    return { success: false }
  }

  /**
   * 尝试降低质量生成
   * @param context 导出上下文
   * @returns 恢复结果
   */
  private async tryLowerQualityGeneration(context: ExportContext): Promise<RecoveryResult> {
    // 这里应该使用较低的质量设置重新生成
    // 由于这是一个模拟实现，我们返回失败
    return { success: false }
  }

  /**
   * 延迟函数
   * @param ms 延迟毫秒数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// 创建全局实例
export const exportErrorHandler = new ExportErrorHandler()
