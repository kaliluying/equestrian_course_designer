/**
 * PNG导出错误恢复系统
 * 实现回退渲染、性能质量降级和用户通知
 */

import {
  ExportFormat,
  ExportStage,
  ExportErrorType
} from '@/types/export'
import type {
  ExportError,
  ExportResult,
  PNGExportOptions,
  ProgressCallback,
  ExportWarning,
  ExportMetadata,
  QualityReport
} from '@/types/export'

/**
 * 错误恢复策略接口
 */
interface RecoveryStrategy {
  canHandle(error: ExportError): boolean
  recover(
    canvas: HTMLElement,
    options: Required<PNGExportOptions>,
    error: ExportError,
    onProgress?: ProgressCallback
  ): Promise<ExportResult>
  getStrategyName(): string
  getExpectedQuality(): number
}

/**
 * 降级选项接口
 */
interface DegradationOptions {
  reduceScale: boolean
  simplifyBackground: boolean
  disableEffects: boolean
  useBasicRendering: boolean
  skipComplexElements: boolean
}

/**
 * PNG导出错误恢复管理器
 */
export class PNGExportErrorRecovery {
  private recoveryStrategies: RecoveryStrategy[] = []
  private maxRecoveryAttempts = 3
  private degradationLevels: DegradationOptions[] = [
    // 级别1: 轻微降级
    {
      reduceScale: true,
      simplifyBackground: false,
      disableEffects: false,
      useBasicRendering: false,
      skipComplexElements: false
    },
    // 级别2: 中等降级
    {
      reduceScale: true,
      simplifyBackground: true,
      disableEffects: true,
      useBasicRendering: false,
      skipComplexElements: false
    },
    // 级别3: 重度降级
    {
      reduceScale: true,
      simplifyBackground: true,
      disableEffects: true,
      useBasicRendering: true,
      skipComplexElements: true
    }
  ]

  constructor() {
    this.initializeRecoveryStrategies()
  }

  /**
   * 尝试从导出错误中恢复
   */
  async attemptRecovery(
    canvas: HTMLElement,
    options: Required<PNGExportOptions>,
    error: ExportError,
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    const warnings: ExportWarning[] = []
    const errors: ExportError[] = [error]

    // 通知用户开始错误恢复
    this.notifyRecoveryStart(error, onProgress)

    // 尝试不同的恢复策略
    for (const strategy of this.recoveryStrategies) {
      if (strategy.canHandle(error)) {
        try {
          this.notifyRecoveryAttempt(strategy.getStrategyName(), onProgress)

          const result = await strategy.recover(canvas, options, error, onProgress)

          if (result.success) {
            // 添加恢复成功的警告信息
            result.warnings.push({
              type: 'quality',
              message: `使用 ${strategy.getStrategyName()} 策略成功恢复导出`,
              severity: 'medium',
              suggestedAction: `预期质量: ${(strategy.getExpectedQuality() * 100).toFixed(0)}%`
            })

            return result
          }
        } catch (recoveryError) {
          console.warn(`恢复策略 ${strategy.getStrategyName()} 失败:`, recoveryError)

          errors.push(this.createRecoveryError(recoveryError, strategy.getStrategyName()))
        }
      }
    }

    // 所有恢复策略都失败了，返回最终失败结果
    return this.createFinalFailureResult(canvas, options, errors, warnings)
  }

  /**
   * 检查错误是否可恢复
   */
  isRecoverable(error: ExportError): boolean {
    return this.recoveryStrategies.some(strategy => strategy.canHandle(error))
  }

  /**
   * 获取错误的建议恢复操作
   */
  getSuggestedRecoveryActions(error: ExportError): string[] {
    const actions: string[] = []

    for (const strategy of this.recoveryStrategies) {
      if (strategy.canHandle(error)) {
        actions.push(`尝试 ${strategy.getStrategyName()}`)
      }
    }

    if (actions.length === 0) {
      actions.push('错误不可恢复，请检查输入数据')
    }

    return actions
  }

  // 私有方法

  /**
   * 初始化恢复策略
   */
  private initializeRecoveryStrategies(): void {
    this.recoveryStrategies = [
      new FallbackCanvasStrategy(),
      new QualityDegradationStrategy(),
      new SimplifiedRenderingStrategy(),
      new BasicCanvasStrategy()
    ]
  }

  /**
   * 通知恢复开始
   */
  private notifyRecoveryStart(error: ExportError, onProgress?: ProgressCallback): void {
    if (onProgress) {
      onProgress({
        stage: ExportStage.RENDERING,
        progress: 0,
        message: `检测到 ${error.type} 错误，正在尝试恢复...`
      })
    }
  }

  /**
   * 通知恢复尝试
   */
  private notifyRecoveryAttempt(strategyName: string, onProgress?: ProgressCallback): void {
    if (onProgress) {
      onProgress({
        stage: ExportStage.RENDERING,
        progress: 25,
        message: `正在尝试 ${strategyName}...`
      })
    }
  }

  /**
   * 创建恢复错误
   */
  private createRecoveryError(error: any, strategyName: string): ExportError {
    const recoveryError = new Error(`恢复策略 ${strategyName} 失败: ${error.message}`) as ExportError
    recoveryError.type = ExportErrorType.FILE_GENERATION_ERROR
    recoveryError.stage = ExportStage.RENDERING
    recoveryError.recoverable = false
    recoveryError.context = {
      format: ExportFormat.PNG,
      options: {},
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    }
    recoveryError.suggestedActions = ['尝试其他恢复策略', '简化画布内容']

    return recoveryError
  }

  /**
   * 创建最终失败结果
   */
  private createFinalFailureResult(
    canvas: HTMLElement,
    options: Required<PNGExportOptions>,
    errors: ExportError[],
    warnings: ExportWarning[]
  ): ExportResult {
    return {
      success: false,
      format: ExportFormat.PNG,
      data: new Blob(),
      metadata: this.createFailureMetadata(options),
      qualityReport: this.createFailureQualityReport(),
      warnings,
      errors
    }
  }

  /**
   * 创建失败元数据
   */
  private createFailureMetadata(options: Required<PNGExportOptions>): ExportMetadata {
    return {
      fileName: options.fileName,
      fileSize: 0,
      dimensions: { width: 0, height: 0 },
      exportTime: 0,
      renderingMethod: 'recovery-failed',
      qualityScore: 0,
      timestamp: new Date().toISOString(),
      format: ExportFormat.PNG
    }
  }

  /**
   * 创建失败质量报告
   */
  private createFailureQualityReport(): QualityReport {
    return {
      overallScore: 0,
      pathCompleteness: 0,
      renderingAccuracy: 0,
      performanceMetrics: {
        renderingTime: 0,
        memoryUsage: 0,
        canvasSize: { width: 0, height: 0 },
        elementCount: 0,
        svgElementCount: 0
      },
      recommendations: ['所有恢复策略都失败了', '请简化画布内容或联系技术支持'],
      detailedIssues: []
    }
  }
}

/**
 * 回退Canvas策略 - 使用原生Canvas API
 */
class FallbackCanvasStrategy implements RecoveryStrategy {
  canHandle(error: ExportError): boolean {
    return error.type === ExportErrorType.HTML2CANVAS_ERROR ||
           error.type === ExportErrorType.SVG_RENDERING_ERROR
  }

  async recover(
    canvas: HTMLElement,
    options: Required<PNGExportOptions>,
    error: ExportError,
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    if (onProgress) {
      onProgress({
        stage: ExportStage.RENDERING,
        progress: 50,
        message: '正在使用原生Canvas API渲染...'
      })
    }

    const rect = canvas.getBoundingClientRect()
    const fallbackCanvas = document.createElement('canvas')

    // 使用较低的缩放比例以提高成功率
    const safeScale = Math.min(options.scale, 2)
    fallbackCanvas.width = rect.width * safeScale
    fallbackCanvas.height = rect.height * safeScale

    const ctx = fallbackCanvas.getContext('2d')
    if (!ctx) {
      throw new Error('无法创建Canvas 2D上下文')
    }

    // 设置背景
    if (options.backgroundColor !== 'transparent') {
      ctx.fillStyle = options.backgroundColor
      ctx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height)
    }

    // 简化渲染逻辑
    await this.renderSimplified(canvas, ctx, rect, safeScale)

    // 生成Blob
    const blob = await this.canvasToBlob(fallbackCanvas, options.quality)

    return {
      success: true,
      format: ExportFormat.PNG,
      data: blob,
      metadata: this.createMetadata(blob, fallbackCanvas, options),
      qualityReport: this.createQualityReport(fallbackCanvas),
      warnings: [{
        type: 'quality',
        message: '使用简化渲染，某些复杂元素可能丢失',
        severity: 'medium',
        suggestedAction: '检查导出结果的完整性'
      }],
      errors: []
    }
  }

  getStrategyName(): string {
    return '回退Canvas渲染'
  }

  getExpectedQuality(): number {
    return 0.6
  }

  private async renderSimplified(
    element: HTMLElement,
    ctx: CanvasRenderingContext2D,
    bounds: DOMRect,
    scale: number
  ): Promise<void> {
    ctx.scale(scale, scale)

    // 只渲染基本的形状和文本
    const textElements = element.querySelectorAll('*')

    for (const el of Array.from(textElements)) {
      const htmlEl = el as HTMLElement
      const rect = htmlEl.getBoundingClientRect()

      if (rect.width > 0 && rect.height > 0) {
        const x = rect.left - bounds.left
        const y = rect.top - bounds.top

        // 绘制背景色
        const computedStyle = window.getComputedStyle(htmlEl)
        if (computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          ctx.fillStyle = computedStyle.backgroundColor
          ctx.fillRect(x, y, rect.width, rect.height)
        }

        // 绘制文本
        if (htmlEl.textContent && htmlEl.textContent.trim()) {
          ctx.fillStyle = computedStyle.color || '#000000'
          ctx.font = `${computedStyle.fontSize} ${computedStyle.fontFamily}`
          ctx.fillText(htmlEl.textContent.trim(), x + 5, y + rect.height / 2)
        }
      }
    }
  }

  private canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Canvas转Blob失败')),
        'image/png',
        quality
      )
    })
  }

  private createMetadata(blob: Blob, canvas: HTMLCanvasElement, options: Required<PNGExportOptions>): ExportMetadata {
    return {
      fileName: options.fileName,
      fileSize: blob.size,
      dimensions: { width: canvas.width, height: canvas.height },
      exportTime: 0,
      renderingMethod: 'fallback-canvas',
      qualityScore: 0.6,
      timestamp: new Date().toISOString(),
      format: ExportFormat.PNG
    }
  }

  private createQualityReport(canvas: HTMLCanvasElement): QualityReport {
    return {
      overallScore: 0.6,
      pathCompleteness: 40,
      renderingAccuracy: 0.6,
      performanceMetrics: {
        renderingTime: 0,
        memoryUsage: 0,
        canvasSize: { width: canvas.width, height: canvas.height },
        elementCount: 0,
        svgElementCount: 0
      },
      recommendations: ['使用了简化渲染，建议检查结果完整性'],
      detailedIssues: []
    }
  }
}

/**
 * 质量降级策略 - 降低质量设置
 */
class QualityDegradationStrategy implements RecoveryStrategy {
  canHandle(error: ExportError): boolean {
    return error.type === ExportErrorType.MEMORY_ERROR ||
           error.type === ExportErrorType.TIMEOUT_ERROR
  }

  async recover(
    canvas: HTMLElement,
    options: Required<PNGExportOptions>,
    error: ExportError,
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    // 创建降级选项
    const degradedOptions = this.createDegradedOptions(options)

    if (onProgress) {
      onProgress({
        stage: ExportStage.RENDERING,
        progress: 50,
        message: '正在使用降级质量设置重试...'
      })
    }

    // 动态导入PNG导出引擎并重试
    const { pngExportEngine } = await import('./pngExportEngine')
    return await pngExportEngine.exportToPNG(canvas, degradedOptions, onProgress)
  }

  getStrategyName(): string {
    return '质量降级重试'
  }

  getExpectedQuality(): number {
    return 0.7
  }

  private createDegradedOptions(options: Required<PNGExportOptions>): Required<PNGExportOptions> {
    return {
      ...options,
      scale: Math.max(options.scale * 0.5, 1), // 减半缩放
      quality: Math.max(options.quality * 0.8, 0.5), // 降低质量
      timeout: options.timeout * 2, // 增加超时时间
      includeWatermark: false // 禁用水印以减少处理
    }
  }
}

/**
 * 简化渲染策略 - 跳过复杂元素
 */
class SimplifiedRenderingStrategy implements RecoveryStrategy {
  canHandle(error: ExportError): boolean {
    return error.type === ExportErrorType.SVG_RENDERING_ERROR ||
           error.type === ExportErrorType.HTML2CANVAS_ERROR
  }

  async recover(
    canvas: HTMLElement,
    options: Required<PNGExportOptions>,
    error: ExportError,
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    if (onProgress) {
      onProgress({
        stage: ExportStage.RENDERING,
        progress: 50,
        message: '正在简化画布内容...'
      })
    }

    // 创建简化的画布副本
    const simplifiedCanvas = await this.createSimplifiedCanvas(canvas)

    // 使用简化的画布重新导出
    const { pngExportEngine } = await import('./pngExportEngine')
    return await pngExportEngine.exportToPNG(simplifiedCanvas, options, onProgress)
  }

  getStrategyName(): string {
    return '简化渲染'
  }

  getExpectedQuality(): number {
    return 0.75
  }

  private async createSimplifiedCanvas(canvas: HTMLElement): Promise<HTMLElement> {
    const clonedCanvas = canvas.cloneNode(true) as HTMLElement

    // 移除复杂的SVG元素
    const complexSVGs = clonedCanvas.querySelectorAll('svg[viewBox*="complex"], svg path[d*="C"]')
    complexSVGs.forEach(el => el.remove())

    // 简化样式
    const styledElements = clonedCanvas.querySelectorAll('*[style]')
    styledElements.forEach(el => {
      const htmlEl = el as HTMLElement
      // 保留基本样式，移除复杂效果
      const basicStyles = ['color', 'background-color', 'font-size', 'width', 'height']
      const currentStyle = htmlEl.style.cssText
      htmlEl.style.cssText = ''

      basicStyles.forEach(prop => {
        const value = window.getComputedStyle(htmlEl).getPropertyValue(prop)
        if (value) {
          htmlEl.style.setProperty(prop, value)
        }
      })
    })

    return clonedCanvas
  }
}

/**
 * 基础Canvas策略 - 最简单的渲染
 */
class BasicCanvasStrategy implements RecoveryStrategy {
  canHandle(error: ExportError): boolean {
    return true // 可以处理任何错误，作为最后的回退
  }

  async recover(
    canvas: HTMLElement,
    options: Required<PNGExportOptions>,
    error: ExportError,
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    if (onProgress) {
      onProgress({
        stage: ExportStage.RENDERING,
        progress: 50,
        message: '正在使用基础渲染模式...'
      })
    }

    const rect = canvas.getBoundingClientRect()
    const basicCanvas = document.createElement('canvas')

    basicCanvas.width = rect.width
    basicCanvas.height = rect.height

    const ctx = basicCanvas.getContext('2d')
    if (!ctx) {
      throw new Error('无法创建基础Canvas上下文')
    }

    // 绘制纯色背景
    ctx.fillStyle = options.backgroundColor === 'transparent' ? '#ffffff' : options.backgroundColor
    ctx.fillRect(0, 0, basicCanvas.width, basicCanvas.height)

    // 添加错误信息文本
    ctx.fillStyle = '#666666'
    ctx.font = '16px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('导出遇到问题', basicCanvas.width / 2, basicCanvas.height / 2 - 20)
    ctx.fillText('使用基础渲染模式', basicCanvas.width / 2, basicCanvas.height / 2 + 20)

    const blob = await this.canvasToBlob(basicCanvas, options.quality)

    return {
      success: true,
      format: ExportFormat.PNG,
      data: blob,
      metadata: this.createMetadata(blob, basicCanvas, options),
      qualityReport: this.createQualityReport(),
      warnings: [{
        type: 'quality',
        message: '使用基础渲染模式，内容可能不完整',
        severity: 'high',
        suggestedAction: '检查原始画布内容或联系技术支持'
      }],
      errors: []
    }
  }

  getStrategyName(): string {
    return '基础渲染模式'
  }

  getExpectedQuality(): number {
    return 0.3
  }

  private canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('基础Canvas转Blob失败')),
        'image/png',
        quality
      )
    })
  }

  private createMetadata(blob: Blob, canvas: HTMLCanvasElement, options: Required<PNGExportOptions>): ExportMetadata {
    return {
      fileName: options.fileName,
      fileSize: blob.size,
      dimensions: { width: canvas.width, height: canvas.height },
      exportTime: 0,
      renderingMethod: 'basic-canvas',
      qualityScore: 0.3,
      timestamp: new Date().toISOString(),
      format: ExportFormat.PNG
    }
  }

  private createQualityReport(): QualityReport {
    return {
      overallScore: 0.3,
      pathCompleteness: 0,
      renderingAccuracy: 0.3,
      performanceMetrics: {
        renderingTime: 0,
        memoryUsage: 0,
        canvasSize: { width: 0, height: 0 },
        elementCount: 0,
        svgElementCount: 0
      },
      recommendations: ['使用了基础渲染模式', '原始内容可能无法正确显示'],
      detailedIssues: []
    }
  }
}

// 创建全局错误恢复实例
export const pngExportErrorRecovery = new PNGExportErrorRecovery()
