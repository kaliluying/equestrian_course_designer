/**
 * 增强导出系统 - 导出管理器核心模块
 * 负责协调所有导出操作，管理配置和事件系统
 */

import {
  ExportFormat,
  ExportStage,
  ExportErrorType
} from '@/types/export'
import type {
  ExportOptions,
  ExportResult,
  ExportError,
  ProgressState,
  ProgressCallback,
  CompletionCallback,
  ErrorCallback,
  ExportContext,
  ExportPreferences,
  ExportPreset,
  PNGExportOptions,
  PDFExportOptions,
  JSONExportOptions
} from '@/types/export'

/**
 * 导出管理器类 - 系统的核心协调器
 */
export class ExportManager {
  private preferences: ExportPreferences
  private presets: Map<string, ExportPreset> = new Map()
  private activeExports: Map<string, ExportContext> = new Map()
  private eventListeners: Map<string, Array<(data: unknown) => void>> = new Map()

  constructor(preferences?: Partial<ExportPreferences>) {
    this.preferences = {
      defaultFormat: ExportFormat.PNG,
      defaultOptions: {
        [ExportFormat.PNG]: {
          scale: 2,
          backgroundColor: 'white',
          quality: 0.9
        } as PNGExportOptions,
        [ExportFormat.PDF]: {
          paperSize: 'a4',
          orientation: 'auto',
          margins: { top: 20, right: 20, bottom: 20, left: 20 }
        } as PDFExportOptions,
        [ExportFormat.JSON]: {
          includeViewportInfo: true,
          includeMetadata: true,
          minify: false
        } as JSONExportOptions
      },
      rememberLastUsed: true,
      autoSavePresets: true,
      qualityThreshold: 0.8,
      ...preferences
    }

    this.initializeDefaultPresets()
  }

  /**
   * 导出画布为指定格式
   * @param canvas 要导出的画布元素
   * @param format 导出格式
   * @param options 导出选项
   * @param callbacks 回调函数
   * @returns 导出结果Promise
   */
  async exportCanvas(
    canvas: HTMLElement,
    format: ExportFormat,
    options?: Partial<ExportOptions>,
    callbacks?: {
      onProgress?: ProgressCallback
      onComplete?: CompletionCallback
      onError?: ErrorCallback
    }
  ): Promise<ExportResult> {
    const exportId = this.generateExportId()
    const mergedOptions = this.mergeWithDefaults(format, options)

    const context: ExportContext = {
      canvas,
      format,
      options: mergedOptions,
      startTime: Date.now(),
      retryCount: 0
    }

    this.activeExports.set(exportId, context)

    try {
      // 发射导出开始事件
      this.emitEvent('export:started', { format, options: mergedOptions })

      // 根据格式选择相应的导出引擎
      const result = await this.executeExport(context, callbacks)

      // 发射导出完成事件
      this.emitEvent('export:completed', { result })

      // 如果启用了记住上次使用的设置，保存选项
      if (this.preferences.rememberLastUsed) {
        this.updateLastUsedOptions(format, mergedOptions)
      }

      return result

    } catch (error) {
      const exportError = this.createExportError(error, context)

      // 发射导出失败事件
      this.emitEvent('export:failed', { error: exportError, context })

      if (callbacks?.onError) {
        callbacks.onError(exportError)
      }

      throw exportError
    } finally {
      this.activeExports.delete(exportId)
    }
  }

  /**
   * 获取支持的导出格式
   */
  getSupportedFormats(): ExportFormat[] {
    return Object.values(ExportFormat)
  }

  /**
   * 获取格式的默认选项
   */
  getDefaultOptions(format: ExportFormat): ExportOptions {
    return { ...this.preferences.defaultOptions[format] }
  }

  /**
   * 更新默认选项
   */
  updateDefaultOptions(format: ExportFormat, options: Partial<ExportOptions>): void {
    this.preferences.defaultOptions[format] = {
      ...this.preferences.defaultOptions[format],
      ...options
    }
  }

  /**
   * 保存导出预设
   */
  savePreset(preset: Omit<ExportPreset, 'id' | 'createdAt' | 'updatedAt'>): string {
    const id = this.generatePresetId()
    const now = new Date().toISOString()

    const fullPreset: ExportPreset = {
      ...preset,
      id,
      createdAt: now,
      updatedAt: now
    }

    this.presets.set(id, fullPreset)

    if (this.preferences.autoSavePresets) {
      this.persistPresets()
    }

    return id
  }

  /**
   * 加载导出预设
   */
  loadPreset(id: string): ExportPreset | null {
    return this.presets.get(id) || null
  }

  /**
   * 获取所有预设
   */
  getAllPresets(): ExportPreset[] {
    return Array.from(this.presets.values())
  }

  /**
   * 删除预设
   */
  deletePreset(id: string): boolean {
    const deleted = this.presets.delete(id)

    if (deleted && this.preferences.autoSavePresets) {
      this.persistPresets()
    }

    return deleted
  }

  /**
   * 添加事件监听器
   */
  addEventListener(event: string, callback: (data: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(event: string, callback: (data: unknown) => void): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * 获取当前活动的导出数量
   */
  getActiveExportCount(): number {
    return this.activeExports.size
  }

  /**
   * 取消指定的导出操作
   */
  cancelExport(exportId: string): boolean {
    const context = this.activeExports.get(exportId)
    if (context) {
      this.activeExports.delete(exportId)
      return true
    }
    return false
  }

  /**
   * 直接导出PNG（跳过选项对话框）
   * 使用预定义的默认设置进行快速导出
   * @param canvas 要导出的画布元素
   * @param callbacks 回调函数
   * @returns 导出结果Promise
   */
  async exportToPNGDirect(
    canvas: HTMLElement,
    callbacks?: {
      onProgress?: ProgressCallback
      onComplete?: CompletionCallback
      onError?: ErrorCallback
    }
  ): Promise<ExportResult> {
    const exportId = this.generateExportId()
    const sourceVersion =
      (canvas.getAttribute('data-render-version') as 'v1' | 'v2' | null) || 'v1'

    // 使用预定义的默认PNG设置
    const defaultPNGOptions: PNGExportOptions = {
      scale: 2,
      backgroundColor: 'white',
      quality: 0.9,
      includeWatermark: false,
      sourceVersion
    }

    const context: ExportContext = {
      canvas,
      format: ExportFormat.PNG,
      options: defaultPNGOptions,
      startTime: Date.now(),
      retryCount: 0
    }

    this.activeExports.set(exportId, context)

    try {
      // 发射导出开始事件
      this.emitEvent('export:started', { format: ExportFormat.PNG, options: defaultPNGOptions })

      // 执行PNG导出
      const result = await this.exportToPNG(context, callbacks)

      // 发射导出完成事件
      this.emitEvent('export:completed', { result })

      // 自动下载文件
      if (result.success && result.data) {
        const blob = result.data as Blob
        const date = new Date()
        const formattedDateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`
        const fileName = `course-design-${formattedDateTime}.png`

        this.downloadBlob(blob, fileName)
      }

      return result

    } catch (error) {
      const exportError = this.createExportError(error, context)

      // 发射导出失败事件
      this.emitEvent('export:failed', { error: exportError, context })

      if (callbacks?.onError) {
        callbacks.onError(exportError)
      }

      throw exportError
    } finally {
      this.activeExports.delete(exportId)
    }
  }

  /**
   * 获取用户偏好设置
   */
  getPreferences(): ExportPreferences {
    return { ...this.preferences }
  }

  /**
   * 更新用户偏好设置
   */
  updatePreferences(preferences: Partial<ExportPreferences>): void {
    this.preferences = { ...this.preferences, ...preferences }
  }

  // 私有方法

  /**
   * 执行实际的导出操作
   */
  private async executeExport(
    context: ExportContext,
    callbacks?: {
      onProgress?: ProgressCallback
      onComplete?: CompletionCallback
      onError?: ErrorCallback
    }
  ): Promise<ExportResult> {
    const { format } = context

    // 更新进度 - 初始化阶段
    this.updateProgress(ExportStage.INITIALIZING, 0, '正在初始化导出...', callbacks?.onProgress)

    switch (format) {
      case ExportFormat.PNG:
        return await this.exportToPNG(context, callbacks)
      case ExportFormat.PDF:
        return await this.exportToPDF(context, callbacks)
      case ExportFormat.JSON:
        return await this.exportToJSON(context, callbacks)
      default:
        throw new Error(`不支持的导出格式: ${format}`)
    }
  }

  /**
   * PNG导出实现
   */
  private async exportToPNG(
    context: ExportContext,
    callbacks?: { onProgress?: ProgressCallback }
  ): Promise<ExportResult> {
    const sourceVersion = this.getSourceVersion(context)
    if (sourceVersion === 'v2') {
      const svgElement = this.getV2SVGElement(context.canvas)
      if (svgElement) {
        return await this.exportV2SVGToPNG(svgElement, context.options as PNGExportOptions, context.startTime)
      }
    }

    const { pngExportEngine } = await import('./pngExportEngine')

    return await pngExportEngine.exportToPNG(
      context.canvas,
      context.options as PNGExportOptions,
      callbacks?.onProgress
    )
  }

  /**
   * PDF导出实现
   */
  private async exportToPDF(
    context: ExportContext,
    callbacks?: { onProgress?: ProgressCallback }
  ): Promise<ExportResult> {
    const sourceVersion = this.getSourceVersion(context)
    if (sourceVersion === 'v2') {
      const svgElement = this.getV2SVGElement(context.canvas)
      if (svgElement) {
        return await this.exportV2SVGToPDF(svgElement, context.options as PDFExportOptions, context.startTime)
      }
    }

    const { pdfExportEngine } = await import('./pdfExportEngine')

    return await pdfExportEngine.exportToPDF(
      context.canvas,
      context.options as PDFExportOptions,
      callbacks?.onProgress
    )
  }

  /**
   * JSON导出实现
   */
  private async exportToJSON(
    context: ExportContext,
    callbacks?: { onProgress?: ProgressCallback }
  ): Promise<ExportResult> {
    const { jsonExportEngine } = await import('./jsonExportEngine')

    return await jsonExportEngine.exportToJSON(
      context.canvas,
      context.options as JSONExportOptions,
      callbacks?.onProgress
    )
  }

  /**
   * 合并用户选项与默认选项
   */
  private mergeWithDefaults(format: ExportFormat, options?: Partial<ExportOptions>): ExportOptions {
    const defaults = this.getDefaultOptions(format)
    return { ...defaults, ...options } as ExportOptions
  }

  private getSourceVersion(context: ExportContext): 'v1' | 'v2' {
    const sourceVersion = (context.options as { sourceVersion?: 'v1' | 'v2' }).sourceVersion
    return sourceVersion ?? 'v1'
  }

  private getV2SVGElement(canvas: HTMLElement): SVGSVGElement | null {
    return canvas.querySelector('.canvas-svg') as SVGSVGElement | null
  }

  private serializeSVG(svgElement: SVGSVGElement): string {
    const serializer = new XMLSerializer()
    const content = serializer.serializeToString(svgElement)
    if (content.includes('xmlns=')) {
      return content
    }
    return content.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }

  private async svgToPNGBlob(
    svgElement: SVGSVGElement,
    scale: number,
    backgroundColor: string,
    quality: number
  ): Promise<{ blob: Blob; width: number; height: number }> {
    const svgText = this.serializeSVG(svgElement)
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('SVG图像加载失败'))
        img.src = svgUrl
      })

      const viewBox = svgElement.viewBox?.baseVal
      const baseWidth = viewBox?.width || svgElement.clientWidth || 800
      const baseHeight = viewBox?.height || svgElement.clientHeight || 600
      const width = Math.max(1, Math.round(baseWidth * scale))
      const height = Math.max(1, Math.round(baseHeight * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('无法创建离屏画布上下文')
      }

      if (backgroundColor !== 'transparent') {
        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, width, height)
      }

      ctx.drawImage(image, 0, 0, width, height)

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (!result) {
            reject(new Error('PNG编码失败'))
            return
          }
          resolve(result)
        }, 'image/png', quality)
      })

      return { blob, width, height }
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  }

  private async exportV2SVGToPNG(
    svgElement: SVGSVGElement,
    options: PNGExportOptions,
    startTime: number
  ): Promise<ExportResult> {
    const scale = options.scale || 2
    const backgroundColor = options.backgroundColor || 'white'
    const quality = options.quality ?? 0.92
    const { blob, width, height } = await this.svgToPNGBlob(svgElement, scale, backgroundColor, quality)

    return this.createV2ExportResult(
      ExportFormat.PNG,
      blob,
      width,
      height,
      startTime,
      'svg-native'
    )
  }

  private async exportV2SVGToPDF(
    svgElement: SVGSVGElement,
    options: PDFExportOptions,
    startTime: number
  ): Promise<ExportResult> {
    const { jsPDF } = await import('jspdf')
    const scale = 2
    const { blob: pngBlob, width, height } = await this.svgToPNGBlob(
      svgElement,
      scale,
      'white',
      options.quality ?? 0.95
    )

    const imageDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('读取PNG数据失败'))
      reader.readAsDataURL(pngBlob)
    })

    const orientation = options.orientation === 'portrait' ? 'p' : 'l'
    const pdf = new jsPDF({
      orientation,
      unit: 'pt',
      format: options.paperSize || 'a4'
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margins = options.margins || { top: 20, right: 20, bottom: 20, left: 20 }
    const maxWidth = pageWidth - margins.left - margins.right
    const maxHeight = pageHeight - margins.top - margins.bottom
    const fitScale = Math.min(maxWidth / width, maxHeight / height)
    const drawWidth = width * fitScale
    const drawHeight = height * fitScale
    const drawX = (pageWidth - drawWidth) / 2
    const drawY = (pageHeight - drawHeight) / 2

    pdf.addImage(imageDataUrl, 'PNG', drawX, drawY, drawWidth, drawHeight, undefined, 'FAST')
    const pdfBlob = pdf.output('blob')

    return this.createV2ExportResult(
      ExportFormat.PDF,
      pdfBlob,
      width,
      height,
      startTime,
      'svg-native'
    )
  }

  private createV2ExportResult(
    format: ExportFormat,
    data: Blob,
    width: number,
    height: number,
    startTime: number,
    renderingMethod: 'svg-native'
  ): ExportResult {
    return {
      success: true,
      format,
      data,
      metadata: {
        fileName: '',
        fileSize: data.size,
        dimensions: { width, height },
        exportTime: Date.now() - startTime,
        renderingMethod,
        qualityScore: 1,
        timestamp: new Date().toISOString(),
        format
      },
      qualityReport: {
        overallScore: 1,
        pathCompleteness: 1,
        renderingAccuracy: 1,
        performanceMetrics: {
          renderingTime: Date.now() - startTime,
          memoryUsage: 0,
          canvasSize: { width, height },
          elementCount: 0,
          svgElementCount: 1
        },
        recommendations: [],
        detailedIssues: []
      },
      warnings: [],
      errors: []
    }
  }

  /**
   * 更新进度状态
   */
  private updateProgress(
    stage: ExportStage,
    progress: number,
    message: string,
    callback?: ProgressCallback
  ): void {
    const state: ProgressState = {
      stage,
      progress,
      message
    }

    // 发射进度事件
    this.emitEvent('export:progress', state)

    // 调用回调函数
    if (callback) {
      callback(state)
    }
  }

  /**
   * 发射事件
   */
  private emitEvent(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`事件监听器执行失败 (${event}):`, error)
        }
      })
    }
  }

  /**
   * 创建导出错误对象
   */
  private createExportError(error: unknown, context: ExportContext): ExportError {
    const errorMessage = error instanceof Error ? error.message : '导出失败'
    const errorType = this.getExportErrorType(error)

    const exportError = Object.assign(new Error(errorMessage), {
      type: errorType,
      stage: ExportStage.INITIALIZING,
      recoverable: true,
      context: {
        format: context.format,
        options: context.options,
        canvasElement: context.canvas,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      },
      suggestedActions: ['请重试导出操作', '检查浏览器兼容性', '联系技术支持']
    }) as ExportError

    return exportError
  }

  /**
   * 从未知错误对象中提取导出错误类型
   */
  private getExportErrorType(error: unknown): ExportErrorType {
    if (error && typeof error === 'object' && 'type' in error) {
      const type = (error as { type?: unknown }).type
      if (typeof type === 'string' && Object.values(ExportErrorType).includes(type as ExportErrorType)) {
        return type as ExportErrorType
      }
    }
    return ExportErrorType.HTML2CANVAS_ERROR
  }

  /**
   * 生成导出ID
   */
  private generateExportId(): string {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 生成预设ID
   */
  private generatePresetId(): string {
    return `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 更新最后使用的选项
   */
  private updateLastUsedOptions(format: ExportFormat, options: ExportOptions): void {
    this.preferences.defaultOptions[format] = options
  }

  /**
   * 初始化默认预设
   */
  private initializeDefaultPresets(): void {
    // 高质量PNG预设
    this.presets.set('high-quality-png', {
      id: 'high-quality-png',
      name: '高质量PNG',
      format: ExportFormat.PNG,
      options: {
        scale: 3,
        backgroundColor: 'transparent',
        quality: 1.0
      } as PNGExportOptions,
      description: '适用于高分辨率打印的PNG导出',
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    // 标准PDF预设
    this.presets.set('standard-pdf', {
      id: 'standard-pdf',
      name: '标准PDF',
      format: ExportFormat.PDF,
      options: {
        paperSize: 'a4',
        orientation: 'landscape',
        margins: { top: 10, right: 10, bottom: 10, left: 10 },
        includeMetadata: true
      } as PDFExportOptions,
      description: '适用于文档分享的标准PDF格式',
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    // 完整数据JSON预设
    this.presets.set('full-data-json', {
      id: 'full-data-json',
      name: '完整数据JSON',
      format: ExportFormat.JSON,
      options: {
        includeViewportInfo: true,
        includeMetadata: true,
        minify: false
      } as JSONExportOptions,
      description: '包含所有课程数据和元信息的JSON导出',
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  }

  /**
   * 持久化预设到本地存储
   */
  private persistPresets(): void {
    try {
      const presetsData = Array.from(this.presets.entries())
      localStorage.setItem('export-presets', JSON.stringify(presetsData))
    } catch (error) {
      console.warn('无法保存导出预设到本地存储:', error)
    }
  }

  /**
   * 从本地存储加载预设
   */
  private loadPersistedPresets(): void {
    try {
      const presetsData = localStorage.getItem('export-presets')
      if (presetsData) {
        const entries = JSON.parse(presetsData)
        this.presets = new Map(entries)
      }
    } catch (error) {
      console.warn('无法从本地存储加载导出预设:', error)
    }
  }

  /**
   * 下载Blob数据
   */
  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}

// 创建全局导出管理器实例
export const exportManager = new ExportManager()

// 导出类型和实例
export default ExportManager
