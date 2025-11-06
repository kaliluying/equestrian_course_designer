/**
 * 备用画布渲染器
 * 使用Canvas 2D API创建替代渲染，为复杂场景构建逐元素渲染，为大型设计添加性能优化
 */

import { SVGToCanvasConverter } from './svgToCanvasConverter'
import { ExportQualityValidator } from './exportQualityValidator'
import { SVGExportEnhancer, type SVGProcessingResult } from './svgExportEnhancer'
import { convertSVGStyles, restoreSVGStyles, type StyleConversionResult } from './svgStyleInlineConverter'
import { CanvasFallbackRenderer, type CanvasRenderOptions } from './canvasFallbackRenderer'

// 备用渲染配置接口
export interface BackupRenderConfig {
  backgroundColor?: string
  scale?: number
  quality?: number
  width?: number
  height?: number
  padding?: number

  // SVG处理选项
  enableSVGPreprocessing?: boolean
  forceStyleInlining?: boolean
  validateSVGElements?: boolean

  // 质量控制选项
  enableQualityValidation?: boolean
  fallbackToOriginal?: boolean
  maxRetryAttempts?: number

  // 调试选项
  enableDebugMode?: boolean
  logProcessingSteps?: boolean
}

// 备用渲染结果接口
export interface BackupRenderResult {
  canvas: HTMLCanvasElement
  success: boolean
  renderMethod: 'canvas-fallback' | 'original-html2canvas' | 'hybrid'
  processingTime: number
  svgElementsProcessed: number
  qualityScore?: number
  errors: string[]
  warnings: string[]
}

/**
 * Canvas备用渲染方案主类
 */
export class CanvasBackupRenderer {
  private fallbackRenderer: CanvasFallbackRenderer
  private svgConverter: SVGToCanvasConverter
  private svgEnhancer: SVGExportEnhancer
  private debugMode = false

  constructor(debugMode = false) {
    this.debugMode = debugMode
    this.fallbackRenderer = new CanvasFallbackRenderer(debugMode)
    this.svgConverter = new SVGToCanvasConverter(debugMode)
    this.svgEnhancer = new SVGExportEnhancer()
  }

  /**
   * 执行备用渲染方案
   * @param sourceCanvas 源画布元素
   * @param config 渲染配置
   * @returns 渲染结果
   */
  async executeBackupRendering(
    sourceCanvas: HTMLElement,
    config: BackupRenderConfig = {}
  ): Promise<BackupRenderResult> {
    const startTime = performance.now()
    const errors: string[] = []
    const warnings: string[] = []

    const {
      backgroundColor = '#ffffff',
      scale = 2,
      quality = 1.0,
      width,
      height,
      padding = 20,
      enableSVGPreprocessing = true,
      forceStyleInlining = true,
      validateSVGElements = true,
      enableQualityValidation = true,
      fallbackToOriginal = false,
      maxRetryAttempts = 2,
      enableDebugMode = this.debugMode,
      logProcessingSteps = this.debugMode
    } = config

    if (logProcessingSteps) {
      console.log('开始Canvas备用渲染方案执行...')
    }

    try {
      // 1. 预处理阶段：SVG元素检测和增强
      let svgProcessingResult: SVGProcessingResult | null = null
      let styleConversionResults: StyleConversionResult[] = []

      if (enableSVGPreprocessing) {
        if (logProcessingSteps) {
          console.log('步骤1: SVG预处理和样式转换')
        }

        // 检测SVG元素
        const svgElements = this.svgEnhancer.detectSVGElements(sourceCanvas)

        if (svgElements.length > 0) {
          // 执行SVG预处理
          svgProcessingResult = this.svgEnhancer.prepareSVGForExport(sourceCanvas)

          // 强制样式内联
          if (forceStyleInlining) {
            styleConversionResults = convertSVGStyles(sourceCanvas)
          }

          if (logProcessingSteps) {
            console.log(`SVG预处理完成，处理了 ${svgProcessingResult.processedElements.length} 个元素`)
          }
        }
      }

      // 2. 验证阶段：检查SVG元素状态
      if (validateSVGElements && svgProcessingResult) {
        if (logProcessingSteps) {
          console.log('步骤2: SVG元素验证')
        }

        const validationResult = this.validateSVGElements(sourceCanvas)
        if (!validationResult.isValid) {
          warnings.push(...validationResult.warnings)
          if (logProcessingSteps) {
            console.warn('SVG验证发现问题:', validationResult.warnings)
          }
        }
      }

      // 3. 渲染阶段：使用Canvas API重绘
      if (logProcessingSteps) {
        console.log('步骤3: Canvas备用渲染')
      }

      const sourceRect = sourceCanvas.getBoundingClientRect()
      const renderOptions: CanvasRenderOptions = {
        backgroundColor,
        scale,
        quality,
        width: width || sourceRect.width,
        height: height || sourceRect.height,
        padding,
        enableDebugMode
      }

      const renderResult = await this.fallbackRenderer.renderCanvasToCanvas(
        sourceCanvas,
        renderOptions
      )

      // 4. 质量验证阶段
      let qualityScore: number | undefined
      if (enableQualityValidation && renderResult.success) {
        if (logProcessingSteps) {
          console.log('步骤4: 质量验证')
        }

        qualityScore = await this.validateRenderQuality(
          renderResult.canvas,
          sourceCanvas,
          svgProcessingResult
        )

        if (qualityScore < 0.7) {
          warnings.push(`渲染质量较低: ${(qualityScore * 100).toFixed(1)}%`)
        }
      }

      // 5. 恢复阶段：清理临时修改
      if (svgProcessingResult) {
        if (logProcessingSteps) {
          console.log('步骤5: 恢复原始状态')
        }

        this.svgEnhancer.restoreSVGState(svgProcessingResult)

        if (styleConversionResults.length > 0) {
          restoreSVGStyles(styleConversionResults)
        }
      }

      const processingTime = performance.now() - startTime

      if (logProcessingSteps) {
        console.log(`Canvas备用渲染完成，总耗时: ${processingTime.toFixed(2)}ms`)
      }

      return {
        canvas: renderResult.canvas,
        success: renderResult.success,
        renderMethod: 'canvas-fallback',
        processingTime,
        svgElementsProcessed: renderResult.renderedElements,
        qualityScore,
        errors: [...errors, ...renderResult.errors],
        warnings
      }

    } catch (error) {
      const errorMsg = `Canvas备用渲染失败: ${error instanceof Error ? error.message : String(error)}`
      errors.push(errorMsg)
      console.error(errorMsg, error)

      // 如果启用了原始方案回退
      if (fallbackToOriginal) {
        warnings.push('备用渲染失败，建议使用原始html2canvas方案')
      }

      return {
        canvas: document.createElement('canvas'),
        success: false,
        renderMethod: 'canvas-fallback',
        processingTime: performance.now() - startTime,
        svgElementsProcessed: 0,
        errors,
        warnings
      }
    }
  }

  /**
   * 验证SVG元素状态
   * @param canvas 画布元素
   * @returns 验证结果
   */
  private validateSVGElements(canvas: HTMLElement): {
    isValid: boolean
    warnings: string[]
  } {
    const warnings: string[] = []
    const svgElements = canvas.querySelectorAll('svg')

    svgElements.forEach((svg, index) => {
      // 检查SVG可见性
      const computedStyle = window.getComputedStyle(svg)
      if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
        warnings.push(`SVG元素 ${index + 1} 不可见`)
      }

      // 检查SVG尺寸
      const rect = svg.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        warnings.push(`SVG元素 ${index + 1} 尺寸为零`)
      }

      // 检查路径元素
      const paths = svg.querySelectorAll('path')
      paths.forEach((path, pathIndex) => {
        const pathData = path.getAttribute('d')
        if (!pathData || pathData.trim() === '') {
          warnings.push(`SVG元素 ${index + 1} 的路径 ${pathIndex + 1} 缺少路径数据`)
        }
      })
    })

    return {
      isValid: warnings.length === 0,
      warnings
    }
  }

  /**
   * 验证渲染质量
   * @param renderedCanvas 渲染后的Canvas
   * @param originalCanvas 原始画布
   * @param svgProcessingResult SVG处理结果
   * @returns 质量分数 (0-1)
   */
  private async validateRenderQuality(
    renderedCanvas: HTMLCanvasElement,
    originalCanvas: HTMLElement,
    svgProcessingResult: SVGProcessingResult | null
  ): Promise<number> {
    try {
      // 基础质量检查：检查Canvas是否为空白
      const ctx = renderedCanvas.getContext('2d')
      if (!ctx) {
        return 0
      }

      const imageData = ctx.getImageData(0, 0, renderedCanvas.width, renderedCanvas.height)
      const pixels = imageData.data

      // 检查是否有非背景像素
      let nonBackgroundPixels = 0
      const totalPixels = pixels.length / 4

      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]
        const g = pixels[i + 1]
        const b = pixels[i + 2]
        const a = pixels[i + 3]

        // 检查是否为白色背景 (255, 255, 255) 或透明
        if (!(r === 255 && g === 255 && b === 255) && a > 0) {
          nonBackgroundPixels++
        }
      }

      const contentRatio = nonBackgroundPixels / totalPixels

      // 基础质量分数：基于内容比例
      let qualityScore = Math.min(contentRatio * 10, 1) // 内容比例转换为质量分数

      // 如果有SVG处理结果，进行更详细的验证
      if (svgProcessingResult && svgProcessingResult.processedElements.length > 0) {
        // 检查是否所有SVG元素都被正确处理
        const processedCount = svgProcessingResult.processedElements.length
        const expectedCount = this.svgEnhancer.detectSVGElements(originalCanvas).length

        if (processedCount === expectedCount) {
          qualityScore += 0.2 // 所有元素都被处理的奖励
        }

        // 检查路径完整性（简化版本）
        const hasValidPaths = svgProcessingResult.processedElements.some(
          element => element.pathData && element.pathData.length > 0
        )

        if (hasValidPaths) {
          qualityScore += 0.1 // 有效路径的奖励
        }
      }

      return Math.min(qualityScore, 1)

    } catch (error) {
      console.warn('质量验证失败:', error)
      return 0.5 // 默认中等质量分数
    }
  }

  /**
   * 获取渲染统计信息
   * @param canvas 画布元素
   * @returns 统计信息
   */
  getCanvasRenderingStats(canvas: HTMLElement): {
    svgElementCount: number
    pathElementCount: number
    estimatedComplexity: 'low' | 'medium' | 'high'
    recommendedMethod: 'html2canvas' | 'canvas-fallback' | 'hybrid'
  } {
    const svgElements = this.svgEnhancer.detectSVGElements(canvas)
    const pathElements = canvas.querySelectorAll('path').length

    let complexity: 'low' | 'medium' | 'high' = 'low'
    let recommendedMethod: 'html2canvas' | 'canvas-fallback' | 'hybrid' = 'html2canvas'

    if (svgElements.length > 10 || pathElements > 20) {
      complexity = 'high'
      recommendedMethod = 'canvas-fallback'
    } else if (svgElements.length > 5 || pathElements > 10) {
      complexity = 'medium'
      recommendedMethod = 'hybrid'
    }

    return {
      svgElementCount: svgElements.length,
      pathElementCount: pathElements,
      estimatedComplexity: complexity,
      recommendedMethod
    }
  }

  /**
   * 执行逐元素渲染（用于复杂场景的性能优化）
   * @param sourceCanvas 源画布元素
   * @param config 渲染配置
   * @returns 渲染结果
   */
  async executeElementByElementRendering(
    sourceCanvas: HTMLElement,
    config: BackupRenderConfig = {}
  ): Promise<BackupRenderResult> {
    const startTime = performance.now()
    const errors: string[] = []
    const warnings: string[] = []

    const {
      backgroundColor = '#ffffff',
      scale = 2,
      quality = 1.0,
      width,
      height,
      padding = 20,
      enableDebugMode = this.debugMode,
      logProcessingSteps = this.debugMode
    } = config

    if (logProcessingSteps) {
      console.log('开始逐元素渲染...')
    }

    try {
      const sourceRect = sourceCanvas.getBoundingClientRect()
      const renderOptions: CanvasRenderOptions = {
        backgroundColor,
        scale,
        quality,
        width: width || sourceRect.width,
        height: height || sourceRect.height,
        padding,
        enableDebugMode
      }

      // 分批处理元素以优化性能
      const svgElements = this.svgEnhancer.detectSVGElements(sourceCanvas)
      const batchSize = 5 // 每批处理5个元素
      let processedElements = 0

      // 创建目标Canvas
      const targetCanvas = document.createElement('canvas')
      const finalWidth = Math.round((renderOptions.width! + padding * 2) * scale)
      const finalHeight = Math.round((renderOptions.height! + padding * 2) * scale)

      targetCanvas.width = finalWidth
      targetCanvas.height = finalHeight

      const ctx = targetCanvas.getContext('2d')
      if (!ctx) {
        throw new Error('无法获取Canvas 2D上下文')
      }

      // 设置基础样式
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.scale(scale, scale)
      ctx.translate(padding, padding)
      ctx.fillStyle = backgroundColor
      ctx.fillRect(-padding, -padding, renderOptions.width! + padding * 2, renderOptions.height! + padding * 2)

      // 分批处理SVG元素
      for (let i = 0; i < svgElements.length; i += batchSize) {
        const batch = svgElements.slice(i, i + batchSize)

        if (logProcessingSteps) {
          console.log(`处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(svgElements.length / batchSize)}: ${batch.length} 个元素`)
        }

        for (const element of batch) {
          try {
            // 为每个元素创建临时渲染上下文
            const success = await this.renderSingleElementOptimized(ctx, element, sourceCanvas, renderOptions)
            if (success) {
              processedElements++
            } else {
              warnings.push(`元素渲染失败: ${element.tagName}`)
            }
          } catch (error) {
            const errorMsg = `元素渲染异常: ${error instanceof Error ? error.message : String(error)}`
            errors.push(errorMsg)
            if (logProcessingSteps) {
              console.warn(errorMsg, element)
            }
          }
        }

        // 在批次之间添加短暂延迟以避免阻塞UI
        if (i + batchSize < svgElements.length) {
          await new Promise(resolve => setTimeout(resolve, 1))
        }
      }

      const processingTime = performance.now() - startTime

      if (logProcessingSteps) {
        console.log(`逐元素渲染完成: ${processedElements}/${svgElements.length} 个元素，耗时: ${processingTime.toFixed(2)}ms`)
      }

      return {
        canvas: targetCanvas,
        success: errors.length === 0,
        renderMethod: 'canvas-fallback',
        processingTime,
        svgElementsProcessed: processedElements,
        errors,
        warnings
      }

    } catch (error) {
      const errorMsg = `逐元素渲染失败: ${error instanceof Error ? error.message : String(error)}`
      errors.push(errorMsg)
      console.error(errorMsg)

      return {
        canvas: document.createElement('canvas'),
        success: false,
        renderMethod: 'canvas-fallback',
        processingTime: performance.now() - startTime,
        svgElementsProcessed: 0,
        errors,
        warnings
      }
    }
  }

  /**
   * 优化的单元素渲染
   * @param ctx Canvas上下文
   * @param element SVG元素
   * @param sourceCanvas 源画布
   * @param options 渲染选项
   * @returns 是否成功
   */
  private async renderSingleElementOptimized(
    ctx: CanvasRenderingContext2D,
    element: SVGElement,
    sourceCanvas: HTMLElement,
    options: CanvasRenderOptions
  ): Promise<boolean> {
    try {
      // 检查元素可见性
      const computedStyle = window.getComputedStyle(element)
      if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
        return false
      }

      // 检查元素是否在视口内
      const elementRect = element.getBoundingClientRect()
      const sourceRect = sourceCanvas.getBoundingClientRect()

      if (elementRect.width === 0 || elementRect.height === 0) {
        return false
      }

      // 使用SVG转换器渲染元素
      const pathData = this.extractPathDataFromElement(element)
      if (!pathData) {
        return false
      }

      // 计算相对位置
      const relativeX = elementRect.left - sourceRect.left
      const relativeY = elementRect.top - sourceRect.top

      // 保存上下文状态
      ctx.save()
      ctx.translate(relativeX, relativeY)

      // 提取样式
      const styles = this.extractElementStyles(element, computedStyle)

      // 渲染路径
      const success = this.svgConverter.renderSVGPathToCanvas(pathData, ctx, styles)

      // 恢复上下文状态
      ctx.restore()

      return success
    } catch (error) {
      console.warn('单元素渲染失败:', error, element)
      return false
    }
  }

  /**
   * 从元素中提取路径数据
   * @param element SVG元素
   * @returns 路径数据字符串
   */
  private extractPathDataFromElement(element: SVGElement): string | null {
    const tagName = element.tagName.toLowerCase()

    switch (tagName) {
      case 'path':
        return (element as SVGPathElement).getAttribute('d')
      case 'circle':
        return this.convertCircleToPath(element as SVGCircleElement)
      case 'rect':
        return this.convertRectToPath(element as SVGRectElement)
      case 'line':
        return this.convertLineToPath(element as SVGLineElement)
      case 'ellipse':
        return this.convertEllipseToPath(element as SVGEllipseElement)
      case 'polygon':
        return this.convertPolygonToPath(element as SVGPolygonElement)
      case 'polyline':
        return this.convertPolylineToPath(element as SVGPolylineElement)
      default:
        // 对于复合元素，查找内部路径
        const paths = element.querySelectorAll('path')
        if (paths.length > 0) {
          return Array.from(paths)
            .map(path => path.getAttribute('d'))
            .filter(d => d)
            .join(' ')
        }
        return null
    }
  }

  /**
   * 提取元素样式
   * @param element SVG元素
   * @param computedStyle 计算样式
   * @returns 样式对象
   */
  private extractElementStyles(element: SVGElement, computedStyle: CSSStyleDeclaration) {
    return {
      fill: this.getStyleValue(element, computedStyle, 'fill'),
      stroke: this.getStyleValue(element, computedStyle, 'stroke'),
      strokeWidth: this.getNumericStyleValue(element, computedStyle, 'stroke-width'),
      strokeDasharray: this.getStrokeDashArray(element, computedStyle),
      strokeDashoffset: this.getNumericStyleValue(element, computedStyle, 'stroke-dashoffset'),
      strokeLinecap: this.getStyleValue(element, computedStyle, 'stroke-linecap') as any,
      strokeLinejoin: this.getStyleValue(element, computedStyle, 'stroke-linejoin') as any,
      opacity: this.getNumericStyleValue(element, computedStyle, 'opacity'),
      transform: element.getAttribute('transform') || computedStyle.transform
    }
  }

  // 几何形状转换方法
  private convertCircleToPath(circle: SVGCircleElement): string {
    const cx = parseFloat(circle.getAttribute('cx') || '0')
    const cy = parseFloat(circle.getAttribute('cy') || '0')
    const r = parseFloat(circle.getAttribute('r') || '0')
    if (r <= 0) return ''
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
  }

  private convertRectToPath(rect: SVGRectElement): string {
    const x = parseFloat(rect.getAttribute('x') || '0')
    const y = parseFloat(rect.getAttribute('y') || '0')
    const width = parseFloat(rect.getAttribute('width') || '0')
    const height = parseFloat(rect.getAttribute('height') || '0')
    if (width <= 0 || height <= 0) return ''
    return `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`
  }

  private convertLineToPath(line: SVGLineElement): string {
    const x1 = parseFloat(line.getAttribute('x1') || '0')
    const y1 = parseFloat(line.getAttribute('y1') || '0')
    const x2 = parseFloat(line.getAttribute('x2') || '0')
    const y2 = parseFloat(line.getAttribute('y2') || '0')
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }

  private convertEllipseToPath(ellipse: SVGEllipseElement): string {
    const cx = parseFloat(ellipse.getAttribute('cx') || '0')
    const cy = parseFloat(ellipse.getAttribute('cy') || '0')
    const rx = parseFloat(ellipse.getAttribute('rx') || '0')
    const ry = parseFloat(ellipse.getAttribute('ry') || '0')
    if (rx <= 0 || ry <= 0) return ''
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`
  }

  private convertPolygonToPath(polygon: SVGPolygonElement): string {
    const points = polygon.getAttribute('points')
    if (!points) return ''
    const coords = points.trim().split(/[\s,]+/)
    if (coords.length < 4) return ''
    let path = ''
    for (let i = 0; i < coords.length; i += 2) {
      const x = parseFloat(coords[i])
      const y = parseFloat(coords[i + 1])
      if (isNaN(x) || isNaN(y)) continue
      path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`
    }
    return path + ' Z'
  }

  private convertPolylineToPath(polyline: SVGPolylineElement): string {
    const points = polyline.getAttribute('points')
    if (!points) return ''
    const coords = points.trim().split(/[\s,]+/)
    if (coords.length < 4) return ''
    let path = ''
    for (let i = 0; i < coords.length; i += 2) {
      const x = parseFloat(coords[i])
      const y = parseFloat(coords[i + 1])
      if (isNaN(x) || isNaN(y)) continue
      path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`
    }
    return path
  }

  // 样式提取辅助方法
  private getStyleValue(element: SVGElement, computedStyle: CSSStyleDeclaration, property: string): string | undefined {
    const attrValue = element.getAttribute(property)
    if (attrValue && attrValue !== 'none') return attrValue

    const inlineValue = element.style.getPropertyValue(property)
    if (inlineValue && inlineValue !== 'none') return inlineValue

    const computedValue = computedStyle.getPropertyValue(property)
    if (computedValue && computedValue !== 'none' && computedValue !== 'auto') return computedValue

    return undefined
  }

  private getNumericStyleValue(element: SVGElement, computedStyle: CSSStyleDeclaration, property: string): number | undefined {
    const value = this.getStyleValue(element, computedStyle, property)
    if (value) {
      const numValue = parseFloat(value)
      return isNaN(numValue) ? undefined : numValue
    }
    return undefined
  }

  private getStrokeDashArray(element: SVGElement, computedStyle: CSSStyleDeclaration): number[] | undefined {
    const value = this.getStyleValue(element, computedStyle, 'stroke-dasharray')
    if (value && value !== 'none') {
      return value.split(/[,\s]+/)
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v))
    }
    return undefined
  }
}

// 创建全局实例
export const canvasBackupRenderer = new CanvasBackupRenderer()

// 便捷函数
export async function executeCanvasBackupRendering(
  sourceCanvas: HTMLElement,
  config?: BackupRenderConfig
): Promise<BackupRenderResult> {
  return canvasBackupRenderer.executeBackupRendering(sourceCanvas, config)
}

/**
 * 智能渲染函数：根据画布复杂度自动选择最佳渲染方案
 * @param sourceCanvas 源画布元素
 * @param config 渲染配置
 * @returns 渲染结果
 */
export async function smartCanvasRendering(
  sourceCanvas: HTMLElement,
  config: BackupRenderConfig = {}
): Promise<BackupRenderResult> {
  const stats = canvasBackupRenderer.getCanvasRenderingStats(sourceCanvas)

  if (config.enableDebugMode) {
    console.log('智能渲染分析:', stats)
  }

  // 根据复杂度调整配置
  const optimizedConfig: BackupRenderConfig = {
    ...config,
    enableSVGPreprocessing: stats.svgElementCount > 0,
    forceStyleInlining: stats.estimatedComplexity !== 'low',
    validateSVGElements: stats.estimatedComplexity === 'high',
    enableQualityValidation: true,
    scale: stats.estimatedComplexity === 'high' ? 3 : 2
  }

  return canvasBackupRenderer.executeBackupRendering(sourceCanvas, optimizedConfig)
}
