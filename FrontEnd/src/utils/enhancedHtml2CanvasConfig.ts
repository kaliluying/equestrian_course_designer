/**
 * 增强的html2canvas配置系统
 * 提供基于html2canvas的增强配置渲染，包括SVG元素预处理和文本清理
 */

import html2canvas from 'html2canvas'
import type { Options as Html2CanvasOptions } from 'html2canvas'
import { SVGExportEnhancer } from './svgExportEnhancer'

// 增强配置选项接口
export interface EnhancedHtml2CanvasOptions {
  backgroundColor?: string
  scale?: number
  quality?: number
  width?: number
  height?: number
  svgRenderingMode?: 'standard' | 'enhanced' | 'fallback'
  forceInlineStyles?: boolean
  preserveSVGViewBox?: boolean
  enhanceSVGVisibility?: boolean
  enableDebugMode?: boolean
  logSVGProcessing?: boolean
  textCleanupMode?: 'none' | 'basic' | 'aggressive'
  customPreprocessor?: (canvas: HTMLElement) => void
  customPostprocessor?: (result: HTMLCanvasElement) => HTMLCanvasElement
}

// SVG预处理结果接口
export interface SVGPreprocessingResult {
  processedElements: number
  enhancedElements: number
  cleanedTextNodes: number
  issues: string[]
}

// 渲染上下文接口
export interface RenderingContext {
  canvas: HTMLElement
  options: EnhancedHtml2CanvasOptions
  svgEnhancer: SVGExportEnhancer
  preprocessingResult?: SVGPreprocessingResult
}

/**
 * 创建增强的html2canvas配置
 * @param canvas 画布元素
 * @param options 增强配置选项
 * @returns html2canvas配置对象
 */
export function createEnhancedHtml2CanvasConfig(
  canvas: HTMLElement,
  options: EnhancedHtml2CanvasOptions = {}
): Html2CanvasOptions {
  const {
    backgroundColor = '#ffffff',
    scale = 2,
    quality = 1.0,
    width,
    height,
    svgRenderingMode = 'enhanced',
    forceInlineStyles = true,
    preserveSVGViewBox = true,
    enhanceSVGVisibility = true,
    enableDebugMode = false,
    logSVGProcessing = false
  } = options

  // 基础html2canvas配置
  const baseConfig: Html2CanvasOptions = {
    backgroundColor,
    scale,
    useCORS: true,
    allowTaint: false,
    foreignObjectRendering: true,
    removeContainer: false,
    logging: enableDebugMode,
    width,
    height,
    onclone: (clonedDoc, element) => {
      // 在克隆的文档中进行SVG预处理
      if (svgRenderingMode !== 'standard') {
        preprocessSVGInClonedDocument(clonedDoc, element, {
          svgRenderingMode,
          forceInlineStyles,
          preserveSVGViewBox,
          enhanceSVGVisibility,
          logSVGProcessing
        })
      }

      // 文本清理处理
      if (options.textCleanupMode && options.textCleanupMode !== 'none') {
        cleanupTextNodes(element, options.textCleanupMode)
      }

      // 自定义预处理器
      if (options.customPreprocessor) {
        options.customPreprocessor(element)
      }
    }
  }

  // 根据质量设置调整配置
  if (quality < 1.0) {
    baseConfig.scale = Math.max(1, scale * quality)
  }

  return baseConfig
}

/**
 * 在克隆文档中预处理SVG元素
 * @param clonedDoc 克隆的文档
 * @param element 根元素
 * @param options SVG处理选项
 */
function preprocessSVGInClonedDocument(
  clonedDoc: Document,
  element: HTMLElement,
  options: {
    svgRenderingMode: string
    forceInlineStyles: boolean
    preserveSVGViewBox: boolean
    enhanceSVGVisibility: boolean
    logSVGProcessing: boolean
  }
): void {
  const { svgRenderingMode, forceInlineStyles, preserveSVGViewBox, enhanceSVGVisibility, logSVGProcessing } = options

  try {
    // 查找所有SVG元素
    const svgElements = element.querySelectorAll('svg, path')

    if (logSVGProcessing) {
      console.log(`[SVG预处理] 找到 ${svgElements.length} 个SVG相关元素`)
    }

    svgElements.forEach((svgElement, index) => {
      const element = svgElement as SVGElement

      if (logSVGProcessing) {
        console.log(`[SVG预处理] 处理元素 ${index + 1}/${svgElements.length}: ${element.tagName}`)
      }

      // 增强SVG可见性
      if (enhanceSVGVisibility) {
        enhanceSVGElementVisibility(element)
      }

      // 强制内联样式
      if (forceInlineStyles) {
        forceInlineStylesOnElement(element)
      }

      // 保留SVG viewBox
      if (preserveSVGViewBox && element.tagName.toLowerCase() === 'svg') {
        preserveViewBoxAttributes(element as SVGSVGElement)
      }

      // 根据渲染模式进行特殊处理
      if (svgRenderingMode === 'enhanced') {
        applyEnhancedSVGRendering(element)
      } else if (svgRenderingMode === 'fallback') {
        applyFallbackSVGRendering(element)
      }
    })

    if (logSVGProcessing) {
      console.log(`[SVG预处理] 完成处理 ${svgElements.length} 个元素`)
    }

  } catch (error) {
    console.error('[SVG预处理] 处理失败:', error)
  }
}

/**
 * 增强SVG元素可见性
 * @param element SVG元素
 */
function enhanceSVGElementVisibility(element: SVGElement): void {
  const computedStyle = element.ownerDocument?.defaultView?.getComputedStyle(element)

  if (!computedStyle) return

  // 确保元素可见
  if (computedStyle.display === 'none') {
    element.style.display = 'block'
  }

  if (computedStyle.visibility === 'hidden') {
    element.style.visibility = 'visible'
  }

  if (computedStyle.opacity === '0') {
    element.style.opacity = '1'
  }

  // 对于路径元素，确保有适当的stroke或fill
  if (element.tagName.toLowerCase() === 'path') {
    const pathElement = element as SVGPathElement
    const stroke = computedStyle.stroke
    const fill = computedStyle.fill

    if ((!stroke || stroke === 'none') && (!fill || fill === 'none')) {
      // 如果既没有stroke也没有fill，设置默认stroke
      pathElement.style.stroke = '#2563eb'
      pathElement.style.strokeWidth = '2'
      pathElement.style.fill = 'none'
    }
  }
}

/**
 * 强制内联样式到元素
 * @param element SVG元素
 */
function forceInlineStylesOnElement(element: SVGElement): void {
  const computedStyle = element.ownerDocument?.defaultView?.getComputedStyle(element)

  if (!computedStyle) return

  // SVG相关的重要样式属性
  const importantProps = [
    'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
    'fill-opacity', 'opacity', 'visibility', 'display', 'transform',
    'transform-origin'
  ]

  importantProps.forEach(prop => {
    const value = computedStyle.getPropertyValue(prop)
    if (value && value !== 'none' && value !== 'auto' && value !== 'initial') {
      // 解析CSS变量
      const resolvedValue = resolveCSSVariables(value, element)
      element.style.setProperty(prop, resolvedValue, 'important')

      // 同时设置为属性（某些情况下html2canvas更好地识别属性）
      if (prop === 'fill') element.setAttribute('fill', resolvedValue)
      if (prop === 'stroke') element.setAttribute('stroke', resolvedValue)
      if (prop === 'stroke-width') element.setAttribute('stroke-width', resolvedValue)
      if (prop === 'stroke-dasharray') element.setAttribute('stroke-dasharray', resolvedValue)
      if (prop === 'opacity') element.setAttribute('opacity', resolvedValue)
    }
  })
}

/**
 * 保留SVG viewBox属性
 * @param svgElement SVG根元素
 */
function preserveViewBoxAttributes(svgElement: SVGSVGElement): void {
  // 确保viewBox属性存在且正确
  const viewBox = svgElement.getAttribute('viewBox')
  const width = svgElement.getAttribute('width')
  const height = svgElement.getAttribute('height')

  if (!viewBox && width && height) {
    // 如果没有viewBox但有width和height，创建viewBox
    const w = parseFloat(width)
    const h = parseFloat(height)
    if (!isNaN(w) && !isNaN(h)) {
      svgElement.setAttribute('viewBox', `0 0 ${w} ${h}`)
    }
  }

  // 确保preserveAspectRatio属性
  if (!svgElement.getAttribute('preserveAspectRatio')) {
    svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  }
}

/**
 * 应用增强SVG渲染
 * @param element SVG元素
 */
function applyEnhancedSVGRendering(element: SVGElement): void {
  // 设置高质量渲染属性
  element.style.shapeRendering = 'geometricPrecision'
  element.style.textRendering = 'geometricPrecision'

  // 对于路径元素，优化渲染
  if (element.tagName.toLowerCase() === 'path') {
    const pathElement = element as SVGPathElement

    // 确保路径数据存在
    const pathData = pathElement.getAttribute('d')
    if (pathData) {
      // 优化路径数据（移除多余空格等）
      const optimizedPath = optimizePathData(pathData)
      pathElement.setAttribute('d', optimizedPath)
    }
  }

  // 处理嵌套的SVG元素
  const nestedElements = element.querySelectorAll('path, circle, rect, line, ellipse, polygon, polyline')
  nestedElements.forEach(nested => {
    if (nested instanceof SVGElement) {
      nested.style.shapeRendering = 'geometricPrecision'
    }
  })
}

/**
 * 应用回退SVG渲染
 * @param element SVG元素
 */
function applyFallbackSVGRendering(element: SVGElement): void {
  // 使用更兼容的渲染设置
  element.style.shapeRendering = 'auto'
  element.style.textRendering = 'auto'

  // 简化复杂的样式
  const computedStyle = element.ownerDocument?.defaultView?.getComputedStyle(element)
  if (computedStyle) {
    // 移除可能导致问题的transform
    if (computedStyle.transform && computedStyle.transform !== 'none') {
      element.style.transform = 'none'
    }
  }
}

/**
 * 优化SVG路径数据
 * @param pathData 原始路径数据
 * @returns 优化后的路径数据
 */
function optimizePathData(pathData: string): string {
  return pathData
    .replace(/\s+/g, ' ') // 合并多个空格
    .replace(/,\s*/g, ',') // 移除逗号后的空格
    .replace(/\s*([MLHVCSQTAZ])\s*/gi, '$1') // 移除命令字母周围的空格
    .trim()
}

/**
 * 解析CSS变量
 * @param value CSS值
 * @param element 元素
 * @returns 解析后的值
 */
function resolveCSSVariables(value: string, element: Element): string {
  if (!value.includes('var(')) {
    return value
  }

  const computedStyle = element.ownerDocument?.defaultView?.getComputedStyle(element)
  if (!computedStyle) return value

  return value.replace(/var\(\s*(--[^,\)]+)\s*(?:,\s*([^)]+))?\s*\)/g, (match, varName, fallback) => {
    const resolvedValue = computedStyle.getPropertyValue(varName.trim())
    return resolvedValue || fallback || match
  })
}

/**
 * 清理文本节点中的特殊字符
 * @param element 根元素
 * @param mode 清理模式
 */
function cleanupTextNodes(element: HTMLElement, mode: 'basic' | 'aggressive'): void {
  const walker = element.ownerDocument?.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  )

  if (!walker) return

  const textNodes: Text[] = []
  let node: Node | null

  // 收集所有文本节点
  while (node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text)
    }
  }

  // 清理文本节点
  textNodes.forEach(textNode => {
    if (textNode.textContent) {
      let cleanedText = textNode.textContent

      if (mode === 'basic') {
        // 基础清理：替换常见的问题字符
        cleanedText = cleanedText
          .replace(/[\u200B-\u200D\uFEFF]/g, '') // 零宽字符
          .replace(/[\u2018\u2019]/g, "'") // 智能单引号
          .replace(/[\u201C\u201D]/g, '"') // 智能双引号
          .replace(/\u2013/g, '-') // en dash
          .replace(/\u2014/g, '--') // em dash
      } else if (mode === 'aggressive') {
        // 激进清理：替换所有非ASCII字符
        cleanedText = cleanedText.replace(/[^\x00-\x7F]/g, ' ')
      }

      if (cleanedText !== textNode.textContent) {
        textNode.textContent = cleanedText
      }
    }
  })
}

/**
 * 清理html2canvas处理上下文
 * @param canvas 画布元素
 */
export function cleanupHtml2CanvasProcessing(canvas: HTMLElement): void {
  try {
    // 移除临时添加的属性和样式
    const elementsWithSnapshots = canvas.querySelectorAll('[data-snapshot-id]')
    elementsWithSnapshots.forEach(element => {
      element.removeAttribute('data-snapshot-id')
    })

    // 清理可能添加的临时样式
    const elementsWithTempStyles = canvas.querySelectorAll('[data-temp-style]')
    elementsWithTempStyles.forEach(element => {
      element.removeAttribute('data-temp-style')
      element.removeAttribute('style')
    })

    // 触发垃圾回收（如果可能）
    if (window.gc && typeof window.gc === 'function') {
      window.gc()
    }
  } catch (error) {
    console.warn('清理html2canvas处理上下文时出错:', error)
  }
}

/**
 * 主要画布渲染器类
 */
export class MainCanvasRenderer {
  private svgEnhancer: SVGExportEnhancer
  private debugMode: boolean

  constructor(options: { debugMode?: boolean } = {}) {
    this.svgEnhancer = new SVGExportEnhancer()
    this.debugMode = options.debugMode || false
  }

  /**
   * 渲染画布到Canvas
   * @param canvas 画布元素
   * @param options 渲染选项
   * @returns 渲染结果
   */
  async render(
    canvas: HTMLElement,
    options: EnhancedHtml2CanvasOptions = {}
  ): Promise<HTMLCanvasElement> {
    const context: RenderingContext = {
      canvas,
      options,
      svgEnhancer: this.svgEnhancer
    }

    try {
      // 1. 预处理SVG元素
      if (options.svgRenderingMode !== 'standard') {
        context.preprocessingResult = await this.preprocessSVGElements(context)
      }

      // 2. 创建增强配置
      const html2canvasConfig = createEnhancedHtml2CanvasConfig(canvas, options)

      // 3. 执行渲染
      const result = await html2canvas(canvas, html2canvasConfig)

      // 4. 后处理
      const finalResult = options.customPostprocessor
        ? options.customPostprocessor(result)
        : result

      // 5. 清理
      this.cleanup(context)

      return finalResult

    } catch (error) {
      console.error('主要画布渲染器渲染失败:', error)

      // 清理资源
      this.cleanup(context)

      throw error
    }
  }

  /**
   * 预处理SVG元素
   * @param context 渲染上下文
   * @returns 预处理结果
   */
  private async preprocessSVGElements(context: RenderingContext): Promise<SVGPreprocessingResult> {
    const { canvas, options } = context
    const result: SVGPreprocessingResult = {
      processedElements: 0,
      enhancedElements: 0,
      cleanedTextNodes: 0,
      issues: []
    }

    try {
      // 使用SVG导出增强器预处理
      const processingResult = this.svgEnhancer.prepareSVGForExport(canvas)
      result.processedElements = processingResult.processedElements.length

      // 应用样式内联
      if (options.forceInlineStyles) {
        this.svgEnhancer.applyStyleInlining(processingResult.processedElements)
        result.enhancedElements = processingResult.processedElements.length
      }

      if (this.debugMode) {
        console.log('SVG预处理完成:', result)
      }

    } catch (error) {
      const errorMessage = `SVG预处理失败: ${error instanceof Error ? error.message : String(error)}`
      result.issues.push(errorMessage)
      console.error(errorMessage)
    }

    return result
  }

  /**
   * 清理渲染上下文
   * @param context 渲染上下文
   */
  private cleanup(context: RenderingContext): void {
    try {
      // 清理SVG增强器缓存
      this.svgEnhancer.clearCache()

      // 清理html2canvas处理上下文
      cleanupHtml2CanvasProcessing(context.canvas)

    } catch (error) {
      console.warn('清理渲染上下文时出错:', error)
    }
  }

  /**
   * 获取渲染器统计信息
   * @returns 统计信息
   */
  getStats(): { cacheStats: { snapshots: number; backups: number } } {
    return {
      cacheStats: this.svgEnhancer.getCacheStats()
    }
  }
}
