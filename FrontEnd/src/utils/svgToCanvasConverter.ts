/**
 * SVG到Canvas路径转换器
 * 实现SVG路径数据到Canvas绘制命令的转换，作为html2canvas的备用渲染方案
 */

// SVG路径命令接口
interface SVGPathCommand {
  command: string
  params: number[]
  absolute: boolean
}

// Canvas绘制上下文接口
interface CanvasRenderingContext {
  ctx: CanvasRenderingContext2D
  currentX: number
  currentY: number
  startX: number
  startY: number
}

// SVG路径解析结果接口
export interface ParsedSVGPath {
  commands: SVGPathCommand[]
  boundingBox: { x: number; y: number; width: number; height: number }
  totalLength: number
}

// SVG元素样式接口
export interface SVGElementStyles {
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeDasharray?: number[]
  strokeDashoffset?: number
  strokeLinecap?: 'butt' | 'round' | 'square'
  strokeLinejoin?: 'miter' | 'round' | 'bevel'
  opacity?: number
  transform?: string
}

/**
 * SVG到Canvas路径转换器类
 */
export class SVGToCanvasConverter {
  private debugMode = false

  constructor(debugMode = false) {
    this.debugMode = debugMode
  }

  /**
   * 解析SVG路径数据
   * @param pathData SVG路径的d属性数据
   * @returns 解析后的路径命令数组
   */
  parseSVGPath(pathData: string): ParsedSVGPath {
    if (!pathData || pathData.trim() === '') {
      return {
        commands: [],
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        totalLength: 0
      }
    }

    const commands: SVGPathCommand[] = []
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let totalLength = 0

    // 清理路径数据，移除多余的空格和换行
    const cleanedPath = pathData.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim()

    // 使用正则表达式匹配路径命令
    const commandRegex = /([MmLlHhVvCcSsQqTtAaZz])\s*([^MmLlHhVvCcSsQqTtAaZz]*)/g
    let match

    while ((match = commandRegex.exec(cleanedPath)) !== null) {
      const command = match[1]
      const paramString = match[2].trim()

      if (paramString) {
        // 解析参数，支持逗号和空格分隔
        const params = this.parseParameters(paramString)
        const isAbsolute = command === command.toUpperCase()

        commands.push({
          command: command.toUpperCase(),
          params,
          absolute: isAbsolute
        })

        // 计算边界框
        this.updateBoundingBox(command.toUpperCase(), params, isAbsolute,
          { minX, minY, maxX, maxY }, totalLength)
      } else {
        // 处理没有参数的命令（如Z）
        commands.push({
          command: command.toUpperCase(),
          params: [],
          absolute: command === command.toUpperCase()
        })
      }
    }

    // 计算最终边界框
    const boundingBox = {
      x: minX === Infinity ? 0 : minX,
      y: minY === Infinity ? 0 : minY,
      width: maxX === -Infinity ? 0 : maxX - (minX === Infinity ? 0 : minX),
      height: maxY === -Infinity ? 0 : maxY - (minY === Infinity ? 0 : minY)
    }

    if (this.debugMode) {
      console.log('解析SVG路径:', {
        originalPath: pathData,
        commandCount: commands.length,
        boundingBox,
        totalLength
      })
    }

    return {
      commands,
      boundingBox,
      totalLength
    }
  }

  /**
   * 解析参数字符串
   * @param paramString 参数字符串
   * @returns 数字参数数组
   */
  private parseParameters(paramString: string): number[] {
    if (!paramString.trim()) {
      return []
    }

    // 处理科学计数法和负号连接的情况
    const normalizedString = paramString
      .replace(/([+-])/g, ' $1')  // 在正负号前添加空格
      .replace(/([eE])(\s+)([+-])/g, '$1$3')  // 修复科学计数法
      .replace(/,/g, ' ')  // 替换逗号为空格
      .replace(/\s+/g, ' ')  // 合并多个空格
      .trim()

    return normalizedString
      .split(' ')
      .map(param => parseFloat(param))
      .filter(num => !isNaN(num))
  }

  /**
   * 更新边界框计算
   * @param command 路径命令
   * @param params 参数数组
   * @param isAbsolute 是否为绝对坐标
   * @param bounds 边界框对象
   * @param length 当前长度
   */
  private updateBoundingBox(
    command: string,
    params: number[],
    isAbsolute: boolean,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    length: number
  ): void {
    // 简化的边界框计算，主要处理M、L、C命令
    switch (command) {
      case 'M':
      case 'L':
        for (let i = 0; i < params.length; i += 2) {
          const x = params[i]
          const y = params[i + 1]
          if (!isNaN(x) && !isNaN(y)) {
            bounds.minX = Math.min(bounds.minX, x)
            bounds.maxX = Math.max(bounds.maxX, x)
            bounds.minY = Math.min(bounds.minY, y)
            bounds.maxY = Math.max(bounds.maxY, y)
          }
        }
        break
      case 'C':
        for (let i = 0; i < params.length; i += 6) {
          // 检查控制点和终点
          for (let j = 0; j < 6; j += 2) {
            const x = params[i + j]
            const y = params[i + j + 1]
            if (!isNaN(x) && !isNaN(y)) {
              bounds.minX = Math.min(bounds.minX, x)
              bounds.maxX = Math.max(bounds.maxX, x)
              bounds.minY = Math.min(bounds.minY, y)
              bounds.maxY = Math.max(bounds.maxY, y)
            }
          }
        }
        break
    }
  }

  /**
   * 将SVG路径转换为Canvas绘制操作
   * @param pathData SVG路径数据
   * @param ctx Canvas 2D上下文
   * @param styles SVG元素样式
   * @returns 是否成功转换
   */
  renderSVGPathToCanvas(
    pathData: string,
    ctx: CanvasRenderingContext2D,
    styles: SVGElementStyles = {}
  ): boolean {
    try {
      const parsedPath = this.parseSVGPath(pathData)

      if (parsedPath.commands.length === 0) {
        if (this.debugMode) {
          console.warn('SVG路径为空，跳过渲染')
        }
        return false
      }

      // 创建渲染上下文
      const renderContext: CanvasRenderingContext = {
        ctx,
        currentX: 0,
        currentY: 0,
        startX: 0,
        startY: 0
      }

      // 开始新路径
      ctx.beginPath()

      // 执行路径命令
      for (const command of parsedPath.commands) {
        this.executePathCommand(command, renderContext)
      }

      // 应用样式并绘制
      this.applyStylesAndRender(ctx, styles)

      if (this.debugMode) {
        console.log('成功渲染SVG路径到Canvas:', {
          commandCount: parsedPath.commands.length,
          boundingBox: parsedPath.boundingBox
        })
      }

      return true
    } catch (error) {
      console.error('SVG路径转换失败:', error)
      return false
    }
  }

  /**
   * 执行单个路径命令
   * @param command 路径命令
   * @param renderContext 渲染上下文
   */
  private executePathCommand(command: SVGPathCommand, renderContext: CanvasRenderingContext): void {
    const { ctx } = renderContext
    const { command: cmd, params, absolute } = command

    switch (cmd) {
      case 'M': // MoveTo
        this.executeMoveTo(params, absolute, renderContext)
        break
      case 'L': // LineTo
        this.executeLineTo(params, absolute, renderContext)
        break
      case 'H': // Horizontal LineTo
        this.executeHorizontalLineTo(params, absolute, renderContext)
        break
      case 'V': // Vertical LineTo
        this.executeVerticalLineTo(params, absolute, renderContext)
        break
      case 'C': // Cubic Bezier Curve
        this.executeCubicBezier(params, absolute, renderContext)
        break
      case 'S': // Smooth Cubic Bezier
        this.executeSmoothCubicBezier(params, absolute, renderContext)
        break
      case 'Q': // Quadratic Bezier Curve
        this.executeQuadraticBezier(params, absolute, renderContext)
        break
      case 'T': // Smooth Quadratic Bezier
        this.executeSmoothQuadraticBezier(params, absolute, renderContext)
        break
      case 'A': // Arc
        this.executeArc(params, absolute, renderContext)
        break
      case 'Z': // ClosePath
        this.executeClosePath(renderContext)
        break
      default:
        if (this.debugMode) {
          console.warn(`不支持的路径命令: ${cmd}`)
        }
    }
  }

  /**
   * 执行MoveTo命令
   */
  private executeMoveTo(params: number[], absolute: boolean, context: CanvasRenderingContext): void {
    for (let i = 0; i < params.length; i += 2) {
      const x = params[i]
      const y = params[i + 1]

      if (isNaN(x) || isNaN(y)) continue

      const targetX = absolute ? x : context.currentX + x
      const targetY = absolute ? y : context.currentY + y

      context.ctx.moveTo(targetX, targetY)
      context.currentX = targetX
      context.currentY = targetY

      // 第一个MoveTo设置起始点
      if (i === 0) {
        context.startX = targetX
        context.startY = targetY
      }
    }
  }

  /**
   * 执行LineTo命令
   */
  private executeLineTo(params: number[], absolute: boolean, context: CanvasRenderingContext): void {
    for (let i = 0; i < params.length; i += 2) {
      const x = params[i]
      const y = params[i + 1]

      if (isNaN(x) || isNaN(y)) continue

      const targetX = absolute ? x : context.currentX + x
      const targetY = absolute ? y : context.currentY + y

      context.ctx.lineTo(targetX, targetY)
      context.currentX = targetX
      context.currentY = targetY
    }
  }

  /**
   * 执行水平LineTo命令
   */
  private executeHorizontalLineTo(params: number[], absolute: boolean, context: CanvasRenderingContext): void {
    for (const x of params) {
      if (isNaN(x)) continue

      const targetX = absolute ? x : context.currentX + x
      context.ctx.lineTo(targetX, context.currentY)
      context.currentX = targetX
    }
  }

  /**
   * 执行垂直LineTo命令
   */
  private executeVerticalLineTo(params: number[], absolute: boolean, context: CanvasRenderingContext): void {
    for (const y of params) {
      if (isNaN(y)) continue

      const targetY = absolute ? y : context.currentY + y
      context.ctx.lineTo(context.currentX, targetY)
      context.currentY = targetY
    }
  }

  /**
   * 执行三次贝塞尔曲线命令
   */
  private executeCubicBezier(params: number[], absolute: boolean, context: CanvasRenderingContext): void {
    for (let i = 0; i < params.length; i += 6) {
      const x1 = params[i]
      const y1 = params[i + 1]
      const x2 = params[i + 2]
      const y2 = params[i + 3]
      const x = params[i + 4]
      const y = params[i + 5]

      if ([x1, y1, x2, y2, x, y].some(isNaN)) continue

      const cp1x = absolute ? x1 : context.currentX + x1
      const cp1y = absolute ? y1 : context.currentY + y1
      const cp2x = absolute ? x2 : context.currentX + x2
      const cp2y = absolute ? y2 : context.currentY + y2
      const targetX = absolute ? x : context.currentX + x
      const targetY = absolute ? y : context.currentY + y

      context.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, targetX, targetY)
      context.currentX = targetX
      context.currentY = targetY
    }
  }

  /**
   * 执行平滑三次贝塞尔曲线命令
   */
  private executeSmoothCubicBezier(params: number[], absolute: boolean, context: CanvasRenderingContext): void {
    // 简化实现，将S命令转换为C命令
    for (let i = 0; i < params.length; i += 4) {
      const x2 = params[i]
      const y2 = params[i + 1]
      const x = params[i + 2]
      const y = params[i + 3]

      if ([x2, y2, x, y].some(isNaN)) continue

      // 使用当前点作为第一个控制点（简化处理）
      const cp1x = context.currentX
      const cp1y = context.currentY
      const cp2x = absolute ? x2 : context.currentX + x2
      const cp2y = absolute ? y2 : context.currentY + y2
      const targetX = absolute ? x : context.currentX + x
      const targetY = absolute ? y : context.currentY + y

      context.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, targetX, targetY)
      context.currentX = targetX
      context.currentY = targetY
    }
  }

  /**
   * 执行二次贝塞尔曲线命令
   */
  private executeQuadraticBezier(params: number[], absolute: boolean, context: CanvasRenderingContext): void {
    for (let i = 0; i < params.length; i += 4) {
      const x1 = params[i]
      const y1 = params[i + 1]
      const x = params[i + 2]
      const y = params[i + 3]

      if ([x1, y1, x, y].some(isNaN)) continue

      const cpx = absolute ? x1 : context.currentX + x1
      const cpy = absolute ? y1 : context.currentY + y1
      const targetX = absolute ? x : context.currentX + x
      const targetY = absolute ? y : context.currentY + y

      context.ctx.quadraticCurveTo(cpx, cpy, targetX, targetY)
      context.currentX = targetX
      context.currentY = targetY
    }
  }

  /**
   * 执行平滑二次贝塞尔曲线命令
   */
  private executeSmoothQuadraticBezier(params: number[], absolute: boolean, context: CanvasRenderingContext): void {
    // 简化实现，将T命令转换为L命令
    for (let i = 0; i < params.length; i += 2) {
      const x = params[i]
      const y = params[i + 1]

      if (isNaN(x) || isNaN(y)) continue

      const targetX = absolute ? x : context.currentX + x
      const targetY = absolute ? y : context.currentY + y

      context.ctx.lineTo(targetX, targetY)
      context.currentX = targetX
      context.currentY = targetY
    }
  }

  /**
   * 执行弧线命令（简化实现）
   */
  private executeArc(params: number[], absolute: boolean, context: CanvasRenderingContext): void {
    // 弧线命令比较复杂，这里提供简化实现
    // 实际应用中可能需要更完整的椭圆弧转换
    for (let i = 0; i < params.length; i += 7) {
      const rx = params[i]
      const ry = params[i + 1]
      const xAxisRotation = params[i + 2]
      const largeArcFlag = params[i + 3]
      const sweepFlag = params[i + 4]
      const x = params[i + 5]
      const y = params[i + 6]

      if ([rx, ry, x, y].some(isNaN)) continue

      const targetX = absolute ? x : context.currentX + x
      const targetY = absolute ? y : context.currentY + y

      // 简化处理：如果半径很小，使用直线
      if (rx < 1 || ry < 1) {
        context.ctx.lineTo(targetX, targetY)
      } else {
        // 使用椭圆弧的近似实现
        const centerX = (context.currentX + targetX) / 2
        const centerY = (context.currentY + targetY) / 2
        const startAngle = Math.atan2(context.currentY - centerY, context.currentX - centerX)
        const endAngle = Math.atan2(targetY - centerY, targetX - centerX)

        context.ctx.arc(centerX, centerY, Math.min(rx, ry), startAngle, endAngle, sweepFlag === 0)
      }

      context.currentX = targetX
      context.currentY = targetY
    }
  }

  /**
   * 执行闭合路径命令
   */
  private executeClosePath(context: CanvasRenderingContext): void {
    context.ctx.closePath()
    context.currentX = context.startX
    context.currentY = context.startY
  }

  /**
   * 应用样式并渲染路径
   * @param ctx Canvas 2D上下文
   * @param styles SVG样式
   */
  private applyStylesAndRender(ctx: CanvasRenderingContext2D, styles: SVGElementStyles): void {
    // 保存当前状态
    ctx.save()

    // 应用透明度
    if (styles.opacity !== undefined && styles.opacity < 1) {
      ctx.globalAlpha = styles.opacity
    }

    // 应用变换
    if (styles.transform) {
      this.applyTransform(ctx, styles.transform)
    }

    // 应用填充
    if (styles.fill && styles.fill !== 'none') {
      ctx.fillStyle = styles.fill
      ctx.fill()
    }

    // 应用描边
    if (styles.stroke && styles.stroke !== 'none') {
      ctx.strokeStyle = styles.stroke

      // 设置线宽
      if (styles.strokeWidth !== undefined) {
        ctx.lineWidth = styles.strokeWidth
      }

      // 设置线帽样式
      if (styles.strokeLinecap) {
        ctx.lineCap = styles.strokeLinecap
      }

      // 设置线连接样式
      if (styles.strokeLinejoin) {
        ctx.lineJoin = styles.strokeLinejoin
      }

      // 设置虚线样式
      if (styles.strokeDasharray && styles.strokeDasharray.length > 0) {
        ctx.setLineDash(styles.strokeDasharray)

        if (styles.strokeDashoffset !== undefined) {
          ctx.lineDashOffset = styles.strokeDashoffset
        }
      }

      ctx.stroke()
    }

    // 恢复状态
    ctx.restore()
  }

  /**
   * 应用SVG变换到Canvas上下文
   * @param ctx Canvas 2D上下文
   * @param transform 变换字符串
   */
  private applyTransform(ctx: CanvasRenderingContext2D, transform: string): void {
    // 简化的变换解析，支持基本的translate、scale、rotate
    const transformRegex = /(translate|scale|rotate)\s*\(\s*([^)]+)\s*\)/g
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
            // SVG中角度是度数，Canvas中是弧度
            const angle = values[0] * Math.PI / 180
            ctx.rotate(angle)
          }
          break
      }
    }
  }
}
