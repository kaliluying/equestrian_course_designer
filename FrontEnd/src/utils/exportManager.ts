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
  private eventListeners: Map<string, Function[]> = new Map()

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
  addEventListener(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(event: string, callback: Function): void {
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

    // 使用预定义的默认PNG设置
    const defaultPNGOptions: PNGExportOptions = {
      scale: 2,
      backgroundColor: 'white',
      quality: 0.9,
      includeWatermark: false
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
  private emitEvent(event: string, data: any): void {
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
    const errorType = (error as unknown)?.type || ExportErrorType.HTML2CANVAS_ERROR

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
