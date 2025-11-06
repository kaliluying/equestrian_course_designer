/**
 * 增强的html2canvas配置模块
 * 专门优化SVG元素的处理和导出
 */

import html2canvas from 'html2canvas'
import { convertSVGStyles, restoreSVGStyles, type StyleConversionResult } from './svgStyleInlineConverter'

// html2canvas增强配置选项接口
export interface EnhancedHtml2CanvasOptions {
  // 基础选项
  backgroundColor?: string
  scale?: number
  quality?: number
  width?: number
  height?: number
  x?: number
  y?: number

  // SVG特定选项
  svgRenderingMode?: 'enhanced' | 'fallback' | 'hybrid'
  forceInlineStyles?: boolean
  preserveSVGViewBox?: boolean
  enhanceSVGVisibility?: boolean

  // 调试选项
  enableDebugMode?: boolean
  logSVGProcessing?: boolean
}

// SVG处理上下文接口
interface SVGProcessingContext {
  originalCanvas: HTMLElement
  clonedCanvas: HTMLElement
  styleConversionResults: StyleConversionResult[]
  svgElements: SVGElement[]
  processingStartTime: number
}

/**
 * 增强的html2canvas配置管理器
 */
export class EnhancedHtml2CanvasConfig {
  private debugMode = false
  private processingContexts = new Map<HTMLElement, SVGProcessingContext>()

  /**
   * 创建增强的html2canvas配置
   * @param canvas 要导出的画布元素
   * @param options 增强配置选项
   * @returns html2canvas配置对象
   */
  createEnhancedConfig(
    canvas: HTMLElement,
    options: EnhancedHtml2CanvasOptions = {}
  ): Parameters<typeof html2canvas>[1] {
    const {
      backgroundColor = '#ffffff',
      scale = 3,
      quality = 1.0,
      width,
      height,
      x = 0,
      y = 0,
      svgRenderingMode = 'enhanced',
      forceInlineStyles = true,
      preserveSVGViewBox = true,
      enhanceSVGVisibility = true,
      enableDebugMode = false,
      logSVGProcessing = false
    } = options

    this.debugMode = enableDebugMode

    // 获取画布原始尺寸
    const canvasRect = canvas.getBoundingClientRect()
    const canvasWidth = width || canvasRect.width
    const canvasHeight = height || canvasRect.height

    if (this.debugMode) {
      console.log('创建增强html2canvas配置:', {
        canvasWidth,
        canvasHeight,
        svgRenderingMode,
        forceInlineStyles,
        preserveSVGViewBox
      })
    }

    return {
      backgroundColor,
      scale,
      useCORS: true,
      allowTaint: true,
      width: canvasWidth,
      height: canvasHeight,
      scrollX: 0,
      scrollY: 0,
      x: x,
      y: y,
      windowWidth: Math.max(
        document.documentElement.clientWidth,
        window.innerWidth,
        canvasWidth * 2
      ),
      windowHeight: Math.max(
        document.documentElement.clientHeight,
        window.innerHeight,
        canvasHeight * 2
      ),
      foreignObjectRendering: svgRenderingMode === 'enhanced' || svgRenderingMode === 'hybrid',
      logging: logSVGProcessing,

      // 增强的onclone回调处理SVG元素
      onclone: (documentClone: Document) => {
        return this.handleSVGCloneProcessing(
          documentClone,
          canvas,
          {
            svgRenderingMode,
            forceInlineStyles,
            preserveSVGViewBox,
            enhanceSVGVisibility,
            logSVGProcessing
          }
        )
      },

      // SVG元素的特殊ignoreElements逻辑
      ignoreElements: (element: Element) => {
        return this.shouldIgnoreElement(element, svgRenderingMode)
      }
    }
  }

  /**
   * 处理DOM克隆过程中的SVG元素增强
   * @param documentClone 克隆的文档
   * @param originalCanvas 原始画布元素
   * @param options 处理选项
   * @returns 处理后的文档
   */
  private handleSVGCloneProcessing(
    documentClone: Document,
    originalCanvas: HTMLElement,
    options: {
      svgRenderingMode: string
      forceInlineStyles: boolean
      preserveSVGViewBox: boolean
      enhanceSVGVisibility: boolean
      logSVGProcessing: boolean
    }
  ): Document {
    const processingStartTime = performance.now()

    if (options.logSVGProcessing) {
      console.log('开始SVG克隆处理...')
    }

    // 找到克隆的画布元素
    const clonedCanvas = documentClone.querySelector('.course-canvas') as HTMLElement
    if (!clonedCanvas) {
      console.warn('未找到克隆的画布元素')
      return documentClone
    }

    // 优化克隆画布的基础样式
    this.optimizeClonedCanvasStyles(clonedCanvas, originalCanvas)

    // 处理SVG元素
    const svgElements = Array.from(clonedCanvas.querySelectorAll('svg')) as SVGElement[]

    if (options.logSVGProcessing) {
      console.log(`找到 ${svgElements.length} 个SVG元素`)
    }

    // 创建处理上下文
    const context: SVGProcessingContext = {
      originalCanvas,
      clonedCanvas,
      styleConversionResults: [],
      svgElements,
      processingStartTime
    }

    // 根据渲染模式处理SVG元素
    switch (options.svgRenderingMode) {
      case 'enhanced':
        this.processEnhancedSVGRendering(context, options)
        break
      case 'fallback':
        this.processFallbackSVGRendering(context, options)
        break
      case 'hybrid':
        this.processHybridSVGRendering(context, options)
        break
    }

    // 保存处理上下文以便后续恢复
    this.processingContexts.set(originalCanvas, context)

    if (options.logSVGProcessing) {
      const processingTime = performance.now() - processingStartTime
      console.log(`SVG克隆处理完成，耗时: ${processingTime.toFixed(2)}ms`)
    }

    return documentClone
  }

  /**
   * 优化克隆画布的基础样式
   * @param clonedCanvas 克隆的画布元素
   * @param originalCanvas 原始画布元素
   */
  private optimizeClonedCanvasStyles(clonedCanvas: HTMLElement, originalCanvas: HTMLElement): void {
    const originalRect = originalCanvas.getBoundingClientRect()

    // 确保克隆的画布没有被截断或限制
    clonedCanvas.style.width = `${originalRect.width}px`
    clonedCanvas.style.height = `${originalRect.height}px`
    clonedCanvas.style.maxWidth = 'none'
    clonedCanvas.style.maxHeight = 'none'
    clonedCanvas.style.overflow = 'visible'
    clonedCanvas.style.position = 'absolute'
    clonedCanvas.style.padding = '30px' // 增加内边距确保边缘内容可见
    clonedCanvas.style.margin = '0'
    clonedCanvas.style.transformOrigin = 'top left'
    clonedCanvas.style.boxSizing = 'content-box'

    // 处理克隆画布中的所有嵌套元素
    const allElements = clonedCanvas.querySelectorAll('*')
    allElements.forEach((element) => {
      const el = element as HTMLElement

      // 避免fixed定位导致元素丢失
      if (el.style.position === 'fixed') {
        el.style.position = 'absolute'
      }

      // 确保元素不被overflow截断
      if (getComputedStyle(el).overflow !== 'visible') {
        el.style.overflow = 'visible'
      }
    })
  }

  /**
   * 处理增强模式的SVG渲染
   * @param context 处理上下文
   * @param options 处理选项
   */
  private processEnhancedSVGRendering(
    context: SVGProcessingContext,
    options: { forceInlineStyles: boolean; preserveSVGViewBox: boolean; enhanceSVGVisibility: boolean; logSVGProcessing: boolean }
  ): void {
    if (options.logSVGProcessing) {
      console.log('使用增强模式处理SVG元素')
    }

    // 使用样式内联转换系统
    if (options.forceInlineStyles) {
      try {
        context.styleConversionResults = convertSVGStyles(context.clonedCanvas)

        if (options.logSVGProcessing) {
          console.log(`样式转换完成，处理了 ${context.styleConversionResults.length} 个元素`)
        }
      } catch (error) {
        console.warn('SVG样式转换失败，使用回退方案:', error)
        this.processFallbackSVGRendering(context, options)
        return
      }
    }

    // 处理每个SVG元素
    context.svgElements.forEach((svg, index) => {
      this.enhanceSVGElement(svg, options, index)
    })
  }

  /**
   * 处理回退模式的SVG渲染
   * @param context 处理上下文
   * @param options 处理选项
   */
  private processFallbackSVGRendering(
    context: SVGProcessingContext,
    options: { enhanceSVGVisibility: boolean; logSVGProcessing: boolean }
  ): void {
    if (options.logSVGProcessing) {
      console.log('使用回退模式处理SVG元素')
    }

    context.svgElements.forEach((svg, index) => {
      this.applySVGFallbackStyles(svg, index)
    })
  }

  /**
   * 处理混合模式的SVG渲染
   * @param context 处理上下文
   * @param options 处理选项
   */
  private processHybridSVGRendering(
    context: SVGProcessingContext,
    options: { forceInlineStyles: boolean; preserveSVGViewBox: boolean; enhanceSVGVisibility: boolean; logSVGProcessing: boolean }
  ): void {
    if (options.logSVGProcessing) {
      console.log('使用混合模式处理SVG元素')
    }

    // 先尝试增强模式
    try {
      this.processEnhancedSVGRendering(context, options)
    } catch (error) {
      console.warn('增强模式失败，切换到回退模式:', error)
      this.processFallbackSVGRendering(context, options)
    }
  }

  /**
   * 增强单个SVG元素
   * @param svg SVG元素
   * @param options 处理选项
   * @param index 元素索引
   */
  private enhanceSVGElement(
    svg: SVGElement,
    options: { preserveSVGViewBox: boolean; enhanceSVGVisibility: boolean },
    index: number
  ): void {
    // 确保SVG可见
    if (options.enhanceSVGVisibility) {
      svg.style.display = 'block'
      svg.style.visibility = 'visible'
      svg.style.opacity = '1'
    }

    // 确保SVG有正确的尺寸属性
    const rect = svg.getBoundingClientRect()
    if (!svg.getAttribute('width') && rect.width > 0) {
      svg.setAttribute('width', rect.width.toString())
    }
    if (!svg.getAttribute('height') && rect.height > 0) {
      svg.setAttribute('height', rect.height.toString())
    }

    // 确保SVG有正确的viewBox
    if (options.preserveSVGViewBox && !svg.getAttribute('viewBox') && rect.width > 0 && rect.height > 0) {
      svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`)
    }

    // 处理SVG内的所有元素，确保它们可见
    const allSVGElements = svg.querySelectorAll('*')
    allSVGElements.forEach((element) => {
      const el = element as SVGElement

      if (options.enhanceSVGVisibility) {
        el.style.display = 'block'
        el.style.visibility = 'visible'
        el.style.opacity = '1'
      }

      // 确保关键样式属性已内联
      this.ensureSVGElementStyles(el)
    })

    if (this.debugMode) {
      console.log(`增强SVG元素 ${index + 1}:`, {
        width: svg.getAttribute('width'),
        height: svg.getAttribute('height'),
        viewBox: svg.getAttribute('viewBox'),
        childElements: allSVGElements.length
      })
    }
  }

  /**
   * 应用SVG回退样式
   * @param svg SVG元素
   * @param index 元素索引
   */
  private applySVGFallbackStyles(svg: SVGElement, index: number): void {
    // 基础可见性设置
    svg.style.display = 'block'
    svg.style.visibility = 'visible'
    svg.style.opacity = '1'

    // 处理SVG内部元素
    const allSVGElements = svg.querySelectorAll('*')
    allSVGElements.forEach((element) => {
      const el = element as SVGElement
      el.style.display = 'block'
      el.style.visibility = 'visible'
      el.style.opacity = '1'

      // 应用基础样式
      this.applySVGElementFallbackStyles(el)
    })

    if (this.debugMode) {
      console.log(`应用回退样式到SVG元素 ${index + 1}`)
    }
  }

  /**
   * 确保SVG元素的关键样式
   * @param element SVG元素
   */
  private ensureSVGElementStyles(element: SVGElement): void {
    const tagName = element.tagName.toLowerCase()

    if (tagName === 'path') {
      if (!element.getAttribute('stroke') && !element.style.stroke) {
        element.setAttribute('stroke', '#3a6af8')
      }
      if (!element.getAttribute('stroke-width') && !element.style.strokeWidth) {
        element.setAttribute('stroke-width', '2')
      }
      if (!element.getAttribute('fill') && !element.style.fill) {
        element.setAttribute('fill', 'none')
      }
    } else if (tagName === 'circle') {
      if (!element.getAttribute('fill') && !element.style.fill &&
          !element.getAttribute('stroke') && !element.style.stroke) {
        element.setAttribute('fill', '#3a6af8')
      }
    } else if (tagName === 'line') {
      if (!element.getAttribute('stroke') && !element.style.stroke) {
        element.setAttribute('stroke', '#3a6af8')
      }
      if (!element.getAttribute('stroke-width') && !element.style.strokeWidth) {
        element.setAttribute('stroke-width', '1')
      }
    } else if (tagName === 'text') {
      if (!element.getAttribute('fill') && !element.style.fill) {
        element.setAttribute('fill', '#1a202c')
      }
    }
  }

  /**
   * 应用SVG元素的回退样式
   * @param element SVG元素
   */
  private applySVGElementFallbackStyles(element: SVGElement): void {
    const tagName = element.tagName.toLowerCase()

    // 应用基础的硬编码样式
    if (tagName === 'path') {
      element.setAttribute('stroke', '#3a6af8')
      element.setAttribute('stroke-width', '2')
      element.setAttribute('fill', 'none')
    } else if (tagName === 'circle') {
      element.setAttribute('fill', '#3a6af8')
    } else if (tagName === 'line') {
      element.setAttribute('stroke', '#3a6af8')
      element.setAttribute('stroke-width', '1')
    } else if (tagName === 'text') {
      element.setAttribute('fill', '#1a202c')
    }
  }

  /**
   * 判断是否应该忽略某个元素
   * @param element 要检查的元素
   * @param svgRenderingMode SVG渲染模式
   * @returns 是否应该忽略
   */
  private shouldIgnoreElement(element: Element, svgRenderingMode: string): boolean {
    // 永远不忽略SVG相关元素
    const svgTags = ['svg', 'path', 'circle', 'line', 'text', 'g', 'defs', 'use']
    if (svgTags.includes(element.tagName.toLowerCase())) {
      return false
    }

    // 忽略控制UI元素
    if (element.classList) {
      const controlClasses = [
        'control-point',
        'control-line',
        'rotation-handle',
        'el-button',
        'toolbar',
        'el-dropdown',
        'settings-panel'
      ]

      for (const className of controlClasses) {
        if (element.classList.contains(className)) {
          return true
        }
      }
    }

    // 忽略按钮元素
    if (element.tagName === 'BUTTON') {
      return true
    }

    return false
  }

  /**
   * 清理处理上下文
   * @param canvas 原始画布元素
   */
  cleanupProcessingContext(canvas: HTMLElement): void {
    const context = this.processingContexts.get(canvas)
    if (context && context.styleConversionResults.length > 0) {
      // 恢复原始样式
      restoreSVGStyles(context.styleConversionResults)
    }

    this.processingContexts.delete(canvas)
  }

  /**
   * 获取处理统计信息
   * @param canvas 画布元素
   * @returns 统计信息
   */
  getProcessingStats(canvas: HTMLElement): {
    svgElementsProcessed: number
    styleConversionsApplied: number
    processingTime: number
  } | null {
    const context = this.processingContexts.get(canvas)
    if (!context) {
      return null
    }

    return {
      svgElementsProcessed: context.svgElements.length,
      styleConversionsApplied: context.styleConversionResults.length,
      processingTime: performance.now() - context.processingStartTime
    }
  }
}

// 创建全局实例
export const enhancedHtml2CanvasConfig = new EnhancedHtml2CanvasConfig()

// 便捷函数
export function createEnhancedHtml2CanvasConfig(
  canvas: HTMLElement,
  options?: EnhancedHtml2CanvasOptions
): Parameters<typeof html2canvas>[1] {
  return enhancedHtml2CanvasConfig.createEnhancedConfig(canvas, options)
}

export function cleanupHtml2CanvasProcessing(canvas: HTMLElement): void {
  enhancedHtml2CanvasConfig.cleanupProcessingContext(canvas)
}
