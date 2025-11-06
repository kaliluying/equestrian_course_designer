/**
 * Canvas备用渲染方案
 * 当html2canvas无法正确处理SVG元素时的完整备用渲染解决方案
 * 集成SVG到Canvas转换、样式处理和质量验证功能
 */

import { CanvasFallbackRenderer, type CanvasRenderOptions, type CanvasRenderResult } from './canvasFallbackRenderer'
import { SVGToCanvasConverter, type SVGElementStyles } from './svgToCanvasConverter'
import { SVGExportEnhancer, type SVGProcessingResult } from './svgExportEnhancer'
import { convertSVGStyles, restoreSVGStyles } from './svgStyleInlineConverter'

// 备用渲染配置接口
export interface BackupRenderConfig {
  // 基础渲染选项
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
      let styleConversionResults: any[] = []

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
