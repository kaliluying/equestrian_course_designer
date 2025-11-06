/**
 * Canvas备用渲染器
 * 当html2canvas无法正确处理SVG元素时，使用Canvas API重绘SVG路径
 */

import { SVGToCanvasConverter, type SVGElementStyles } from './svgToCanvasConverter'

// Canvas渲染选项接口
export interface CanvasRenderOptions {
  backgroundColor?: string
  scale?: number
  quality?: number
  width?: number
  height?: number
  padding?: number
  enableDebugMode?: boolean
}

// SVG元素信息接口
export interface SVGElementInfo {
  element: SVGElement
  pathData: string
  styles: SVGElementStyles
  boundingBox: DOMRect
  transform?: string
}

// 渲染结果接口
export interface CanvasRenderResult {
  canvas: HTMLCanvasElement
  success: boolean
  renderedElements: number
  errors: string[]
  renderTime: number
}

/**
 * Canvas备用渲染器类
 */
export class CanvasFallbackRenderer {
  private converter: SVGToCanvasConverter
  private debugMode = false

  constructor(debugMode = false) {
    this.debugMode = debugMode
    this.converter = new SVGToCanvasConverter(debugMode)
  }

  /**
   * 渲染整个画布到Canvas
   * @param sourceCanvas 源画布元素
   * @param options 渲染选项
   * @returns 渲染结果
   */
  async renderCanvasToCanvas(
    sourceCanvas: HTMLElement,
    options: CanvasRenderOptions = {}
  ): Promise<CanvasRenderResult> {
    const startTime = performance.now()
    const errors: string[] = []

    try {
      // 获取源画布信息
      const sourceRect = sourceCanvas.getBoundingClientRect()
      const {
        backgroundColor = '#ffffff',
        scale = 2,
        quality = 1.0,
        width = sourceRect.width,
        height = sourceRect.height,
        padding = 20
      } = options

      // 创建目标Canvas
      const targetCanvas = document.createElement('canvas')
      const finalWidth = Math.round((width + padding * 2) * scale)
      const finalHeight = Math.round((height + padding * 2) * scale)

      targetCanvas.width = finalWidth
      targetCanvas.height = finalHeight

      const ctx = targetCanvas.getContext('2d')
      if (!ctx) {
        throw new Error('无法获取Canvas 2D上下文')
      }

      // 设置高质量渲染
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      // 应用缩放
      ctx.scale(scale, scale)
      ctx.translate(padding, padding)

      // 填充背景
      ctx.fillStyle = backgroundColor
      ctx.fillRect(-padding, -padding, width + padding * 2, height + padding * 2)

      if (this.debugMode) {
        console.log('开始Canvas备用渲染:', {
          sourceSize: { width: sourceRect.width, height: sourceRect.height },
          targetSize: { width: finalWidth, height: finalHeight },
          scale,
          padding
        })
      }

      // 提取并渲染SVG元素
      const svgElements = this.extractSVGElements(sourceCanvas)
      let renderedCount = 0

      for (const svgInfo of svgElements) {
        try {
          const success = await this.renderSVGElement(ctx, svgInfo, sourceCanvas)
          if (success) {
            renderedCount++
          } else {
            errors.push(`渲染SVG元素失败: ${svgInfo.element.tagName}`)
          }
        } catch (error) {
          const errorMsg = `渲染SVG元素异常: ${error instanceof Error ? error.message : String(error)}`
          errors.push(errorMsg)
          console.warn(errorMsg, svgInfo.element)
        }
      }

      // 渲染非SVG内容（如障碍物图片等）
      await this.renderNonSVGContent(ctx, sourceCanvas, { width, height })

      const renderTime = performance.now() - startTime

      if (this.debugMode) {
        console.log('Canvas备用渲染完成:', {
          renderedElements: renderedCount,
          totalSVGElements: svgElements.length,
          errors: errors.length,
          renderTime: `${renderTime.toFixed(2)}ms`
        })
      }

      return {
        canvas: targetCanvas,
        success: errors.length === 0,
        renderedElements: renderedCount,
        errors,
        renderTime
      }
    } catch (error) {
      const errorMsg = `Canvas备用渲染失败: ${error instanceof Error ? error.message : String(error)}`
      errors.push(errorMsg)
      console.error(errorMsg)

      return {
        canvas: document.createElement('canvas'),
        success: false,
        renderedElements: 0,
        errors,
        renderTime: performance.now() - startTime
      }
    }
  }

  /**
   * 提取画布中的SVG元素信息
   * @param canvas 画布元素
   * @returns SVG元素信息数组
   */
  private extractSVGElements(canvas: HTMLElement): SVGElementInfo[] {
    const svgElements: SVGElementInfo[] = []

    // 查找所有SVG元素
    const svgs = canvas.querySelectorAll('svg')

    svgs.forEach(svg => {
      if (!(svg instanceof SVGElement)) return

      // 获取SVG根元素信息
      const rootInfo = this.extractSVGElementInfo(svg)
      if (rootInfo) {
        svgElements.push(rootInfo)
      }

      // 获取SVG内部的路径元素
      const paths = svg.querySelectorAll('path, circle, line, rect, ellipse, polygon, polyline')
      paths.forEach(pathElement => {
        if (pathElement instanceof SVGElement) {
          const pathInfo = this.extractSVGElementInfo(pathElement)
          if (pathInfo) {
            svgElements.push(pathInfo)
          }
        }
      })
    })

    if (this.debugMode) {
      console.log(`提取到 ${svgElements.length} 个SVG元素`)
    }

    return svgElements
  }

  /**
   * 提取单个SVG元素的信息
   * @param element SVG元素
   * @returns SVG元素信息
   */
  private extractSVGElementInfo(element: SVGElement): SVGElementInfo | null {
    try {
      const computedStyle = window.getComputedStyle(element)
      const boundingBox = element.getBoundingClientRect()

      // 获取路径数据
      let pathData = ''
      const tagName = element.tagName.toLowerCase()

      switch (tagName) {
        case 'path':
          pathData = (element as SVGPathElement).getAttribute('d') || ''
          break
        case 'circle':
          pathData = this.convertCircleToPath(element as SVGCircleElement)
          break
        case 'line':
          pathData = this.convertLineToPath(element as SVGLineElement)
          break
        case 'rect':
          pathData = this.convertRectToPath(element as SVGRectElement)
          break
        case 'ellipse':
          pathData = this.convertEllipseToPath(element as SVGEllipseElement)
          break
        case 'polygon':
          pathData = this.convertPolygonToPath(element as SVGPolygonElement)
          break
        case 'polyline':
          pathData = this.convertPolylineToPath(element as SVGPolylineElement)
          break
        default:
          // 对于SVG根元素，查找内部路径
          const internalPaths = element.querySelectorAll('path')
          if (internalPaths.length > 0) {
            pathData = Array.from(internalPaths)
              .map(path => path.getAttribute('d') || '')
              .filter(d => d)
              .join(' ')
          }
      }

      if (!pathData) {
        return null
      }

      // 提取样式信息
      const styles: SVGElementStyles = {
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

      return {
        element,
        pathData,
        styles,
        boundingBox,
        transform: styles.transform
      }
    } catch (error) {
      console.warn('提取SVG元素信息失败:', error, element)
      return null
    }
  }

  /**
   * 获取样式值
   * @param element SVG元素
   * @param computedStyle 计算样式
   * @param property 样式属性
   * @returns 样式值
   */
  private getStyleValue(element: SVGElement, computedStyle: CSSStyleDeclaration, property: string): string | undefined {
    // 优先使用属性值
    const attrValue = element.getAttribute(property)
    if (attrValue && attrValue !== 'none') {
      return attrValue
    }

    // 然后使用内联样式
    const inlineValue = element.style.getPropertyValue(property)
    if (inlineValue && inlineValue !== 'none') {
      return inlineValue
    }

    // 最后使用计算样式
    const computedValue = computedStyle.getPropertyValue(property)
    if (computedValue && computedValue !== 'none' && computedValue !== 'auto') {
      return computedValue
    }

    return undefined
  }

  /**
   * 获取数值样式值
   * @param element SVG元素
   * @param computedStyle 计算样式
   * @param property 样式属性
   * @returns 数值
   */
  private getNumericStyleValue(element: SVGElement, computedStyle: CSSStyleDeclaration, property: string): number | undefined {
    const value = this.getStyleValue(element, computedStyle, property)
    if (value) {
      const numValue = parseFloat(value)
      return isNaN(numValue) ? undefined : numValue
    }
    return undefined
  }

  /**
   * 获取虚线数组
   * @param element SVG元素
   * @param computedStyle 计算样式
   * @returns 虚线数组
   */
  private getStrokeDashArray(element: SVGElement, computedStyle: CSSStyleDeclaration): number[] | undefined {
    const value = this.getStyleValue(element, computedStyle, 'stroke-dasharray')
    if (value && value !== 'none') {
      return value.split(/[,\s]+/)
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v))
    }
    return undefined
  }

  /**
   * 将圆形转换为路径
   * @param circle 圆形元素
   * @returns 路径数据
   */
  private convertCircleToPath(circle: SVGCircleElement): string {
    const cx = parseFloat(circle.getAttribute('cx') || '0')
    const cy = parseFloat(circle.getAttribute('cy') || '0')
    const r = parseFloat(circle.getAttribute('r') || '0')

    if (r <= 0) return ''

    // 使用两个半圆弧创建完整圆形
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
  }

  /**
   * 将直线转换为路径
   * @param line 直线元素
   * @returns 路径数据
   */
  private convertLineToPath(line: SVGLineElement): string {
    const x1 = parseFloat(line.getAttribute('x1') || '0')
    const y1 = parseFloat(line.getAttribute('y1') || '0')
    const x2 = parseFloat(line.getAttribute('x2') || '0')
    const y2 = parseFloat(line.getAttribute('y2') || '0')

    return `M ${x1} ${y1} L ${x2} ${y2}`
  }

  /**
   * 将矩形转换为路径
   * @param rect 矩形元素
   * @returns 路径数据
   */
  private convertRectToPath(rect: SVGRectElement): string {
    const x = parseFloat(rect.getAttribute('x') || '0')
    const y = parseFloat(rect.getAttribute('y') || '0')
    const width = parseFloat(rect.getAttribute('width') || '0')
    const height = parseFloat(rect.getAttribute('height') || '0')

    if (width <= 0 || height <= 0) return ''

    return `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`
  }

  /**
   * 将椭圆转换为路径
   * @param ellipse 椭圆元素
   * @returns 路径数据
   */
  private convertEllipseToPath(ellipse: SVGEllipseElement): string {
    const cx = parseFloat(ellipse.getAttribute('cx') || '0')
    const cy = parseFloat(ellipse.getAttribute('cy') || '0')
    const rx = parseFloat(ellipse.getAttribute('rx') || '0')
    const ry = parseFloat(ellipse.getAttribute('ry') || '0')

    if (rx <= 0 || ry <= 0) return ''

    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`
  }

  /**
   * 将多边形转换为路径
   * @param polygon 多边形元素
   * @returns 路径数据
   */
  private convertPolygonToPath(polygon: SVGPolygonElement): string {
    const points = polygon.getAttribute('points')
    if (!points) return ''

    const coords = points.trim().split(/[\s,]+/)
    if (coords.length < 4) return '' // 至少需要2个点

    let path = ''
    for (let i = 0; i < coords.length; i += 2) {
      const x = parseFloat(coords[i])
      const y = parseFloat(coords[i + 1])

      if (isNaN(x) || isNaN(y)) continue

      if (i === 0) {
        path += `M ${x} ${y}`
      } else {
        path += ` L ${x} ${y}`
      }
    }

    return path + ' Z'
  }

  /**
   * 将折线转换为路径
   * @param polyline 折线元素
   * @returns 路径数据
   */
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

      if (i === 0) {
        path += `M ${x} ${y}`
      } else {
        path += ` L ${x} ${y}`
      }
    }

    return path
  }

  /**
   * 渲染单个SVG元素到Canvas
   * @param ctx Canvas 2D上下文
   * @param svgInfo SVG元素信息
   * @param sourceCanvas 源画布（用于坐标转换）
   * @returns 是否成功渲染
   */
  private async renderSVGElement(
    ctx: CanvasRenderingContext2D,
    svgInfo: SVGElementInfo,
    sourceCanvas: HTMLElement
  ): Promise<boolean> {
    try {
      // 保存Canvas状态
      ctx.save()

      // 计算元素相对于源画布的位置
      const sourceRect = sourceCanvas.getBoundingClientRect()
      const elementRect = svgInfo.boundingBox

      const relativeX = elementRect.left - sourceRect.left
      const relativeY = elementRect.top - sourceRect.top

      // 应用位置偏移
      ctx.translate(relativeX, relativeY)

      // 应用元素变换
      if (svgInfo.transform && svgInfo.transform !== 'none') {
        this.applyTransformToContext(ctx, svgInfo.transform)
      }

      // 使用转换器渲染路径
      const success = this.converter.renderSVGPathToCanvas(
        svgInfo.pathData,
        ctx,
        svgInfo.styles
      )

      // 恢复Canvas状态
      ctx.restore()

      if (this.debugMode && success) {
        console.log('成功渲染SVG元素:', {
          tagName: svgInfo.element.tagName,
          pathLength: svgInfo.pathData.length,
          position: { x: relativeX, y: relativeY },
          styles: svgInfo.styles
        })
      }

      return success
    } catch (error) {
      ctx.restore() // 确保状态恢复
      console.warn('渲染SVG元素失败:', error, svgInfo)
      return false
    }
  }

  /**
   * 应用变换到Canvas上下文
   * @param ctx Canvas 2D上下文
   * @param transform 变换字符串
   */
  private applyTransformToContext(ctx: CanvasRenderingContext2D, transform: string): void {
    if (transform === 'none' || !transform) return

    // 解析matrix变换
    const matrixMatch = transform.match(/matrix\(([^)]+)\)/)
    if (matrixMatch) {
      const values = matrixMatch[1].split(/[,\s]+/).map(v => parseFloat(v))
      if (values.length === 6) {
        ctx.transform(values[0], values[1], values[2], values[3], values[4], values[5])
        return
      }
    }

    // 解析其他变换（translate、scale、rotate等）
    const transformRegex = /(translate|scale|rotate|skewX|skewY)\s*\(\s*([^)]+)\s*\)/g
    let match

    while ((match = transformRegex.exec(transform)) !== null) {
      const [, type, params] = match
      const values = params.split(/[,\s]+/).map(v => parseFloat(v)).filter(v => !isNaN(v))

      switch (type) {
        case 'translate':
          if (values.length >= 2) {
            ctx.translate(values[0], values[1])
          } else if (values.length === 1) {
            ctx.translate(values[0], 0)
          }
          break
        case 'scale':
          if (values.length >= 2) {
            ctx.scale(values[0], values[1])
          } else if (values.length === 1) {
            ctx.scale(values[0], values[0])
          }
          break
        case 'rotate':
          if (values.length >= 1) {
            const angle = values[0] * Math.PI / 180
            if (values.length >= 3) {
              // 围绕指定点旋转
              ctx.translate(values[1], values[2])
              ctx.rotate(angle)
              ctx.translate(-values[1], -values[2])
            } else {
              ctx.rotate(angle)
            }
          }
          break
      }
    }
  }

  /**
   * 渲染非SVG内容（如图片、文本等）
   * @param ctx Canvas 2D上下文
   * @param sourceCanvas 源画布
   * @param dimensions 画布尺寸
   */
  private async renderNonSVGContent(
    ctx: CanvasRenderingContext2D,
    sourceCanvas: HTMLElement,
    dimensions: { width: number; height: number }
  ): Promise<void> {
    try {
      // 查找图片元素
      const images = sourceCanvas.querySelectorAll('img')
      const sourceRect = sourceCanvas.getBoundingClientRect()

      for (const img of images) {
        if (img.complete && img.naturalWidth > 0) {
          const imgRect = img.getBoundingClientRect()
          const relativeX = imgRect.left - sourceRect.left
          const relativeY = imgRect.top - sourceRect.top

          ctx.drawImage(
            img,
            relativeX,
            relativeY,
            imgRect.width,
            imgRect.height
          )

          if (this.debugMode) {
            console.log('渲染图片元素:', {
              src: img.src,
              position: { x: relativeX, y: relativeY },
              size: { width: imgRect.width, height: imgRect.height }
            })
          }
        }
      }

      // 渲染文本内容（简化实现）
      const textElements = sourceCanvas.querySelectorAll('.obstacle-number, .distance-label')
      for (const textEl of textElements) {
        const htmlEl = textEl as HTMLElement
        const rect = htmlEl.getBoundingClientRect()
        const relativeX = rect.left - sourceRect.left
        const relativeY = rect.top - sourceRect.top

        const computedStyle = window.getComputedStyle(htmlEl)
        ctx.fillStyle = computedStyle.color || '#000000'
        ctx.font = `${computedStyle.fontSize || '12px'} ${computedStyle.fontFamily || 'Arial'}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        ctx.fillText(
          htmlEl.textContent || '',
          relativeX + rect.width / 2,
          relativeY + rect.height / 2
        )
      }
    } catch (error) {
      console.warn('渲染非SVG内容失败:', error)
    }
  }

  /**
   * 设置调试模式
   * @param enabled 是否启用调试模式
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
    this.converter = new SVGToCanvasConverter(enabled)
  }
}

// 创建全局实例
export const canvasFallbackRenderer = new CanvasFallbackRenderer()

// 便捷函数
export async function renderCanvasWithFallback(
  sourceCanvas: HTMLElement,
  options?: CanvasRenderOptions
): Promise<CanvasRenderResult> {
  return canvasFallbackRenderer.renderCanvasToCanvas(sourceCanvas, options)
}
