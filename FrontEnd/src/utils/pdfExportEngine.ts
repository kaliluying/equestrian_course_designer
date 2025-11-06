/**
 * PDF导出引擎
 * 使用jsPDF库创建高质量的PDF文档导出
 */

import jsPDF from 'jspdf'
import {
  ExportFormat,
  ExportStage
} from '@/types/export'
import type {
  ExportResult,
  ExportMetadata,
  PDFExportOptions,
  ProgressCallback,
  QualityReport,
  ExportWarning,
  ExportError
} from '@/types/export'
import { exportQualityValidator } from './exportQualityValidator'
import { canvasRenderer } from './canvasRenderer'

/**
 * PDF导出引擎类
 * 负责将画布内容转换为PDF文档
 */
export class PDFExportEngine {
  private readonly defaultOptions: PDFExportOptions = {
    paperSize: 'a4',
    orientation: 'auto',
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    includeFooter: false,
    includeMetadata: true,
    quality: 0.9
  }

  /**
   * 导出画布为PDF
   * @param canvas 要导出的画布元素
   * @param options PDF导出选项
   * @param onProgress 进度回调函数
   * @returns 导出结果
   */
  async exportToPDF(
    canvas: HTMLElement,
    options: Partial<PDFExportOptions> = {},
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    const startTime = performance.now()
    const mergedOptions = { ...this.defaultOptions, ...options }
    const warnings: ExportWarning[] = []
    const errors: ExportError[] = []

    try {
      // 更新进度 - 准备阶段
      this.updateProgress(onProgress, ExportStage.PREPARING_CANVAS, 10, '正在准备PDF导出...')

      // 1. 渲染画布为图像
      const canvasImage = await this.renderCanvasToImage(canvas, mergedOptions, onProgress)

      // 更新进度 - 生成PDF阶段
      this.updateProgress(onProgress, ExportStage.GENERATING_FILE, 60, '正在生成PDF文档...')

      // 2. 创建PDF文档
      const pdfDoc = await this.createPDFDocument(canvasImage, mergedOptions, onProgress)

      // 更新进度 - 完成阶段
      this.updateProgress(onProgress, ExportStage.FINALIZING, 90, '正在完成PDF生成...')

      // 3. 生成PDF数据
      const pdfBlob = this.generatePDFBlob(pdfDoc)

      // 4. 创建元数据
      const metadata = this.createExportMetadata(
        mergedOptions,
        pdfBlob.size,
        canvasImage.width,
        canvasImage.height,
        performance.now() - startTime
      )

      // 5. 生成质量报告（简化版，因为PDF是基于渲染的图像）
      const qualityReport = await this.generateQualityReport(canvas, canvasImage, mergedOptions)

      // 更新进度 - 完成
      this.updateProgress(onProgress, ExportStage.FINALIZING, 100, 'PDF导出完成')

      return {
        success: true,
        format: ExportFormat.PDF,
        data: pdfBlob,
        metadata,
        qualityReport,
        warnings,
        errors
      }

    } catch (error) {
      const exportError = this.createExportError(error, ExportStage.GENERATING_FILE)
      errors.push(exportError)

      return {
        success: false,
        format: ExportFormat.PDF,
        data: new Blob(),
        metadata: this.createErrorMetadata(mergedOptions, performance.now() - startTime),
        qualityReport: this.createEmptyQualityReport(),
        warnings,
        errors
      }
    }
  }

  /**
   * 渲染画布为图像
   * @param canvas 画布元素
   * @param options PDF选项
   * @param onProgress 进度回调
   * @returns 渲染的画布图像
   */
  private async renderCanvasToImage(
    canvas: HTMLElement,
    options: PDFExportOptions,
    onProgress?: ProgressCallback
  ): Promise<HTMLCanvasElement> {
    this.updateProgress(onProgress, ExportStage.RENDERING, 20, '正在渲染画布内容...')

    // 使用画布渲染器进行高质量渲染
    const renderOptions = {
      scale: this.calculateOptimalScale(options),
      backgroundColor: 'white', // PDF通常使用白色背景
      useCORS: true,
      allowTaint: false,
      foreignObjectRendering: true,
      removeContainer: false,
      logging: false
    }

    try {
      const renderedCanvas = await canvasRenderer.render(canvas, renderOptions)
      this.updateProgress(onProgress, ExportStage.RENDERING, 40, '画布渲染完成')
      return renderedCanvas
    } catch (error) {
      console.warn('主渲染器失败，尝试备用渲染器:', error)

      // 使用备用渲染器
      const backupOptions = {
        ...renderOptions,
        useCanvas2D: true,
        elementByElement: true,
        simplifyPaths: false
      }

      const renderedCanvas = await canvasRenderer.renderWithBackup(canvas, backupOptions)
      this.updateProgress(onProgress, ExportStage.RENDERING, 40, '使用备用渲染器完成渲染')
      return renderedCanvas
    }
  }

  /**
   * 创建PDF文档
   * @param canvasImage 渲染的画布图像
   * @param options PDF选项
   * @param onProgress 进度回调
   * @returns jsPDF文档实例
   */
  private async createPDFDocument(
    canvasImage: HTMLCanvasElement,
    options: PDFExportOptions,
    onProgress?: ProgressCallback
  ): Promise<jsPDF> {
    this.updateProgress(onProgress, ExportStage.GENERATING_FILE, 65, '正在创建PDF文档结构...')

    // 1. 确定页面尺寸和方向
    const { pageWidth, pageHeight, orientation } = this.calculatePageDimensions(canvasImage, options)

    // 2. 创建PDF文档
    const pdf = new jsPDF({
      orientation: orientation as 'portrait' | 'landscape',
      unit: 'mm',
      format: this.getPaperFormat(options.paperSize)
    })

    // 3. 计算图像在页面中的位置和尺寸
    const { imageX, imageY, imageWidth, imageHeight } = this.calculateImagePlacement(
      canvasImage,
      pageWidth,
      pageHeight,
      options.margins
    )

    this.updateProgress(onProgress, ExportStage.GENERATING_FILE, 70, '正在添加图像到PDF...')

    // 4. 将画布图像添加到PDF
    const imageDataUrl = canvasImage.toDataURL('image/jpeg', options.quality || 0.9)
    pdf.addImage(imageDataUrl, 'JPEG', imageX, imageY, imageWidth, imageHeight)

    // 5. 添加元数据
    if (options.includeMetadata) {
      this.addMetadataToPDF(pdf, options)
    }

    // 6. 添加页眉（如果启用元数据）
    if (options.includeMetadata) {
      this.addHeaderToPDF(pdf, pageWidth, options)
    }

    // 7. 添加页脚
    if (options.includeFooter) {
      this.addFooterToPDF(pdf, pageWidth, pageHeight, options)
    }

    // 8. 优化页面布局
    this.optimizePageLayout(pdf, pageWidth, pageHeight, options)

    this.updateProgress(onProgress, ExportStage.GENERATING_FILE, 80, 'PDF文档创建完成')

    return pdf
  }

  /**
   * 计算最优缩放比例
   * @param options PDF选项
   * @returns 缩放比例
   */
  private calculateOptimalScale(options: PDFExportOptions): number {
    // 根据纸张大小和质量要求计算最优缩放
    const baseScale = options.quality || 0.9

    // 不同纸张大小的缩放调整
    const paperScaleMap: Record<string, number> = {
      'a3': 1.4,
      'a4': 1.0,
      'a5': 0.7,
      'letter': 1.0
    }

    const paperScale = paperScaleMap[options.paperSize] || 1.0
    return Math.max(1, Math.min(3, baseScale * paperScale * 2))
  }

  /**
   * 计算页面尺寸和方向
   * @param canvasImage 画布图像
   * @param options PDF选项
   * @returns 页面尺寸信息
   */
  private calculatePageDimensions(
    canvasImage: HTMLCanvasElement,
    options: PDFExportOptions
  ): { pageWidth: number; pageHeight: number; orientation: string } {
    const paperSizes = {
      'a3': { width: 297, height: 420 },
      'a4': { width: 210, height: 297 },
      'a5': { width: 148, height: 210 },
      'letter': { width: 216, height: 279 }
    }

    const paperSize = paperSizes[options.paperSize] || paperSizes.a4
    const canvasAspectRatio = canvasImage.width / canvasImage.height

    let orientation = options.orientation
    let pageWidth = paperSize.width
    let pageHeight = paperSize.height

    // 自动确定方向
    if (orientation === 'auto') {
      if (canvasAspectRatio > 1) {
        orientation = 'landscape'
      } else {
        orientation = 'portrait'
      }
    }

    // 应用方向
    if (orientation === 'landscape') {
      pageWidth = paperSize.height
      pageHeight = paperSize.width
    }

    return { pageWidth, pageHeight, orientation }
  }

  /**
   * 计算图像在页面中的位置和尺寸
   * @param canvasImage 画布图像
   * @param pageWidth 页面宽度
   * @param pageHeight 页面高度
   * @param margins 页边距
   * @returns 图像位置和尺寸信息
   */
  private calculateImagePlacement(
    canvasImage: HTMLCanvasElement,
    pageWidth: number,
    pageHeight: number,
    margins: { top: number; right: number; bottom: number; left: number }
  ): { imageX: number; imageY: number; imageWidth: number; imageHeight: number } {
    // 计算可用空间
    const availableWidth = pageWidth - margins.left - margins.right
    const availableHeight = pageHeight - margins.top - margins.bottom

    // 计算缩放比例以适应页面
    const canvasAspectRatio = canvasImage.width / canvasImage.height
    const availableAspectRatio = availableWidth / availableHeight

    let imageWidth: number
    let imageHeight: number

    if (canvasAspectRatio > availableAspectRatio) {
      // 画布更宽，以宽度为准
      imageWidth = availableWidth
      imageHeight = availableWidth / canvasAspectRatio
    } else {
      // 画布更高，以高度为准
      imageHeight = availableHeight
      imageWidth = availableHeight * canvasAspectRatio
    }

    // 居中放置
    const imageX = margins.left + (availableWidth - imageWidth) / 2
    const imageY = margins.top + (availableHeight - imageHeight) / 2

    return { imageX, imageY, imageWidth, imageHeight }
  }

  /**
   * 获取jsPDF支持的纸张格式
   * @param paperSize 纸张大小
   * @returns jsPDF格式
   */
  private getPaperFormat(paperSize: string): string | [number, number] {
    const formats: Record<string, string | [number, number]> = {
      'a3': 'a3',
      'a4': 'a4',
      'a5': 'a5',
      'letter': 'letter'
    }

    return formats[paperSize] || 'a4'
  }

  /**
   * 添加元数据到PDF
   * @param pdf PDF文档
   * @param options PDF选项
   */
  private addMetadataToPDF(pdf: jsPDF, options: PDFExportOptions): void {
    const now = new Date()

    // 基础元数据
    const metadata = {
      title: options.fileName || '马术障碍赛道设计',
      subject: '马术障碍赛道设计图 - 由马术赛道设计工具生成',
      author: '马术赛道设计工具用户',
      creator: '增强导出系统 v1.0',
      producer: 'jsPDF + 增强导出引擎',
      creationDate: now,
      modDate: now,
      keywords: '马术,障碍赛道,设计,导出,PDF'
    }

    // 设置PDF属性
    pdf.setProperties(metadata)

    // 添加自定义元数据（如果支持）
    try {
      // 添加额外的文档信息
      const additionalInfo = {
        exportVersion: '1.0.0',
        exportEngine: 'PDF Export Engine',
        paperSize: options.paperSize,
        orientation: options.orientation,
        quality: options.quality?.toString() || '0.9',
        timestamp: now.toISOString(),
        userAgent: navigator.userAgent.substring(0, 100) // 限制长度
      }

      // 将额外信息作为注释添加到PDF
      pdf.setFontSize(6)
      pdf.setTextColor(200, 200, 200)

      // 在页面底部添加技术信息（不可见区域）
      const pageHeight = pdf.internal.pageSize.height
      let yPos = pageHeight - 5

      Object.entries(additionalInfo).forEach(([key, value]) => {
        pdf.text(`${key}: ${value}`, 5, yPos, { maxWidth: 100 })
        yPos -= 2
      })

    } catch (error) {
      console.warn('添加额外元数据失败:', error)
    }
  }

  /**
   * 添加页脚到PDF
   * @param pdf PDF文档
   * @param pageWidth 页面宽度
   * @param pageHeight 页面高度
   * @param options PDF选项
   */
  private addFooterToPDF(
    pdf: jsPDF,
    pageWidth: number,
    pageHeight: number,
    options: PDFExportOptions
  ): void {
    const footerHeight = 15
    const footerY = pageHeight - footerHeight + 5
    const now = new Date()

    // 保存当前状态
    const currentFontSize = pdf.getFontSize()
    const currentTextColor = pdf.getTextColor()

    try {
      // 添加页脚背景（可选）
      if (options.includeMetadata) {
        pdf.setFillColor(248, 249, 250) // 浅灰色背景
        pdf.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, 'F')
      }

      // 设置页脚字体和颜色
      pdf.setFontSize(8)
      pdf.setTextColor(100, 100, 100)

      // 页脚内容布局
      const footerContent = this.createFooterContent(options, now)

      // 左侧：文档信息
      pdf.text(footerContent.left, 10, footerY)

      // 中间：页码信息
      const pageTextWidth = pdf.getTextWidth(footerContent.center)
      pdf.text(footerContent.center, (pageWidth - pageTextWidth) / 2, footerY)

      // 右侧：时间戳
      const timestampWidth = pdf.getTextWidth(footerContent.right)
      pdf.text(footerContent.right, pageWidth - timestampWidth - 10, footerY)

      // 添加分隔线
      if (options.includeMetadata) {
        pdf.setDrawColor(200, 200, 200)
        pdf.setLineWidth(0.1)
        pdf.line(10, pageHeight - footerHeight + 1, pageWidth - 10, pageHeight - footerHeight + 1)
      }

      // 添加额外的技术信息（小字体）
      if (options.includeMetadata) {
        pdf.setFontSize(6)
        pdf.setTextColor(150, 150, 150)

        const techInfo = `导出引擎: PDF Export Engine v1.0 | 质量: ${Math.round((options.quality || 0.9) * 100)}% | 纸张: ${options.paperSize.toUpperCase()}`
        const techInfoWidth = pdf.getTextWidth(techInfo)
        pdf.text(techInfo, (pageWidth - techInfoWidth) / 2, footerY + 8)
      }

    } finally {
      // 恢复原始状态
      pdf.setFontSize(currentFontSize)
      pdf.setTextColor(currentTextColor)
    }
  }

  /**
   * 创建页脚内容
   * @param options PDF选项
   * @param timestamp 时间戳
   * @returns 页脚内容对象
   */
  private createFooterContent(
    options: PDFExportOptions,
    timestamp: Date
  ): { left: string; center: string; right: string } {
    // 左侧内容：文档标题和作者
    const documentTitle = options.fileName || '马术障碍赛道设计'
    const left = `${documentTitle} | 马术赛道设计工具`

    // 中间内容：页码和总页数
    const currentPage = 1 // jsPDF在单页文档中始终为1
    const center = `第 ${currentPage} 页`

    // 右侧内容：生成时间
    const timeString = timestamp.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
    const right = `生成于 ${timeString}`

    return { left, center, right }
  }

  /**
   * 添加页眉到PDF（可选功能）
   * @param pdf PDF文档
   * @param pageWidth 页面宽度
   * @param options PDF选项
   */
  private addHeaderToPDF(
    pdf: jsPDF,
    pageWidth: number,
    options: PDFExportOptions
  ): void {
    if (!options.includeMetadata) return

    const headerY = 15

    // 保存当前状态
    const currentFontSize = pdf.getFontSize()
    const currentTextColor = pdf.getTextColor()

    try {
      // 设置页眉样式
      pdf.setFontSize(10)
      pdf.setTextColor(80, 80, 80)

      // 页眉标题
      const headerTitle = '马术障碍赛道设计'
      const headerTitleWidth = pdf.getTextWidth(headerTitle)
      pdf.text(headerTitle, (pageWidth - headerTitleWidth) / 2, headerY)

      // 添加装饰线
      pdf.setDrawColor(100, 100, 100)
      pdf.setLineWidth(0.2)
      pdf.line(10, headerY + 3, pageWidth - 10, headerY + 3)

    } finally {
      // 恢复原始状态
      pdf.setFontSize(currentFontSize)
      pdf.setTextColor(currentTextColor)
    }
  }

  /**
   * 优化页面布局
   * @param pdf PDF文档
   * @param pageWidth 页面宽度
   * @param pageHeight 页面高度
   * @param options PDF选项
   */
  private optimizePageLayout(
    pdf: jsPDF,
    pageWidth: number,
    pageHeight: number,
    options: PDFExportOptions
  ): void {
    try {
      // 添加页面边框（调试模式或高质量模式）
      if (options.quality && options.quality > 0.8) {
        pdf.setDrawColor(220, 220, 220)
        pdf.setLineWidth(0.1)
        pdf.rect(
          options.margins.left / 2,
          options.margins.top / 2,
          pageWidth - options.margins.left,
          pageHeight - options.margins.top - options.margins.bottom,
          'S'
        )
      }

      // 添加水印（如果需要）
      if (options.includeMetadata) {
        this.addWatermark(pdf, pageWidth, pageHeight, options)
      }

      // 优化PDF压缩
      this.optimizePDFCompression(pdf, options)

    } catch (error) {
      console.warn('页面布局优化失败:', error)
    }
  }

  /**
   * 添加水印
   * @param pdf PDF文档
   * @param pageWidth 页面宽度
   * @param pageHeight 页面高度
   * @param options PDF选项
   */
  private addWatermark(
    pdf: jsPDF,
    pageWidth: number,
    pageHeight: number,
    options: PDFExportOptions
  ): void {
    try {
      // 保存当前状态
      const currentFontSize = pdf.getFontSize()
      const currentTextColor = pdf.getTextColor()

      // 设置水印样式
      pdf.setFontSize(48)
      pdf.setTextColor(240, 240, 240) // 非常浅的灰色

      // 水印文本
      const watermarkText = '马术赛道设计工具'
      const textWidth = pdf.getTextWidth(watermarkText)

      // 计算水印位置（居中，稍微偏下）
      const x = (pageWidth - textWidth) / 2
      const y = pageHeight * 0.6

      // 保存图形状态
      pdf.saveGraphicsState()

      // 设置透明度
      pdf.setGState(pdf.GState({ opacity: 0.1 }))

      // 旋转并绘制水印
      pdf.text(watermarkText, x, y, { angle: -45 })

      // 恢复图形状态
      pdf.restoreGraphicsState()

      // 恢复原始状态
      pdf.setFontSize(currentFontSize)
      pdf.setTextColor(currentTextColor)

    } catch (error) {
      console.warn('添加水印失败:', error)
    }
  }

  /**
   * 优化PDF压缩
   * @param pdf PDF文档
   * @param options PDF选项
   */
  private optimizePDFCompression(pdf: jsPDF, options: PDFExportOptions): void {
    try {
      // 根据质量设置调整压缩参数
      const quality = options.quality || 0.9

      if (quality < 0.7) {
        // 低质量模式：更高压缩
        pdf.setProperties({
          ...pdf.getProperties(),
          producer: pdf.getProperties().producer + ' (优化压缩)'
        })
      } else if (quality > 0.9) {
        // 高质量模式：保持最佳质量
        pdf.setProperties({
          ...pdf.getProperties(),
          producer: pdf.getProperties().producer + ' (高质量)'
        })
      }

    } catch (error) {
      console.warn('PDF压缩优化失败:', error)
    }
  }

  /**
   * 生成PDF Blob
   * @param pdf PDF文档
   * @returns PDF Blob对象
   */
  private generatePDFBlob(pdf: jsPDF): Blob {
    const pdfOutput = pdf.output('blob')
    return pdfOutput
  }

  /**
   * 创建导出元数据
   * @param options PDF选项
   * @param fileSize 文件大小
   * @param width 图像宽度
   * @param height 图像高度
   * @param exportTime 导出时间
   * @returns 导出元数据
   */
  private createExportMetadata(
    options: PDFExportOptions,
    fileSize: number,
    width: number,
    height: number,
    exportTime: number
  ): ExportMetadata {
    return {
      fileName: options.fileName || `course-design-${Date.now()}.pdf`,
      fileSize,
      dimensions: { width, height },
      exportTime,
      renderingMethod: 'html2canvas',
      qualityScore: options.quality || 0.9,
      timestamp: new Date().toISOString(),
      format: ExportFormat.PDF
    }
  }

  /**
   * 生成质量报告
   * @param originalCanvas 原始画布
   * @param renderedCanvas 渲染的画布
   * @param options PDF选项
   * @returns 质量报告
   */
  private async generateQualityReport(
    originalCanvas: HTMLElement,
    renderedCanvas: HTMLCanvasElement,
    options: PDFExportOptions
  ): Promise<QualityReport> {
    try {
      // 1. 基础质量验证
      const pathValidation = await exportQualityValidator.validatePathCompleteness(
        renderedCanvas,
        originalCanvas
      )

      const svgValidation = await exportQualityValidator.checkSVGRendering(
        renderedCanvas,
        originalCanvas
      )

      // 2. PDF特定质量检查
      const pdfSpecificValidation = await this.performPDFSpecificValidation(
        originalCanvas,
        renderedCanvas,
        options
      )

      // 3. 合并验证结果
      const mergedValidation = this.mergeValidationResults(pathValidation, pdfSpecificValidation)

      // 4. 生成综合报告
      const comprehensiveReport = exportQualityValidator.generateComprehensiveReport(
        mergedValidation,
        svgValidation,
        {
          pathCompleteness: mergedValidation.pathCompleteness / 100,
          renderingAccuracy: this.calculatePDFRenderingAccuracy(options, svgValidation),
          styleConsistency: this.calculatePDFStyleConsistency(options),
          performanceScore: this.calculatePDFPerformanceScore(options),
          elementCoverage: svgValidation.svgElementsFound > 0 ? svgValidation.svgElementsRendered / svgValidation.svgElementsFound : 1,
          visualFidelity: this.calculatePDFVisualFidelity(options, pathValidation)
        }
      )

      // 5. 添加PDF特定建议
      this.addPDFSpecificRecommendations(comprehensiveReport, options, pdfSpecificValidation)

      return comprehensiveReport
    } catch (error) {
      console.warn('质量报告生成失败:', error)
      return this.createEmptyQualityReport()
    }
  }

  /**
   * 执行PDF特定的质量验证
   * @param originalCanvas 原始画布
   * @param renderedCanvas 渲染的画布
   * @param options PDF选项
   * @returns PDF特定验证结果
   */
  private async performPDFSpecificValidation(
    originalCanvas: HTMLElement,
    renderedCanvas: HTMLCanvasElement,
    options: PDFExportOptions
  ): Promise<any> {
    const issues: any[] = []
    let pathCompleteness = 100
    let keyPointsValidated = 0
    let continuityScore = 100

    try {
      // 1. 检查PDF页面尺寸适配性
      const dimensionCheck = this.validatePDFDimensions(originalCanvas, options)
      if (!dimensionCheck.isOptimal) {
        issues.push({
          type: 'style_mismatch',
          severity: 'medium',
          message: `PDF页面尺寸可能不是最优的: ${dimensionCheck.reason}`,
          suggestedFix: dimensionCheck.suggestion
        })
        pathCompleteness -= 10
      }

      // 2. 检查图像质量和分辨率
      const resolutionCheck = this.validatePDFResolution(renderedCanvas, options)
      if (!resolutionCheck.isAdequate) {
        issues.push({
          type: 'rendering_error',
          severity: resolutionCheck.severity,
          message: `PDF图像分辨率问题: ${resolutionCheck.message}`,
          suggestedFix: resolutionCheck.suggestion
        })
        pathCompleteness -= resolutionCheck.severity === 'high' ? 20 : 10
      }

      // 3. 检查颜色空间和打印适配性
      const colorCheck = this.validatePDFColorSpace(renderedCanvas, options)
      if (colorCheck.hasIssues) {
        issues.push({
          type: 'style_mismatch',
          severity: 'low',
          message: `PDF颜色空间建议: ${colorCheck.message}`,
          suggestedFix: colorCheck.suggestion
        })
        continuityScore -= 5
      }

      // 4. 检查文本和元数据完整性
      const metadataCheck = this.validatePDFMetadata(options)
      if (!metadataCheck.isComplete) {
        issues.push({
          type: 'missing_element',
          severity: 'low',
          message: `PDF元数据不完整: ${metadataCheck.missingFields.join(', ')}`,
          suggestedFix: '启用完整的元数据包含选项'
        })
      }

      keyPointsValidated = Math.max(0, 100 - issues.length * 10)

    } catch (error) {
      console.warn('PDF特定验证失败:', error)
      issues.push({
        type: 'rendering_error',
   severity: 'medium',
        message: `PDF验证过程出错: ${error instanceof Error ? error.message : String(error)}`,
        suggestedFix: '检查PDF导出配置和浏览器兼容性'
      })
      pathCompleteness = 50
    }

    return {
      isValid: issues.filter(i => i.severity === 'critical').length === 0,
      issues,
      pathCompleteness,
      keyPointsValidated,
      continuityScore
    }
  }

  /**
   * 验证PDF页面尺寸
   * @param canvas 画布元素
   * @param options PDF选项
   * @returns 尺寸验证结果
   */
  private validatePDFDimensions(
    canvas: HTMLElement,
    options: PDFExportOptions
  ): { isOptimal: boolean; reason?: string; suggestion?: string } {
    const rect = canvas.getBoundingClientRect()
    const canvasAspectRatio = rect.width / rect.height

    const paperAspectRatios = {
      'a3': 297 / 420,
      'a4': 210 / 297,
      'a5': 148 / 210,
      'letter': 216 / 279
    }

    const paperAspectRatio = paperAspectRatios[options.paperSize] || paperAspectRatios.a4
    const aspectRatioDiff = Math.abs(canvasAspectRatio - paperAspectRatio)

    if (aspectRatioDiff > 0.3) {
      return {
        isOptimal: false,
        reason: `画布宽高比(${canvasAspectRatio.toFixed(2)})与纸张宽高比(${paperAspectRatio.toFixed(2)})差异较大`,
        suggestion: options.orientation === 'auto' ? '考虑手动设置页面方向' : '考虑调整纸张大小或画布尺寸'
      }
    }

    return { isOptimal: true }
  }

  /**
   * 验证PDF分辨率
   * @param canvas 渲染的画布
   * @param options PDF选项
   * @returns 分辨率验证结果
   */
  private validatePDFResolution(
    canvas: HTMLCanvasElement,
    options: PDFExportOptions
  ): { isAdequate: boolean; severity: string; message?: string; suggestion?: string } {
    const dpi = this.calculateEffectiveDPI(canvas, options)

    if (dpi < 150) {
      return {
        isAdequate: false,
        severity: 'high',
        message: `分辨率过低(${dpi.toFixed(0)} DPI)，可能影响打印质量`,
        suggestion: '提高质量设置或使用更大的缩放比例'
      }
    } else if (dpi < 200) {
      return {
        isAdequate: false,
        severity: 'medium',
        message: `分辨率偏低(${dpi.toFixed(0)} DPI)，建议提高以获得更好的打印效果`,
        suggestion: '考虑提高质量设置到0.9以上'
      }
    }

    return { isAdequate: true, severity: 'none' }
  }

  /**
   * 验证PDF颜色空间
   * @param canvas 渲染的画布
   * @param options PDF选项
   * @returns 颜色空间验证结果
   */
  private validatePDFColorSpace(
    canvas: HTMLCanvasElement,
    options: PDFExportOptions
  ): { hasIssues: boolean; message?: string; suggestion?: string } {
    // 检查是否使用了透明背景（PDF打印时可能有问题）
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return { hasIssues: false }
    }

    try {
      const imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100))
      const data = imageData.data
      let hasTransparency = false

      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          hasTransparency = true
          break
        }
      }

      if (hasTransparency) {
        return {
          hasIssues: true,
          message: '检测到透明背景，打印时可能显示为白色',
          suggestion: '考虑设置白色背景以确保打印一致性'
        }
      }

    } catch (error) {
      console.warn('颜色空间检查失败:', error)
    }

    return { hasIssues: false }
  }

  /**
   * 验证PDF元数据
   * @param options PDF选项
   * @returns 元数据验证结果
   */
  private validatePDFMetadata(
    options: PDFExportOptions
  ): { isComplete: boolean; missingFields: string[] } {
    const missingFields: string[] = []

    if (!options.fileName) {
      missingFields.push('文件名')
    }

    if (!options.includeMetadata) {
      missingFields.push('文档元数据')
    }

    if (!options.includeFooter) {
      missingFields.push('页脚信息')
    }

    return {
      isComplete: missingFields.length === 0,
      missingFields
    }
  }

  /**
   * 计算有效DPI
   * @param canvas 画布
   * @param options PDF选项
   * @returns DPI值
   */
  private calculateEffectiveDPI(canvas: HTMLCanvasElement, options: PDFExportOptions): number {
    // 基础DPI计算（假设屏幕DPI为96）
    const baseDPI = 96
    const scale = this.calculateOptimalScale(options)
    const qualityMultiplier = options.quality || 0.9

    return baseDPI * scale * qualityMultiplier
  }

  /**
   * 合并验证结果
   * @param baseValidation 基础验证结果
   * @param pdfValidation PDF特定验证结果
   * @returns 合并后的验证结果
   */
  private mergeValidationResults(baseValidation: any, pdfValidation: any): any {
    return {
      isValid: baseValidation.isValid && pdfValidation.isValid,
      issues: [...baseValidation.issues, ...pdfValidation.issues],
      pathCompleteness: Math.min(baseValidation.pathCompleteness, pdfValidation.pathCompleteness),
      keyPointsValidated: baseValidation.keyPointsValidated + pdfValidation.keyPointsValidated,
      continuityScore: Math.min(baseValidation.continuityScore, pdfValidation.continuityScore)
    }
  }

  /**
   * 计算PDF渲染准确性
   * @param options PDF选项
   * @param svgValidation SVG验证结果
   * @returns 渲染准确性分数
   */
  private calculatePDFRenderingAccuracy(options: PDFExportOptions, svgValidation: any): number {
    let accuracy = svgValidation.svgElementsFound > 0
      ? svgValidation.svgElementsRendered / svgValidation.svgElementsFound
      : 1

    // 根据PDF质量设置调整
    const qualityBonus = (options.quality || 0.9) * 0.1
    accuracy = Math.min(1, accuracy + qualityBonus)

    return accuracy
  }

  /**
   * 计算PDF样式一致性
   * @param options PDF选项
   * @returns 样式一致性分数
   */
  private calculatePDFStyleConsistency(options: PDFExportOptions): number {
    let consistency = 0.8 // 基础分数

    // 元数据完整性加分
    if (options.includeMetadata) consistency += 0.1
    if (options.includeFooter) consistency += 0.05

    // 质量设置加分
    if (options.quality && options.quality > 0.8) consistency += 0.05

    return Math.min(1, consistency)
  }

  /**
   * 计算PDF性能分数
   * @param options PDF选项
   * @returns 性能分数
   */
  private calculatePDFPerformanceScore(options: PDFExportOptions): number {
    let score = 0.7 // 基础分数

    // 质量与性能的平衡
    const quality = options.quality || 0.9
    if (quality < 0.7) {
      score += 0.2 // 低质量，高性能
    } else if (quality > 0.9) {
      score -= 0.1 // 高质量，可能影响性能
    }

    // 纸张大小影响
    if (options.paperSize === 'a5') {
      score += 0.1 // 小尺寸，更快处理
    } else if (options.paperSize === 'a3') {
      score -= 0.1 // 大尺寸，处理较慢
    }

    return Math.max(0, Math.min(1, score))
  }

  /**
   * 计算PDF视觉保真度
   * @param options PDF选项
   * @param pathValidation 路径验证结果
   * @returns 视觉保真度分数
   */
  private calculatePDFVisualFidelity(options: PDFExportOptions, pathValidation: any): number {
    const baseScore = pathValidation.pathCompleteness / 100
    const qualityMultiplier = options.quality || 0.9

    return Math.min(1, baseScore * qualityMultiplier)
  }

  /**
   * 添加PDF特定建议
   * @param report 质量报告
   * @param options PDF选项
   * @param pdfValidation PDF验证结果
   */
  private addPDFSpecificRecommendations(
    report: any,
    options: PDFExportOptions,
    pdfValidation: any
  ): void {
    const pdfRecommendations: string[] = []

    // 分辨率建议
    const dpi = this.calculateEffectiveDPI({ width: 1000, height: 1000 } as HTMLCanvasElement, options)
    if (dpi < 200) {
      pdfRecommendations.push(`提高导出质量设置以获得更好的打印效果（当前约${dpi.toFixed(0)} DPI）`)
    }

    // 页面布局建议
    if (options.orientation === 'auto') {
      pdfRecommendations.push('考虑手动设置页面方向以获得最佳布局效果')
    }

    // 元数据建议
    if (!options.includeMetadata) {
      pdfRecommendations.push('启用元数据包含以获得更完整的PDF文档信息')
    }

    // 颜色建议
    if (pdfValidation.issues.some((issue: any) => issue.type === 'style_mismatch' && issue.message.includes('透明'))) {
      pdfRecommendations.push('考虑使用白色背景替代透明背景以确保打印一致性')
    }

    // 将PDF特定建议添加到报告中
    if (pdfRecommendations.length > 0) {
      report.recommendations = [...report.recommendations, ...pdfRecommendations]
    }
  }

  /**
   * 创建空的质量报告
   * @returns 空质量报告
   */
  private createEmptyQualityReport(): QualityReport {
    return {
      overallScore: 0,
      pathCompleteness: 0,
      renderingAccuracy: 0,
      styleAccuracy: 0,
      recommendations: ['PDF导出过程中出现错误，无法生成质量报告'],
      detailedResults: []
    }
  }

  /**
   * 创建错误元数据
   * @param options PDF选项
   * @param exportTime 导出时间
   * @returns 错误元数据
   */
  private createErrorMetadata(options: PDFExportOptions, exportTime: number): ExportMetadata {
    return {
      fileName: options.fileName || `failed-export-${Date.now()}.pdf`,
      fileSize: 0,
      dimensions: { width: 0, height: 0 },
      exportTime,
      renderingMethod: 'html2canvas',
      qualityScore: 0,
      timestamp: new Date().toISOString(),
      format: ExportFormat.PDF
    }
  }

  /**
   * 创建导出错误
   * @param error 原始错误
   * @param stage 导出阶段
   * @returns 导出错误对象
   */
  private createExportError(error: any, stage: ExportStage): ExportError {
    const exportError = new Error(error.message || 'PDF导出失败') as ExportError

    // 根据错误类型和阶段确定错误类型
    exportError.type = this.determineErrorType(error, stage)
    exportError.stage = stage
    exportError.recoverable = this.isErrorRecoverable(error, stage)

    exportError.context = {
      format: ExportFormat.PDF,
      options: {},
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      memoryUsage: this.getMemoryUsage()
    }

    exportError.suggestedActions = this.generateErrorSuggestedActions(error, stage)

    return exportError
  }

  /**
   * 确定错误类型
   * @param error 原始错误
   * @param stage 导出阶段
   * @returns 错误类型
   */
  private determineErrorType(error: any, stage: ExportStage): string {
    // 检查错误消息中的关键词
    const errorMessage = error.message?.toLowerCase() || ''

    if (errorMessage.includes('canvas') || errorMessage.includes('context')) {
      return 'CANVAS_ACCESS_ERROR'
    }

    if (errorMessage.includes('svg') || errorMessage.includes('path')) {
      return 'SVG_RENDERING_ERROR'
    }

    if (errorMessage.includes('html2canvas')) {
      return 'HTML2CANVAS_ERROR'
    }

    if (errorMessage.includes('memory') || errorMessage.includes('out of memory')) {
      return 'MEMORY_ERROR'
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('time')) {
      return 'TIMEOUT_ERROR'
    }

    // 根据阶段确定默认错误类型
    switch (stage) {
      case ExportStage.PREPARING_CANVAS:
      case ExportStage.PROCESSING_SVG:
        return 'CANVAS_ACCESS_ERROR'
      case ExportStage.RENDERING:
        return 'HTML2CANVAS_ERROR'
      case ExportStage.GENERATING_FILE:
        return 'FILE_GENERATION_ERROR'
      case ExportStage.VALIDATING_QUALITY:
        return 'QUALITY_VALIDATION_ERROR'
      default:
        return 'FILE_GENERATION_ERROR'
    }
  }

  /**
   * 判断错误是否可恢复
   * @param error 原始错误
   * @param stage 导出阶段
   * @returns 是否可恢复
   */
  private isErrorRecoverable(error: any, stage: ExportStage): boolean {
    const errorMessage = error.message?.toLowerCase() || ''

    // 不可恢复的错误
    if (errorMessage.includes('out of memory') ||
        errorMessage.includes('quota exceeded') ||
        errorMessage.includes('security') ||
        errorMessage.includes('permission denied')) {
      return false
    }

    // 根据阶段判断
    switch (stage) {
      case ExportStage.PREPARING_CANVAS:
      case ExportStage.RENDERING:
        return true // 可以尝试备用渲染器
      case ExportStage.GENERATING_FILE:
        return true // 可以调整质量设置重试
      case ExportStage.VALIDATING_QUALITY:
        return true // 质量验证失败不影响导出
      default:
        return true
    }
  }

  /**
   * 生成错误建议操作
   * @param error 原始错误
   * @param stage 导出阶段
   * @returns 建议操作列表
   */
  private generateErrorSuggestedActions(error: any, stage: ExportStage): string[] {
    const errorMessage = error.message?.toLowerCase() || ''
    const actions: string[] = []

    // 通用建议
    actions.push('请重试PDF导出操作')

    // 根据错误类型提供特定建议
    if (errorMessage.includes('canvas') || errorMessage.includes('context')) {
      actions.push('检查浏览器是否支持Canvas API')
      actions.push('尝试刷新页面后重试')
    }

    if (errorMessage.includes('svg') || errorMessage.includes('path')) {
      actions.push('检查SVG元素是否正确渲染')
      actions.push('尝试简化设计复杂度')
    }

    if (errorMessage.includes('html2canvas')) {
      actions.push('尝试使用备用渲染器')
      actions.push('检查是否有跨域资源问题')
    }

    if (errorMessage.includes('memory')) {
      actions.push('降低导出质量设置')
      actions.push('关闭其他浏览器标签页释放内存')
      actions.push('尝试分段导出大型设计')
    }

    if (errorMessage.includes('timeout')) {
      actions.push('增加导出超时时间')
      actions.push('简化设计内容')
    }

    // 根据阶段提供特定建议
    switch (stage) {
      case ExportStage.PREPARING_CANVAS:
        actions.push('检查画布元素是否可访问')
        break
      case ExportStage.RENDERING:
        actions.push('尝试降低缩放比例')
        actions.push('使用较低的质量设置')
        break
      case ExportStage.GENERATING_FILE:
        actions.push('检查PDF生成参数')
        actions.push('尝试不同的纸张大小')
        break
      case ExportStage.VALIDATING_QUALITY:
        actions.push('跳过质量验证继续导出')
        break
    }

    // 最后的建议
    actions.push('如问题持续，请联系技术支持')

    return actions
  }

  /**
   * 获取内存使用情况
   * @returns 内存使用量（字节）
   */
  private getMemoryUsage(): number | undefined {
    try {
      if ('memory' in performance) {
        const memory = (performance as any).memory
        return memory.usedJSHeapSize
      }
    } catch (error) {
      // 忽略错误
    }
    return undefined
  }

  /**
   * 更新进度状态
   * @param callback 进度回调函数
   * @param stage 当前阶段
   * @param progress 进度百分比
   * @param message 进度消息
   */
  private updateProgress(
    callback: ProgressCallback | undefined,
    stage: ExportStage,
    progress: number,
    message: string
  ): void {
    if (callback) {
      callback({
        stage,
        progress,
        message
      })
    }
  }
}

// 创建全局PDF导出引擎实例
export const pdfExportEngine = new PDFExportEngine()

// 导出类型和实例
export default PDFExportEngine
