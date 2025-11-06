/**
 * 导出质量验证系统
 * 负责验证导出结果的质量和完整性
 */

// 数据模型接口
export interface ValidationResult {
  isValid: boolean
  issues: ValidationIssue[]
  pathCompleteness: number // 路径完整性百分比
  keyPointsValidated: number // 验证的关键点数量
  continuityScore: number // 路径连续性评分
}

export interface ValidationIssue {
  type: 'missing_path' | 'incomplete_path' | 'style_mismatch' | 'position_offset' | 'visibility_issue'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  element?: Element
  expectedValue?: unknown
  actualValue?: unknown
}

export interface PathAnalysisResult {
  pathExists: boolean
  pathLength: number
  keyPoints: PathKeyPoint[]
  continuityBreaks: ContinuityBreak[]
  styleConsistency: StyleConsistencyResult
}

export interface PathKeyPoint {
  x: number
  y: number
  type: 'start' | 'end' | 'control' | 'intersection'
  isPresent: boolean
  tolerance: number
}

export interface ContinuityBreak {
  position: { x: number; y: number }
  gapSize: number
  severity: 'minor' | 'major'
}

export interface StyleConsistencyResult {
  strokeWidth: { expected: number; actual: number; matches: boolean }
  strokeColor: { expected: string; actual: string; matches: boolean }
  strokeDashArray: { expected: string; actual: string; matches: boolean }
  fillColor: { expected: string; actual: string; matches: boolean }
}

export interface SVGRenderingCheck {
  svgElementsFound: number
  svgElementsRendered: number
  pathElementsFound: number
  pathElementsRendered: number
  renderingIssues: RenderingIssue[]
}

export interface RenderingIssue {
  element: Element
  issue: 'not_rendered' | 'partially_rendered' | 'style_missing' | 'position_incorrect'
  description: string
}

export interface QualityReport {
  overallScore: number
  pathCompleteness: number
  renderingQuality: number
  styleAccuracy: number
  recommendations: string[]
  detailedResults: ValidationResult[]
}

/**
 * 导出质量验证器类
 */
export class ExportQualityValidator {
  private pixelTolerance = 2 // 像素容差
  private colorTolerance = 10 // 颜色容差
  private pathSamplePoints = 20 // 路径采样点数量

  /**
   * 验证路径完整性
   * @param exportedCanvas 导出的画布
   * @param originalCanvas 原始画布
   * @returns 验证结果
   */
  async validatePathCompleteness(
    exportedCanvas: HTMLCanvasElement,
    originalCanvas: HTMLElement
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = []
    let pathCompleteness = 0
    let keyPointsValidated = 0
    let continuityScore = 0

    try {
      // 1. 分析原始画布中的路径
      const originalPaths = this.extractPathsFromCanvas(originalCanvas)

      // 2. 分析导出画布中的路径
      const exportedPaths = await this.extractPathsFromExportedCanvas(exportedCanvas)

      // 3. 比较路径完整性
      const pathAnalysis = await this.analyzePathCompleteness(originalPaths, exportedPaths)

      pathCompleteness = pathAnalysis.completenessPercentage
      keyPointsValidated = pathAnalysis.validatedKeyPoints
      continuityScore = pathAnalysis.continuityScore

      // 4. 检查每个路径的完整性
      for (const originalPath of originalPaths) {
        const matchingExportedPath = this.findMatchingPath(originalPath, exportedPaths)

        if (!matchingExportedPath) {
          issues.push({
            type: 'missing_path',
            severity: 'critical',
            message: `路径缺失: ${originalPath.id || '未命名路径'}`,
            element: originalPath.element || undefined,
            expectedValue: originalPath.pathData,
            actualValue: null
          })
          continue
        }

        // 验证路径的关键点
        const keyPointValidation = this.validatePathKeyPoints(originalPath, matchingExportedPath)
        keyPointsValidated += keyPointValidation.validatedPoints

        if (keyPointValidation.issues.length > 0) {
          issues.push(...keyPointValidation.issues)
        }

        // 验证路径连续性
        const continuityValidation = this.validatePathContinuity(matchingExportedPath)
        if (continuityValidation.issues.length > 0) {
          issues.push(...continuityValidation.issues)
        }
      }

      // 5. 计算总体评分 (removed since score is no longer in ValidationResult)

      return {
        isValid: issues.filter(i => i.severity === 'critical').length === 0,
        issues,
        pathCompleteness,
        keyPointsValidated,
        continuityScore
      }

    } catch (error) {
      console.error('路径完整性验证失败:', error)

      issues.push({
        type: 'missing_path',
        severity: 'critical',
        message: `验证过程失败: ${error instanceof Error ? error.message : String(error)}`,
        expectedValue: '完整的路径验证',
        actualValue: '验证失败'
      })

      return {
        isValid: false,
        issues,
        pathCompleteness: 0,
        keyPointsValidated: 0,
        continuityScore: 0
      }
    }
  }

  /**
   * 检查SVG元素是否正确渲染
   * @param exportedCanvas 导出的画布
   * @param originalCanvas 原始画布
   * @returns SVG渲染检查结果
   */
  async checkSVGRendering(
    exportedCanvas: HTMLCanvasElement,
    originalCanvas?: HTMLElement
  ): Promise<SVGRenderingCheck> {
    const renderingIssues: RenderingIssue[] = []
    let svgElementsFound = 0
    let svgElementsRendered = 0
    let pathElementsFound = 0
    let pathElementsRendered = 0

    try {
      if (originalCanvas) {
        // 统计原始画布中的SVG元素
        const svgElements = originalCanvas.querySelectorAll('svg')
        svgElementsFound = svgElements.length

        const pathElements = originalCanvas.querySelectorAll('svg path, path')
        pathElementsFound = pathElements.length

        // 分析导出画布中的渲染情况
        const canvasContext = exportedCanvas.getContext('2d')
        if (!canvasContext) {
          throw new Error('无法获取画布上下文')
        }

        // 检查每个SVG元素是否被正确渲染
        for (const svgElement of Array.from(svgElements)) {
          const renderingResult = await this.checkElementRendering(
            svgElement as SVGElement,
            exportedCanvas,
            canvasContext
          )

          if (renderingResult.isRendered) {
            svgElementsRendered++
          } else {
            renderingIssues.push({
              element: svgElement,
              issue: 'not_rendered',
              description: `SVG元素未在导出画布中正确渲染`
            })
          }
        }

        // 检查每个路径元素是否被正确渲染
        for (const pathElement of Array.from(pathElements)) {
          const renderingResult = await this.checkElementRendering(
            pathElement as SVGElement,
            exportedCanvas,
            canvasContext
          )

          if (renderingResult.isRendered) {
            pathElementsRendered++
          } else {
            renderingIssues.push({
              element: pathElement,
              issue: 'not_rendered',
              description: `路径元素未在导出画布中正确渲染`
            })
          }
        }
      } else {
        // 如果没有原始画布，只能进行基本的像素分析
        const pixelAnalysis = this.analyzeCanvasPixels(exportedCanvas)
        svgElementsRendered = pixelAnalysis.hasContent ? 1 : 0
        pathElementsRendered = pixelAnalysis.hasPathLikeContent ? 1 : 0
      }

      return {
        svgElementsFound,
        svgElementsRendered,
        pathElementsFound,
        pathElementsRendered,
        renderingIssues
      }

    } catch (error) {
      console.error('SVG渲染检查失败:', error)

      renderingIssues.push({
        element: originalCanvas || exportedCanvas,
        issue: 'not_rendered',
        description: `SVG渲染检查失败: ${error instanceof Error ? error.message : String(error)}`
      })

      return {
        svgElementsFound,
        svgElementsRendered: 0,
        pathElementsFound,
        pathElementsRendered: 0,
        renderingIssues
      }
    }
  }

  /**
   * 生成质量报告
   * @param validationResults 验证结果数组
   * @returns 质量报告
   */
  generateQualityReport(validationResults: ValidationResult[]): QualityReport {
    if (validationResults.length === 0) {
      return {
        overallScore: 0,
        pathCompleteness: 0,
        renderingQuality: 0,
        styleAccuracy: 0,
        recommendations: ['无验证结果可用于生成报告'],
        detailedResults: []
      }
    }

    // 计算平均分数 (using pathCompleteness as base score since score property was removed)
    const overallScore = validationResults.reduce((sum, result) => sum + (result.pathCompleteness / 100), 0) / validationResults.length
    const pathCompleteness = validationResults.reduce((sum, result) => sum + result.pathCompleteness, 0) / validationResults.length
    const avgContinuityScore = validationResults.reduce((sum, result) => sum + result.continuityScore, 0) / validationResults.length

    // 分析所有问题
    const allIssues = validationResults.flatMap(result => result.issues)
    const criticalIssues = allIssues.filter(issue => issue.severity === 'critical')
    const highIssues = allIssues.filter(issue => issue.severity === 'high')

    // 计算渲染质量（基于问题严重程度和连续性评分）
    const renderingQuality = Math.max(0, (avgContinuityScore / 100) - (criticalIssues.length * 0.3 + highIssues.length * 0.1))

    // 计算样式准确性（基于样式相关问题）
    const styleIssues = allIssues.filter(issue => issue.type === 'style_mismatch')
    const styleAccuracy = Math.max(0, 1 - (styleIssues.length * 0.2))

    // 生成建议
    const recommendations = this.generateRecommendations(allIssues, overallScore, pathCompleteness)

    return {
      overallScore,
      pathCompleteness,
      renderingQuality,
      styleAccuracy,
      recommendations,
      detailedResults: validationResults
    }
  }

  /**
   * 从画布中提取路径信息
   * @param canvas 画布元素
   * @returns 路径信息数组
   */
  private extractPathsFromCanvas(canvas: HTMLElement): PathInfo[] {
    const paths: PathInfo[] = []

    // 查找所有SVG路径元素
    const pathElements = canvas.querySelectorAll('svg path, path')

    pathElements.forEach((pathElement, index) => {
      const element = pathElement as SVGPathElement
      const pathData = element.getAttribute('d') || ''
      const computedStyle = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()

      paths.push({
        id: element.id || `path-${index}`,
        element,
        pathData,
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        style: {
          stroke: computedStyle.stroke,
          strokeWidth: parseFloat(computedStyle.strokeWidth) || 1,
          strokeDashArray: computedStyle.strokeDasharray,
          fill: computedStyle.fill
        },
        keyPoints: this.extractKeyPointsFromPath(pathData, rect)
      })
    })

    return paths
  }

  /**
   * 从导出的画布中提取路径信息
   * @param canvas 导出的画布
   * @returns 路径信息数组
   */
  private async extractPathsFromExportedCanvas(canvas: HTMLCanvasElement): Promise<PathInfo[]> {
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法获取画布上下文')
    }

    // 获取画布像素数据
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

    // 使用边缘检测算法识别路径
    const paths = await this.detectPathsFromPixels(imageData, canvas.width, canvas.height)

    return paths
  }

  /**
   * 从路径数据中提取关键点
   * @param pathData SVG路径数据
   * @param boundingBox 边界框
   * @returns 关键点数组
   */
  private extractKeyPointsFromPath(pathData: string, boundingBox: DOMRect): PathKeyPoint[] {
    const keyPoints: PathKeyPoint[] = []

    if (!pathData) return keyPoints

    // 解析SVG路径命令
    const commands = this.parseSVGPath(pathData)

    commands.forEach((command, index) => {
      const { type, x, y } = command

      // 确定关键点类型
      let pointType: PathKeyPoint['type'] = 'control'
      if (index === 0) pointType = 'start'
      else if (index === commands.length - 1) pointType = 'end'
      else if (type === 'L' || type === 'M') pointType = 'intersection'

      keyPoints.push({
        x: boundingBox.x + x,
        y: boundingBox.y + y,
        type: pointType,
        isPresent: true,
        tolerance: this.pixelTolerance
      })
    })

    return keyPoints
  }

  /**
   * 解析SVG路径数据
   * @param pathData SVG路径数据字符串
   * @returns 路径命令数组
   */
  private parseSVGPath(pathData: string): Array<{ type: string; x: number; y: number }> {
    const commands: Array<{ type: string; x: number; y: number }> = []

    // 简化的SVG路径解析（支持基本的M, L, C, Z命令）
    const pathRegex = /([MLHVCSQTAZ])\s*([^MLHVCSQTAZ]*)/gi
    let match

    while ((match = pathRegex.exec(pathData)) !== null) {
      const command = match[1].toUpperCase()
      const params = match[2].trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n))

      switch (command) {
        case 'M':
        case 'L':
          if (params.length >= 2) {
            commands.push({ type: command, x: params[0], y: params[1] })
          }
          break
        case 'C':
          if (params.length >= 6) {
            // 对于贝塞尔曲线，我们取终点
            commands.push({ type: command, x: params[4], y: params[5] })
          }
          break
        case 'H':
          if (params.length >= 1 && commands.length > 0) {
            const lastY = commands[commands.length - 1].y
            commands.push({ type: command, x: params[0], y: lastY })
          }
          break
        case 'V':
          if (params.length >= 1 && commands.length > 0) {
            const lastX = commands[commands.length - 1].x
            commands.push({ type: command, x: lastX, y: params[0] })
          }
          break
      }
    }

    return commands
  }

  /**
   * 从像素数据中检测路径
   * @param imageData 图像数据
   * @param width 画布宽度
   * @param height 画布高度
   * @returns 检测到的路径信息
   */
  private async detectPathsFromPixels(
    imageData: ImageData,
    width: number,
    height: number
  ): Promise<PathInfo[]> {
    const paths: PathInfo[] = []

    // 使用简单的边缘检测算法
    const edges = this.detectEdges(imageData, width, height)

    // 从边缘数据中提取路径
    const pathSegments = this.extractPathSegments(edges, width, height)

    pathSegments.forEach((segment, index) => {
      paths.push({
        id: `detected-path-${index}`,
        element: null, // 检测到的路径没有对应的DOM元素
        pathData: this.segmentToSVGPath(segment),
        boundingBox: this.calculateSegmentBoundingBox(segment),
        style: {
          stroke: 'detected',
          strokeWidth: 1,
          strokeDashArray: 'none',
          fill: 'none'
        },
        keyPoints: this.extractKeyPointsFromSegment(segment)
      })
    })

    return paths
  }

  /**
   * 边缘检测算法
   * @param imageData 图像数据
   * @param width 宽度
   * @param height 高度
   * @returns 边缘像素数组
   */
  private detectEdges(imageData: ImageData, width: number, height: number): boolean[][] {
    const data = imageData.data
    const edges: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false))

    // Sobel边缘检测
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        // Calculate pixel index for edge detection
        // const idx = (y * width + x) * 4 // Commented out as it's not used in current implementation

        // 计算灰度值 (unused in current implementation)

        // 计算梯度
        let gx = 0, gy = 0

        // Sobel X核
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const neighborIdx = ((y + dy) * width + (x + dx)) * 4
            const neighborGray = (data[neighborIdx] + data[neighborIdx + 1] + data[neighborIdx + 2]) / 3

            const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
            const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1]
            const kernelIdx = (dy + 1) * 3 + (dx + 1)

            gx += neighborGray * sobelX[kernelIdx]
            gy += neighborGray * sobelY[kernelIdx]
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy)
        edges[y][x] = magnitude > 50 // 阈值可调整
      }
    }

    return edges
  }

  /**
   * 从边缘数据中提取路径段
   * @param edges 边缘数据
   * @param width 宽度
   * @param height 高度
   * @returns 路径段数组
   */
  private extractPathSegments(edges: boolean[][], width: number, height: number): PathSegment[] {
    const segments: PathSegment[] = []
    const visited: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false))

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (edges[y][x] && !visited[y][x]) {
          const segment = this.tracePathSegment(edges, visited, x, y, width, height)
          if (segment.points.length > 5) { // 过滤掉太短的段
            segments.push(segment)
          }
        }
      }
    }

    return segments
  }

  /**
   * 追踪路径段
   * @param edges 边缘数据
   * @param visited 访问标记
   * @param startX 起始X坐标
   * @param startY 起始Y坐标
   * @param width 宽度
   * @param height 高度
   * @returns 路径段
   */
  private tracePathSegment(
    edges: boolean[][],
    visited: boolean[][],
    startX: number,
    startY: number,
    width: number,
    height: number
  ): PathSegment {
    const points: Array<{ x: number; y: number }> = []
    const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]

    while (stack.length > 0) {
      const current = stack.pop()!
      const { x, y } = current

      if (x < 0 || x >= width || y < 0 || y >= height || visited[y][x] || !edges[y][x]) {
        continue
      }

      visited[y][x] = true
      points.push({ x, y })

      // 检查8个邻居
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          stack.push({ x: x + dx, y: y + dy })
        }
      }
    }

    return { points }
  }

  /**
   * 将路径段转换为SVG路径数据
   * @param segment 路径段
   * @returns SVG路径数据字符串
   */
  private segmentToSVGPath(segment: PathSegment): string {
    if (segment.points.length === 0) return ''

    const points = segment.points.sort((a, b) => a.x - b.x || a.y - b.y)
    let pathData = `M ${points[0].x} ${points[0].y}`

    for (let i = 1; i < points.length; i++) {
      pathData += ` L ${points[i].x} ${points[i].y}`
    }

    return pathData
  }

  /**
   * 计算路径段的边界框
   * @param segment 路径段
   * @returns 边界框
   */
  private calculateSegmentBoundingBox(segment: PathSegment): BoundingBox {
    if (segment.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    const xs = segment.points.map(p => p.x)
    const ys = segment.points.map(p => p.y)

    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }

  /**
   * 从路径段中提取关键点
   * @param segment 路径段
   * @returns 关键点数组
   */
  private extractKeyPointsFromSegment(segment: PathSegment): PathKeyPoint[] {
    const keyPoints: PathKeyPoint[] = []

    if (segment.points.length === 0) return keyPoints

    // 添加起点和终点
    const sortedPoints = segment.points.sort((a, b) => a.x - b.x || a.y - b.y)

    keyPoints.push({
      x: sortedPoints[0].x,
      y: sortedPoints[0].y,
      type: 'start',
      isPresent: true,
      tolerance: this.pixelTolerance
    })

    if (sortedPoints.length > 1) {
      keyPoints.push({
        x: sortedPoints[sortedPoints.length - 1].x,
        y: sortedPoints[sortedPoints.length - 1].y,
        type: 'end',
        isPresent: true,
        tolerance: this.pixelTolerance
      })
    }

    // 添加一些中间控制点
    const sampleCount = Math.min(this.pathSamplePoints, sortedPoints.length)
    for (let i = 1; i < sampleCount - 1; i++) {
      const index = Math.floor((i / (sampleCount - 1)) * (sortedPoints.length - 1))
      keyPoints.push({
        x: sortedPoints[index].x,
        y: sortedPoints[index].y,
        type: 'control',
        isPresent: true,
        tolerance: this.pixelTolerance
      })
    }

    return keyPoints
  }

  /**
   * 分析路径完整性
   * @param originalPaths 原始路径
   * @param exportedPaths 导出的路径
   * @returns 路径分析结果
   */
  private async analyzePathCompleteness(
    originalPaths: PathInfo[],
    exportedPaths: PathInfo[]
  ): Promise<PathCompletenessAnalysis> {
    let completenessPercentage = 0
    let validatedKeyPoints = 0
    let continuityScore = 0

    if (originalPaths.length === 0) {
      return { completenessPercentage: 100, validatedKeyPoints: 0, continuityScore: 100 }
    }

    const totalPaths = originalPaths.length
    let completePaths = 0
    let totalKeyPoints = 0
    let validKeyPoints = 0

    for (const originalPath of originalPaths) {
      const matchingPath = this.findMatchingPath(originalPath, exportedPaths)

      if (matchingPath) {
        completePaths++

        // 验证关键点
        const keyPointValidation = this.validatePathKeyPoints(originalPath, matchingPath)
        totalKeyPoints += originalPath.keyPoints.length
        validKeyPoints += keyPointValidation.validatedPoints
      }

      totalKeyPoints += originalPath.keyPoints.length
    }

    completenessPercentage = (completePaths / totalPaths) * 100
    validatedKeyPoints = validKeyPoints
    continuityScore = totalKeyPoints > 0 ? (validKeyPoints / totalKeyPoints) * 100 : 100

    return { completenessPercentage, validatedKeyPoints, continuityScore }
  }

  /**
   * 查找匹配的路径
   * @param originalPath 原始路径
   * @param exportedPaths 导出的路径数组
   * @returns 匹配的路径或null
   */
  private findMatchingPath(originalPath: PathInfo, exportedPaths: PathInfo[]): PathInfo | null {
    let bestMatch: PathInfo | null = null
    let bestScore = 0

    for (const exportedPath of exportedPaths) {
      const score = this.calculatePathSimilarity(originalPath, exportedPath)
      if (score > bestScore && score > 0.5) { // 相似度阈值
        bestScore = score
        bestMatch = exportedPath
      }
    }

    return bestMatch
  }

  /**
   * 计算路径相似度
   * @param path1 路径1
   * @param path2 路径2
   * @returns 相似度分数 (0-1)
   */
  private calculatePathSimilarity(path1: PathInfo, path2: PathInfo): number {
    // 比较边界框
    const boundingBoxSimilarity = this.calculateBoundingBoxSimilarity(path1.boundingBox, path2.boundingBox)

    // 比较关键点
    const keyPointSimilarity = this.calculateKeyPointSimilarity(path1.keyPoints, path2.keyPoints)

    // 综合评分
    return (boundingBoxSimilarity * 0.4 + keyPointSimilarity * 0.6)
  }

  /**
   * 计算边界框相似度
   * @param box1 边界框1
   * @param box2 边界框2
   * @returns 相似度分数 (0-1)
   */
  private calculateBoundingBoxSimilarity(box1: BoundingBox, box2: BoundingBox): number {
    const xOverlap = Math.max(0, Math.min(box1.x + box1.width, box2.x + box2.width) - Math.max(box1.x, box2.x))
    const yOverlap = Math.max(0, Math.min(box1.y + box1.height, box2.y + box2.height) - Math.max(box1.y, box2.y))

    const overlapArea = xOverlap * yOverlap
    const unionArea = box1.width * box1.height + box2.width * box2.height - overlapArea

    return unionArea > 0 ? overlapArea / unionArea : 0
  }

  /**
   * 计算关键点相似度
   * @param points1 关键点数组1
   * @param points2 关键点数组2
   * @returns 相似度分数 (0-1)
   */
  private calculateKeyPointSimilarity(points1: PathKeyPoint[], points2: PathKeyPoint[]): number {
    if (points1.length === 0 && points2.length === 0) return 1
    if (points1.length === 0 || points2.length === 0) return 0

    let matchedPoints = 0

    for (const point1 of points1) {
      for (const point2 of points2) {
        const distance = Math.sqrt(
          Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2)
        )

        if (distance <= Math.max(point1.tolerance, point2.tolerance)) {
          matchedPoints++
          break
        }
      }
    }

    return matchedPoints / Math.max(points1.length, points2.length)
  }

  /**
   * 验证路径关键点
   * @param originalPath 原始路径
   * @param exportedPath 导出的路径
   * @returns 关键点验证结果
   */
  private validatePathKeyPoints(
    originalPath: PathInfo,
    exportedPath: PathInfo
  ): { validatedPoints: number; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = []
    let validatedPoints = 0

    for (const originalPoint of originalPath.keyPoints) {
      let pointFound = false

      for (const exportedPoint of exportedPath.keyPoints) {
        const distance = Math.sqrt(
          Math.pow(originalPoint.x - exportedPoint.x, 2) +
          Math.pow(originalPoint.y - exportedPoint.y, 2)
        )

        if (distance <= originalPoint.tolerance) {
          pointFound = true
          validatedPoints++
          break
        }
      }

      if (!pointFound) {
        issues.push({
          type: 'missing_path',
          severity: originalPoint.type === 'start' || originalPoint.type === 'end' ? 'high' : 'medium',
          message: `关键点缺失: ${originalPoint.type} 点 (${originalPoint.x}, ${originalPoint.y})`,
          element: originalPath.element || undefined,
          expectedValue: { x: originalPoint.x, y: originalPoint.y },
          actualValue: null
        })
      }
    }

    return { validatedPoints, issues }
  }

  /**
   * 验证路径连续性
   * @param path 路径信息
   * @returns 连续性验证结果
   */
  private validatePathContinuity(path: PathInfo): { issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = []

    // 检查关键点之间的连续性
    const sortedPoints = path.keyPoints.sort((a, b) => a.x - b.x || a.y - b.y)

    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const point1 = sortedPoints[i]
      const point2 = sortedPoints[i + 1]

      const distance = Math.sqrt(
        Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)
      )

      // 如果两个连续点之间的距离过大，可能存在断裂
      const maxExpectedDistance = 50 // 可调整的阈值
      if (distance > maxExpectedDistance) {
        issues.push({
          type: 'incomplete_path',
          severity: 'medium',
          message: `路径可能存在断裂: 点 (${point1.x}, ${point1.y}) 到 (${point2.x}, ${point2.y}) 距离过大 (${distance.toFixed(1)}px)`,
          element: path.element || undefined,
          expectedValue: `< ${maxExpectedDistance}px`,
          actualValue: `${distance.toFixed(1)}px`
        })
      }
    }

    return { issues }
  }

  /**
   * 检查元素渲染情况
   * @param element SVG元素
   * @param canvas 导出的画布
   * @param context 画布上下文
   * @returns 渲染检查结果
   */
  private async checkElementRendering(
    element: SVGElement,
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D
  ): Promise<{ isRendered: boolean; confidence: number }> {
    try {
      const rect = element.getBoundingClientRect()

      // 获取元素区域的像素数据
      const imageData = context.getImageData(
        Math.max(0, rect.x),
        Math.max(0, rect.y),
        Math.min(canvas.width - rect.x, rect.width),
        Math.min(canvas.height - rect.y, rect.height)
      )

      // 分析像素数据，检查是否有非背景色的像素
      const pixelAnalysis = this.analyzePixelData(imageData)

      return {
        isRendered: pixelAnalysis.hasContent,
        confidence: pixelAnalysis.contentPercentage
      }
    } catch (error) {
      console.warn('检查元素渲染失败:', error)
      return { isRendered: false, confidence: 0 }
    }
  }

  /**
   * 分析像素数据
   * @param imageData 图像数据
   * @returns 像素分析结果
   */
  private analyzePixelData(imageData: ImageData): { hasContent: boolean; contentPercentage: number } {
    const data = imageData.data
    let contentPixels = 0
    const totalPixels = imageData.width * imageData.height

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]

      // 检查是否为非白色/透明像素
      if (a > 0 && (r < 250 || g < 250 || b < 250)) {
        contentPixels++
      }
    }

    const contentPercentage = totalPixels > 0 ? contentPixels / totalPixels : 0

    return {
      hasContent: contentPercentage > 0.01, // 至少1%的像素有内容
      contentPercentage
    }
  }

  /**
   * 分析画布像素
   * @param canvas 画布
   * @returns 像素分析结果
   */
  private analyzeCanvasPixels(canvas: HTMLCanvasElement): { hasContent: boolean; hasPathLikeContent: boolean } {
    const context = canvas.getContext('2d')
    if (!context) {
      return { hasContent: false, hasPathLikeContent: false }
    }

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const pixelAnalysis = this.analyzePixelData(imageData)

    // 简单的路径检测：检查是否有线性结构
    const edges = this.detectEdges(imageData, canvas.width, canvas.height)
    const hasPathLikeContent = this.hasLinearStructures(edges)

    return {
      hasContent: pixelAnalysis.hasContent,
      hasPathLikeContent
    }
  }

  /**
   * 检查是否有线性结构
   * @param edges 边缘数据
   * @returns 是否有线性结构
   */
  private hasLinearStructures(edges: boolean[][]): boolean {
    const height = edges.length
    const width = edges[0]?.length || 0

    let linearPixels = 0
    let totalEdgePixels = 0

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (edges[y][x]) {
          totalEdgePixels++

          // 检查是否形成线性结构（水平、垂直或对角线）
          const neighbors = [
            edges[y-1][x-1], edges[y-1][x], edges[y-1][x+1],
            edges[y][x-1],                   edges[y][x+1],
            edges[y+1][x-1], edges[y+1][x], edges[y+1][x+1]
          ]

          const connectedNeighbors = neighbors.filter(Boolean).length
          if (connectedNeighbors >= 1 && connectedNeighbors <= 3) {
            linearPixels++
          }
        }
      }
    }

    return totalEdgePixels > 0 && (linearPixels / totalEdgePixels) > 0.3
  }

  /**
   * 计算总体评分
   * @param pathCompleteness 路径完整性
   * @param continuityScore 连续性评分
   * @param issues 问题列表
   * @returns 总体评分
   */
  private calculateOverallScore(
    pathCompleteness: number,
    continuityScore: number,
    issues: ValidationIssue[]
  ): number {
    // 基础分数基于路径完整性和连续性
    const baseScore = (pathCompleteness + continuityScore) / 200 // 转换为0-1范围

    // 根据问题严重程度扣分
    const criticalIssues = issues.filter(i => i.severity === 'critical').length
    const highIssues = issues.filter(i => i.severity === 'high').length
    const mediumIssues = issues.filter(i => i.severity === 'medium').length

    const penalty = criticalIssues * 0.3 + highIssues * 0.15 + mediumIssues * 0.05

    return Math.max(0, baseScore - penalty)
  }

  /**
   * 生成建议
   * @param issues 问题列表
   * @param overallScore 总体评分
   * @param pathCompleteness 路径完整性
   * @returns 建议列表
   */
  private generateRecommendations(
    issues: ValidationIssue[],
    overallScore: number,
    pathCompleteness: number
  ): string[] {
    const recommendations: string[] = []

    if (overallScore < 0.5) {
      recommendations.push('导出质量较低，建议检查SVG元素的样式和可见性设置')
    }

    if (pathCompleteness < 80) {
      recommendations.push('路径完整性不足，建议使用SVG样式内联转换或Canvas备用渲染')
    }

    const criticalIssues = issues.filter(i => i.severity === 'critical')
    if (criticalIssues.length > 0) {
      recommendations.push('存在严重问题，建议检查SVG元素是否正确渲染')
    }

    const styleIssues = issues.filter(i => i.type === 'style_mismatch')
    if (styleIssues.length > 0) {
      recommendations.push('样式不匹配，建议强制内联样式或检查CSS变量解析')
    }

    const positionIssues = issues.filter(i => i.type === 'position_offset')
    if (positionIssues.length > 0) {
      recommendations.push('位置偏移，建议检查SVG坐标系统和变换属性')
    }

    if (recommendations.length === 0) {
      recommendations.push('导出质量良好，无需特别优化')
    }

    return recommendations
  }
}

// 辅助接口定义
interface PathInfo {
  id: string
  element: SVGPathElement | null
  pathData: string
  boundingBox: BoundingBox
  style: {
    stroke: string
    strokeWidth: number
    strokeDashArray: string
    fill: string
  }
  keyPoints: PathKeyPoint[]
}

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

interface PathSegment {
  points: Array<{ x: number; y: number }>
}

interface PathCompletenessAnalysis {
  completenessPercentage: number
  validatedKeyPoints: number
  continuityScore: number
}

// 创建全局实例
export const exportQualityValidator = new ExportQualityValidator()
