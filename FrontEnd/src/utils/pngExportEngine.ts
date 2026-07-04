/**
 * PNG导出引擎
 * 实现高分辨率PNG导出，支持缩放选项、背景颜色和透明度处理
 */

import html2canvas from 'html2canvas'
import {
  ExportFormat,
  ExportStage,
  ExportErrorType
} from '@/types/export'
import type {
  ExportResult,
  ExportMetadata,
  PNGExportOptions,
  ProgressCallback,
  ExportError,
  QualityReport,
  ExportWarning,
} from '@/types/export'

/**
 * PNG导出引擎类
 * 负责将画布元素转换为高质量PNG图像
 */
export class PNGExportEngine {
  private defaultOptions: Required<PNGExportOptions> = {
    scale: 2,
    backgroundColor: 'white',
    quality: 0.9,
    includeWatermark: false,
    fileName: 'course-design.png',
    includeBackground: true,
    timeout: 30000,
    sourceVersion: 'v2'
  }

  /**
   * 导出画布为PNG格式
   */
  async exportToPNG(
    canvas: HTMLElement,
    options: Partial<PNGExportOptions> = {},
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    const startTime = performance.now()
    const mergedOptions = { ...this.defaultOptions, ...options }
    const warnings: ExportWarning[] = []
    const errors: ExportError[] = []

    try {
      this.updateProgress(onProgress, ExportStage.INITIALIZING, 10, '正在初始化PNG导出...')

      this.validateCanvas(canvas)
      this.updateProgress(onProgress, ExportStage.PREPARING_CANVAS, 25, '正在准备画布...')

      this.collectPerformanceWarnings(canvas, mergedOptions, warnings)

      this.updateProgress(onProgress, ExportStage.RENDERING, 50, '正在渲染PNG...')
      const renderedCanvas = await html2canvas(canvas, {
        scale: mergedOptions.scale,
        backgroundColor: mergedOptions.backgroundColor === 'transparent' ? null : mergedOptions.backgroundColor
      })

      const blob = await this.generatePNGBlob(renderedCanvas, mergedOptions)
      this.updateProgress(onProgress, ExportStage.FINALIZING, 100, 'PNG导出完成')

      const metadata = this.createExportMetadata(
        blob,
        renderedCanvas,
        mergedOptions,
        performance.now() - startTime
      )

      const qualityReport = this.createBasicQualityReport(renderedCanvas, canvas)

      return {
        success: true,
        format: ExportFormat.PNG,
        data: blob,
        metadata,
        qualityReport,
        warnings,
        errors
      }

    } catch (error) {
      const exportError = this.createExportError(error, ExportStage.RENDERING, canvas, mergedOptions)
      errors.push(exportError)

      return {
        success: false,
        format: ExportFormat.PNG,
        data: new Blob(),
        metadata: this.createErrorMetadata(mergedOptions, performance.now() - startTime),
        qualityReport: this.createErrorQualityReport(),
        warnings,
        errors
      }
    }
  }

  private updateProgress(
    onProgress: ProgressCallback | undefined,
    stage: ExportStage,
    progress: number,
    message: string
  ): void {
    onProgress?.({ stage, progress, message })
  }

  private validateCanvas(canvas: HTMLElement): void {
    if (!canvas) {
      throw new Error('画布元素不能为空')
    }
  }

  private collectPerformanceWarnings(
    canvas: HTMLElement,
    options: Required<PNGExportOptions>,
    warnings: ExportWarning[]
  ): void {
    const width = canvas.offsetWidth || Number.parseInt(canvas.style.width || '0', 10)
    const height = canvas.offsetHeight || Number.parseInt(canvas.style.height || '0', 10)
    const pixelCount = width * height * options.scale * options.scale

    if (pixelCount >= 20_000_000) {
      warnings.push({
        type: 'performance',
        message: '导出尺寸较大，可能导致性能下降。',
        severity: 'medium',
        suggestedAction: '降低缩放倍率或缩小画布尺寸后重试。'
      })
    }
  }

  private async generatePNGBlob(
    canvas: HTMLCanvasElement,
    options: Required<PNGExportOptions>
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('无法生成PNG Blob'))
          }
        },
        'image/png',
        options.quality
      )
    })
  }

  private createExportError(
    error: unknown,
    stage: ExportStage,
    canvas: HTMLElement,
    options: Required<PNGExportOptions>
  ): ExportError {
    const message = error instanceof Error ? error.message : 'PNG导出失败'
    const exportError = new Error(message) as ExportError
    exportError.type = ExportErrorType.HTML2CANVAS_ERROR
    exportError.stage = stage
    exportError.recoverable = true
    exportError.context = {
      format: ExportFormat.PNG,
      options,
      canvasElement: canvas,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    }
    exportError.suggestedActions = ['重试导出操作']

    return exportError
  }

  private createExportMetadata(
    blob: Blob,
    canvas: HTMLCanvasElement,
    options: Required<PNGExportOptions>,
    exportTime: number
  ): ExportMetadata {
    return {
      fileName: options.fileName,
      fileSize: blob.size,
      dimensions: {
        width: canvas.width,
        height: canvas.height
      },
      exportTime,
      renderingMethod: 'html2canvas',
      qualityScore: options.quality,
      timestamp: new Date().toISOString(),
      format: ExportFormat.PNG
    }
  }

  private createErrorMetadata(
    options: Required<PNGExportOptions>,
    exportTime: number
  ): ExportMetadata {
    return {
      fileName: options.fileName,
      fileSize: 0,
      dimensions: { width: 0, height: 0 },
      exportTime,
      renderingMethod: 'html2canvas',
      qualityScore: 0,
      timestamp: new Date().toISOString(),
      format: ExportFormat.PNG
    }
  }

  private createBasicQualityReport(renderedCanvas: HTMLCanvasElement, originalCanvas: HTMLElement): QualityReport {
    return {
      overallScore: 0.8,
      pathCompleteness: 85,
      renderingAccuracy: 0.8,
      performanceMetrics: {
        renderingTime: 0,
        memoryUsage: 0,
        canvasSize: {
          width: renderedCanvas.width,
          height: renderedCanvas.height
        },
        elementCount: originalCanvas.querySelectorAll('*').length,
        svgElementCount: originalCanvas.querySelectorAll('svg, svg *').length
      },
      recommendations: ['PNG导出完成'],
      detailedIssues: []
    }
  }

  private createErrorQualityReport(): QualityReport {
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
      recommendations: ['导出失败，请检查错误信息并重试'],
      detailedIssues: []
    }
  }
}

export const pngExportEngine = new PNGExportEngine()
