/**
 * 备用画布渲染器
 * 使用Canvas 2D API提供替代渲染方法，用于主渲染器失败时的回退
 */

import type { BackupRenderOptions } from '@/types/export'

/**
 * 备用画布渲染器类
 * 使用原生Canvas 2D API进行渲染
 */
export class BackupCanvasRenderer {
  private stats = {
    renderedElements: 0,
    failedElements: 0,
    renderTime: 0
  }

  /**
   * 使用备用方法渲染画布
   * @param canvas 画布元素
   * @param options 备用渲染选项
   * @returns 渲染的画布
   */
  async render(canvas: HTMLElement, options: BackupRenderOptions): Promise<HTMLCanvasElement> {
    const startTime = performance.now()
    this.stats.renderedElements = 0
    this.stats.failedElements = 0

    try {
      // 获取画布尺寸
      const rect = canvas.getBoundingClientRect()
      const width = Math.ceil(rect.width * options.scale)
      const height = Math.ceil(rect.height * options.scale)

      // 创建目标画布
      const targetCanvas = document.createElement('canvas')
      targetCanvas.width = width
      targetCanvas.height = height
      const ctx = targetCanvas.getContext('2d')

      if (!ctx) {
        throw new Error('无法创建Canvas 2D上下文')
      }

      // 设置背景
      if (options.backgroundColor && options.backgroundColor !== 'transparent') {
        ctx.fillStyle = options.backgroundColor
        ctx.fillRect(0, 0, width, height)
      }

      // 设置缩放
      ctx.scale(options.scale, options.scale)

      // 根据选项选择渲染方式
      if (options.elementByElement) {
        await this.renderElementByElement(canvas, ctx, options)
      } else {
        await this.renderAsWhole(canvas, ctx, options)
      }

      this.stats.renderTime = performance.now() - startTime
      return targetCanvas

    } catch (error) {
      this.stats.renderTime = performance.now() - startTime
      console.error('备用渲染器渲染失败:', error)
      throw error
    }
  }

  /**
   * 逐元素渲染
   * @param canvas 画布元素
   * @param ctx 2D上下文
   * @param options 渲染选项
   */
  private async renderElementByElement(
    canvas: HTMLElement,
    ctx: CanvasRenderingContext2D,
    options: BackupRenderOptions
  ): Promise<void> {
    // 获取所有可见元素
    const elements = this.getVisibleElements(canvas)

    for (const element of elements) {
      try {
        await this.renderSingleElement(element, ctx, options)
        this.stats.renderedElements++
      } catch (error) {
        console.warn('渲染单个元素失败:', element, error)
        this.stats.failedElements++
      }
    }
  }

  /**
   * 整体渲染
   * @param canvas 画布元素
   * @param ctx 2D上下文
   * @param options 渲染选项
   */
  private async renderAsWhole(
    canvas: HTMLElement,
    ctx: CanvasRenderingContext2D,
    options: BackupRenderOptions
  ): Promise<void> {
    try {
      // 尝试使用简化的方法渲染整个画布
      await this.renderCanvasContent(canvas, ctx, options)
      this.stats.renderedElements = 1
    } catch (error) {
      console.warn('整体渲染失败，回退到逐元素渲染:', error)
      await this.renderElementByElement(canvas, ctx, options)
    }
  }

  /**
   * 渲染画布内容
   * @param canvas 画布元素
   * @param ctx 2D上下文
   * @param options 渲染选项
   */
  private async renderCanvasContent(
    canvas: HTMLElement,
    ctx: CanvasRenderingContext2D,
    options: BackupRenderOptions
  ): Promise<void> {
    // 获取画布的计算样式
    const computedStyle = window.getComputedStyle(canvas)

    // 设置基本样式
    ctx.fillStyle = computedStyle.backgroundColor || 'transparent'
    ctx.strokeStyle = computedStyle.borderColor || '#000000'

    // 渲染背景
    if (computedStyle.backgroundColor && computedStyle.backgroundColor !== 'transparent') {
      const rect = canvas.getBoundingClientRect()
      ctx.fillRect(0, 0, rect.width, rect.height)
    }

    // 查找并渲染SVG元素
    const svgElements = canvas.querySelectorAll('svg')
    for (const svgElement of svgElements) {
      await this.renderSVGElement(svgElement as SVGSVGElement, ctx, options)
    }

    // 查找并渲染路径元素
    const pathElements = canvas.querySelectorAll('path')
    for (const pathElement of pathElements) {
      await this.renderPathElement(pathElement as SVGPathElement, ctx, options)
    }
  }

  /**
   * 渲染单个元素
   * @param element 元素
   * @param ctx 2D上下文
   * @param options 渲染选项
   */
  private async renderSingleElement(
    element: Element,
    ctx: CanvasRenderingContext2D,
    options: BackupRenderOptions
  ): Promise<void> {
    const tagName = element.tagName.toLowerCase()

    switch (tagName) {
      case 'svg':
        await this.renderSVGElement(element as SVGSVGElement, ctx, options)
        break
      case 'path':
        await this.renderPathElement(element as SVGPathElement, ctx, options)
        break
      case 'circle':
        await this.renderCircleElement(element as SVGCircleElement, ctx, options)
        break
      case 'rect':
        await this.renderRectElement(element as SVGRectElement, ctx, options)
        break
      case 'line':
        await this.renderLineElement(element as SVGLineElement, ctx, options)
        break
      default:
        // 对于其他元素，尝试通用渲染
        await this.renderGenericElement(element, ctx, options)
        break
    }
  }

  /**
   * 渲染SVG元素
   * @param svgElement SVG元素
   * @param ctx 2D上下文
   * @param options 渲染选项
   */
  private async renderSVGElement(
    svgElement: SVGSVGElement,
    ctx: CanvasRenderingContext2D,
    options: BackupRenderOptions
  ): Promise<void> {
    const rect = svgElement.getBoundingClientRect()

    // 保存上下文状态
    ctx.save()

    try {
      // 设置变换
      ctx.translate(rect.x, rect.y)

      // 渲染SVG的子元素
      const children = svgElement.children
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (child instanceof SVGElement) {
          await this.renderSingleElement(child, ctx, options)
        }
      }

    } finally {
      // 恢复上下文状态
      ctx.restore()
    }
  }

  /**
   * 渲染路径元素
   * @param pathElement 路径元素
   * @param ctx 2D上下文
   * @param options 渲染选项
   */
  private async renderPathElement(
    pathElement: SVGPathElement,
    ctx: CanvasRenderingContext2D,
    options: BackupRenderOptions
  ): Promise<void> {
    const pathData = pathElement.getAttribute('d')
    if (!pathData) return

    const computedStyle = window.getComputedStyle(pathElement)

    // 保存上下文状态
    ctx.save()

    try {
      // 设置样式
      this.applyElementStyles(ctx, computedStyle)

      // 创建路径
      const path2D = new Path2D(pathData)

      // 绘制路径
      if (computedStyle.fill && computedStyle.fill !== 'none') {
        ctx.fill(path2D)
      }

      if (computedStyle.stroke && computedStyle.stroke !== 'none') {
        ctx.stroke(path2D)
      }

    } catch (error) {
      console.warn('渲染路径元素失败:', error)

      // 回退到简化渲染
      if (options.simplifyPaths) {
        await this.renderSimplifiedPath(pathElement, ctx, computedStyle)
      }
    } finally {
      // 恢复上下文状态
      ctx.restore()
    }
  }

  /**
   * 渲染圆形元素
   * @param circleElement 圆形元素
   * @param ctx 2D上下文
   * @param options 渲染选项
   */
  private async renderCircleElement(
    circleElement: SVGCircleElement,
    ctx: CanvasRenderingContext2D,
    options: BackupRenderOptions
  ): Promise<void> {
    const cx = parseFloat(circleElement.getAttribute('cx') || '0')
    const cy = parseFloat(circleElement.getAttribute('cy') || '0')
    const r = parseFloat(circleElement.getAttribute('r') || '0')

    if (r <= 0) return

    const computedStyle = window.getComputedStyle(circleElement)

    ctx.save()

    try {
      this.applyElementStyles(ctx, computedStyle)

      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, 2 * Math.PI)

      if (computedStyle.fill && computedStyle.fill !== 'none') {
        ctx.fill()
      }

      if (computedStyle.stroke && computedStyle.stroke !== 'none') {
        ctx.stroke()
      }

    } finally {
      ctx.restore()
    }
  }

  /**
   * 渲染矩形元素
   * @param rectElement 矩形元素
   * @param ctx 2D上下文
   * @param options 渲染选项
   */
  private async renderRectElement(
    rectElement: SVGRectElement,
    ctx: CanvasRenderingContext2D,
    options: BackupRenderOptions
  ): Promise<void> {
    const x = parseFloat(rectElement.getAttribute('x') || '0')
    const y = parseFloat(rectElement.getAttribute('y') || '0')
    const width = parseFloat(rectElement.getAttribute('width') || '0')
    const height = parseFloat(rectElement.getAttribute('height') || '0')

    if (width <= 0 || height <= 0) return

    const computedStyle = window.getComputedStyle(rectElement)

    ctx.save()

    try {
      this.applyElementStyles(ctx, computedStyle)

      if (computedStyle.fill && computedStyle.fill !== 'none') {
        ctx.fillRect(x, y, width, height)
      }

      if (computedStyle.stroke && computedStyle.stroke !== 'none') {
        ctx.strokeRect(x, y, width, height)
      }

    } finally {
      ctx.restore()
    }
  }

  /**
   * 渲染线条元素
   * @param lineElement 线条元素
   * @param ctx 2D上下文
   * @param options 渲染选项
   */
  private async renderLineElement(
    lineElement: SVGLineElement,
    ctx: CanvasRenderingContext2D,
    options: BackupRenderOptions
  ): Promise<void> {
    const x1 = parseFloat(lineElement.getAttribute('x1') || '0')
    const y1 = parseFloat(lineElement.getAttribute('y1') || '0')
    const x2 = parseFloat(lineElement.getAttribute('x2') || '0')
    const y2 = parseFloat(lineElement.getAttribute('y2') || '0')

    const computedStyle = window.getComputedStyle(lineElement)

    ctx.save()

    try {
      this.applyElementStyles(ctx, computedStyle)

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)

      if (computedStyle.stroke && computedStyle.stroke !== 'none') {
        ctx.stroke()
      }

    } finally {
      ctx.restore()
    }
  }

  /**
   * 渲染通用元素
   * @param element 元素
   * @param ctx 2D上下文
   * @param options 渲染选项
   */
  private async renderGenericElement(
    element: Element,
    ctx: CanvasRenderingContext2D,
    options: BackupRenderOptions
  ): Promise<void> {
    // 对于不支持的元素类型，尝试基本的矩形渲染
    const rect = element.getBoundingClientRect()
    const computedStyle = window.getComputedStyle(element)

    if (rect.width > 0 && rect.height > 0) {
      ctx.save()

      try {
        this.applyElementStyles(ctx, computedStyle)

        if (computedStyle.backgroundColor && computedStyle.backgroundColor !== 'transparent') {
          ctx.fillStyle = computedStyle.backgroundColor
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
        }

        if (computedStyle.borderColor && computedStyle.borderWidth && computedStyle.borderWidth !== '0px') {
          ctx.strokeStyle = computedStyle.borderColor
          ctx.lineWidth = parseFloat(computedStyle.borderWidth)
          ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
        }

      } finally {
        ctx.restore()
      }
    }
  }

  /**
   * 渲染简化路径
   * @param pathElement 路径元素
   * @param ctx 2D上下文
   * @param computedStyle 计算样式
   */
  private async renderSimplifiedPath(
    pathElement: SVGPathElement,
    ctx: CanvasRenderingContext2D,
    computedStyle: CSSStyleDeclaration
  ): Promise<void> {
    // 获取路径边界框作为简化渲染
    const bbox = pathElement.getBBox()

    if (bbox.width > 0 && bbox.height > 0) {
      if (computedStyle.fill && computedStyle.fill !== 'none') {
        ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height)
      }

      if (computedStyle.stroke && computedStyle.stroke !== 'none') {
        ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height)
      }
    }
  }

  /**
   * 应用元素样式到上下文
   * @param ctx 2D上下文
   * @param computedStyle 计算样式
   */
  private applyElementStyles(ctx: CanvasRenderingContext2D, computedStyle: CSSStyleDeclaration): void {
    // 设置填充样式
    if (computedStyle.fill && computedStyle.fill !== 'none') {
      ctx.fillStyle = computedStyle.fill
    }

    // 设置描边样式
    if (computedStyle.stroke && computedStyle.stroke !== 'none') {
      ctx.strokeStyle = computedStyle.stroke
    }

    // 设置线宽
    if (computedStyle.strokeWidth) {
      ctx.lineWidth = parseFloat(computedStyle.strokeWidth) || 1
    }

    // 设置透明度
    if (computedStyle.opacity) {
      ctx.globalAlpha = parseFloat(computedStyle.opacity) || 1
    }

    // 设置线条样式
    if (computedStyle.strokeLinecap) {
      ctx.lineCap = computedStyle.strokeLinecap as CanvasLineCap
    }

    if (computedStyle.strokeLinejoin) {
      ctx.lineJoin = computedStyle.strokeLinejoin as CanvasLineJoin
    }

    // 设置虚线样式
    if (computedStyle.strokeDasharray && computedStyle.strokeDasharray !== 'none') {
      const dashArray = computedStyle.strokeDasharray
        .split(',')
        .map(s => parseFloat(s.trim()))
        .filter(n => !isNaN(n))

      if (dashArray.length > 0) {
        ctx.setLineDash(dashArray)
      }
    }
  }

  /**
   * 获取可见元素
   * @param container 容器元素
   * @returns 可见元素数组
   */
  private getVisibleElements(container: HTMLElement): Element[] {
    const elements: Element[] = []
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          const element = node as Element
          const computedStyle = window.getComputedStyle(element)

          // 过滤不可见元素
          if (computedStyle.display === 'none' ||
              computedStyle.visibility === 'hidden' ||
              computedStyle.opacity === '0') {
            return NodeFilter.FILTER_REJECT
          }

          return NodeFilter.FILTER_ACCEPT
        }
      }
    )

    let node: Node | null
    while (node = walker.nextNode()) {
      elements.push(node as Element)
    }

    return elements
  }

  /**
   * 获取渲染器统计信息
   * @returns 统计信息
   */
  getStats() {
    return { ...this.stats }
  }

  /**
   * 清理渲染器资源
   */
  cleanup(): void {
    // 重置统计信息
    this.stats = {
      renderedElements: 0,
      failedElements: 0,
      renderTime: 0
    }
  }
}

// 创建全局备用画布渲染器实例
export const backupCanvasRenderer = new BackupCanvasRenderer()

// 导出类型和实例
export default BackupCanvasRenderer
