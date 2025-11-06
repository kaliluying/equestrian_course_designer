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

// 路径完整性验证器接口
export interface PathIntegrityValidator {
  validatePathCompleteness(exportedCanvas: HTMLCanvasElement, originalCanvas: HTMLElement): Promise<ValidationResult>
  extractPathsFromCanvas(canvas: HTMLElement): PathInfo[]
  extractPathsFromExportedCanvas(canvas: HTMLCanvasElement): Promise<PathInfo[]>
  comparePathIntegrity(originalPaths: PathInfo[], exportedPaths: PathInfo[]): PathComparisonResult
}

// 路径比较结果接口
export interface PathComparisonResult {
  completenessPercentage: number
  validatedKeyPoints: number
  continuityScore: number
  missingPaths: PathInfo[]
  matchedPaths: Array<{ original: PathInfo; exported: PathInfo; similarity: number }>
  issues: ValidationIssue[]
}

// SVG渲染验证器接口
export interface SVGRenderingValidator {
  checkSVGRendering(exportedCanvas: HTMLCanvasElement, originalCanvas?: HTMLElement): Promise<SVGRenderingCheck>
  detectSVGElements(canvas: HTMLElement): SVGElementInfo[]
  validateSVGElementRendering(element: SVGElement, exportedCanvas: HTMLCanvasElement): Promise<SVGElementRenderingResult>
  analyzePixelAccuracy(originalRegion: ImageData, exportedRegion: ImageData): PixelAccuracyResult
}

// SVG元素信息接口
export interface SVGElementInfo {
  element: SVGElement
  type: 'svg' | 'path' | 'circle' | 'rect' | 'line' | 'polygon' | 'polyline' | 'text' | 'other'
  boundingBox: DOMRect
  styles: {
    fill: string
    stroke: string
    strokeWidth: number
    opacity: number
    visibility: string
  }
  pathData?: string // 对于path元素
  textContent?: string // 对于text元素
}

// SVG元素渲染结果接口
export interface SVGElementRenderingResult {
  element: SVGElement
  isRendered: boolean
  renderingQuality: number // 0-1
  issues: RenderingIssue[]
  pixelAccuracy: PixelAccuracyResult
}

// 像素准确性结果接口
export interface PixelAccuracyResult {
  accuracy: number // 0-1
  pixelDifferences: number
  totalPixels: number
  colorVariance: number
  structuralSimilarity: number
}

// 质量报告生成器接口
export interface QualityReportGenerator {
  generateQualityReport(validationResults: ValidationResult[]): QualityReport
  generateComprehensiveReport(
    pathValidation: ValidationResult,
    svgValidation: SVGRenderingCheck,
    additionalMetrics?: QualityMetrics
  ): ComprehensiveQualityReport
  calculateOverallQualityScore(metrics: QualityMetrics): number
  generateRecommendations(issues: ValidationIssue[], metrics: QualityMetrics): RecommendationSet
}

// 质量指标接口
export interface QualityMetrics {
  pathCompleteness: number
  renderingAccuracy: number
  styleConsistency: number
  performanceScore: number
  elementCoverage: number
  visualFidelity: number
}

// 综合质量报告接口
export interface ComprehensiveQualityReport extends QualityReport {
  executionTime: number
  memoryUsage?: number
  browserCompatibility: BrowserCompatibilityInfo
  exportMetadata: ExportQualityMetadata
  visualComparison?: VisualComparisonResult
}

// 推荐集合接口
export interface RecommendationSet {
  critical: Recommendation[]
  important: Recommendation[]
  suggested: Recommendation[]
  optimizations: Recommendation[]
}

// 推荐接口
export interface Recommendation {
  id: string
  category: 'rendering' | 'performance' | 'quality' | 'compatibility'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  actionItems: string[]
  expectedImprovement: string
  technicalDetails?: string
}

// 浏览器兼容性信息接口
export interface BrowserCompatibilityInfo {
  browser: string
  version: string
  supportedFeatures: string[]
  limitations: string[]
  recommendations: string[]
}

// 导出质量元数据接口
export interface ExportQualityMetadata {
  timestamp: string
  exportFormat: string
  canvasSize: { width: number; height: number }
  elementCount: number
  svgElementCount: number
  pathElementCount: number
  validationDuration: number
}

// 视觉比较结果接口
export interface VisualComparisonResult {
  overallSimilarity: number
  regionComparisons: RegionComparison[]
  differenceMap?: ImageData
  significantDifferences: VisualDifference[]
}

// 区域比较接口
export interface RegionComparison {
  region: { x: number; y: number; width: number; height: number }
  similarity: number
  issues: string[]
}

// 视觉差异接口
export interface VisualDifference {
  location: { x: number; y: number }
  type: 'color' | 'structure' | 'missing' | 'extra'
  severity: 'low' | 'medium' | 'high'
  description: string
}

export interface ValidationIssue {
  type: 'missing_path' | 'incomplete_path' | 'style_mismatch' | 'position_offset' | 'visibility_issue' | 'rendering_error'
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
 * 实现路径完整性验证、SVG渲染验证和质量报告生成
 */
export class ExportQualityValidator implements PathIntegrityValidator, SVGRenderingValidator, QualityReportGenerator {
  private pixelTolerance = 2 // 像素容差
  private colorTolerance = 10 // 颜色容差
  private pathSamplePoints = 20 // 路径采样点数量
  private similarityThreshold = 0.5 // 路径相似度阈值
  private continuityGapThreshold = 50 // 连续性间隙阈值（像素）

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
   * 检测SVG元素 - 公共接口实现
   * @param canvas 画布元素
   * @returns SVG元素信息数组
   */
  detectSVGElements(canvas: HTMLElement): SVGElementInfo[] {
    const svgElements: SVGElementInfo[] = []

    // 查找所有SVG相关元素
    const elements = canvas.querySelectorAll('svg, svg *, [data-svg]')

    elements.forEach(element => {
      if (element instanceof SVGElement) {
        const rect = element.getBoundingClientRect()
        const computedStyle = window.getComputedStyle(element)

        // 确定元素类型
        let type: SVGElementInfo['type'] = 'other'
        const tagName = element.tagName.toLowerCase()
        if (['svg', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'text'].includes(tagName)) {
          type = tagName as SVGElementInfo['type']
        }

        const svgInfo: SVGElementInfo = {
          element,
          type,
          boundingBox: rect,
          styles: {
            fill: computedStyle.fill || 'none',
            stroke: computedStyle.stroke || 'none',
            strokeWidth: parseFloat(computedStyle.strokeWidth) || 0,
            opacity: parseFloat(computedStyle.opacity) || 1,
            visibility: computedStyle.visibility || 'visible'
          }
        }

        // 添加特定元素的额外信息
        if (type === 'path' && element instanceof SVGPathElement) {
          svgInfo.pathData = element.getAttribute('d') || ''
        }

        if (type === 'text') {
          svgInfo.textContent = element.textContent || ''
        }

        svgElements.push(svgInfo)
      }
    })

    return svgElements
  }

  /**
   * 验证SVG元素渲染 - 公共接口实现
   * @param element SVG元素
   * @param exportedCanvas 导出的画布
   * @returns SVG元素渲染结果
   */
  async validateSVGElementRendering(
    element: SVGElement,
    exportedCanvas: HTMLCanvasElement
  ): Promise<SVGElementRenderingResult> {
    const issues: RenderingIssue[] = []
    const rect = element.getBoundingClientRect()

    try {
      const context = exportedCanvas.getContext('2d')
      if (!context) {
        throw new Error('无法获取画布上下文')
      }

      // 获取元素区域的像素数据
      const x = Math.max(0, Math.floor(rect.x))
      const y = Math.max(0, Math.floor(rect.y))
      const width = Math.min(exportedCanvas.width - x, Math.ceil(rect.width))
      const height = Math.min(exportedCanvas.height - y, Math.ceil(rect.height))

      if (width <= 0 || height <= 0) {
        return {
          element,
          isRendered: false,
          renderingQuality: 0,
          issues: [{
            element,
            issue: 'not_rendered',
            description: '元素边界框无效或超出画布范围'
          }],
          pixelAccuracy: {
            accuracy: 0,
            pixelDifferences: 0,
            totalPixels: 0,
            colorVariance: 0,
            structuralSimilarity: 0
          }
        }
      }

      const exportedImageData = context.getImageData(x, y, width, height)

      // 创建参考渲染用于比较
      const referenceImageData = await this.createReferenceRendering(element, width, height)

      // 分析像素准确性
      const pixelAccuracy = this.analyzePixelAccuracy(referenceImageData, exportedImageData)

      // 检查是否渲染
      const pixelAnalysis = this.analyzePixelData(exportedImageData)
      const isRendered = pixelAnalysis.hasContent

      // 计算渲染质量
      const renderingQuality = this.calculateRenderingQuality(pixelAccuracy, isRendered)

      // 生成问题报告
      if (!isRendered) {
        issues.push({
          element,
          issue: 'not_rendered',
          description: `SVG元素 ${element.tagName} 未在导出画布中渲染`
        })
      } else if (pixelAccuracy.accuracy < 0.8) {
        issues.push({
          element,
          issue: 'partially_rendered',
          description: `SVG元素渲染质量较低 (准确性: ${(pixelAccuracy.accuracy * 100).toFixed(1)}%)`
        })
      }

      if (pixelAccuracy.structuralSimilarity < 0.7) {
        issues.push({
          element,
          issue: 'style_missing',
          description: '元素结构与预期不符，可能存在样式丢失'
        })
      }

      return {
        element,
        isRendered,
        renderingQuality,
        issues,
        pixelAccuracy
      }

    } catch (error) {
      console.error('SVG元素渲染验证失败:', error)

      return {
        element,
        isRendered: false,
        renderingQuality: 0,
        issues: [{
          element,
          issue: 'not_rendered',
          description: `验证失败: ${error instanceof Error ? error.message : String(error)}`
        }],
        pixelAccuracy: {
          accuracy: 0,
          pixelDifferences: 0,
          totalPixels: 0,
          colorVariance: 0,
          structuralSimilarity: 0
        }
      }
    }
  }

  /**
   * 分析像素准确性 - 公共接口实现
   * @param originalRegion 原始区域图像数据
   * @param exportedRegion 导出区域图像数据
   * @returns 像素准确性结果
   */
  analyzePixelAccuracy(originalRegion: ImageData, exportedRegion: ImageData): PixelAccuracyResult {
    const originalData = originalRegion.data
    const exportedData = exportedRegion.data

    // 确保两个图像数据大小相同
    const minLength = Math.min(originalData.length, exportedData.length)
    const totalPixels = minLength / 4

    let pixelDifferences = 0
    let colorVarianceSum = 0
    let structuralDifferences = 0

    // 逐像素比较
    for (let i = 0; i < minLength; i += 4) {
      const origR = originalData[i]
      const origG = originalData[i + 1]
      const origB = originalData[i + 2]
      const origA = originalData[i + 3]

      const expR = exportedData[i]
      const expG = exportedData[i + 1]
      const expB = exportedData[i + 2]
      const expA = exportedData[i + 3]

      // 计算颜色差异
      const colorDiff = Math.sqrt(
        Math.pow(origR - expR, 2) +
        Math.pow(origG - expG, 2) +
        Math.pow(origB - expB, 2) +
        Math.pow(origA - expA, 2)
      )

      if (colorDiff > this.colorTolerance) {
        pixelDifferences++
      }

      colorVarianceSum += colorDiff

      // 检查结构差异（透明度变化）
      const origVisible = origA > 0
      const expVisible = expA > 0
      if (origVisible !== expVisible) {
        structuralDifferences++
      }
    }

    const accuracy = totalPixels > 0 ? 1 - (pixelDifferences / totalPixels) : 0
    const colorVariance = totalPixels > 0 ? colorVarianceSum / totalPixels : 0
    const structuralSimilarity = totalPixels > 0 ? 1 - (structuralDifferences / totalPixels) : 0

    return {
      accuracy,
      pixelDifferences,
      totalPixels,
      colorVariance,
      structuralSimilarity
    }
  }

  /**
   * 检查SVG元素是否正确渲染 - 增强版实现
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
   * 生成质量报告 - 基础版本
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

    // 计算平均分数
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
    const recommendations = this.generateBasicRecommendations(allIssues, overallScore, pathCompleteness)

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
   * 生成综合质量报告 - 增强版本
   * @param pathValidation 路径验证结果
   * @param svgValidation SVG验证结果
   * @param additionalMetrics 额外指标
   * @returns 综合质量报告
   */
  generateComprehensiveReport(
    pathValidation: ValidationResult,
    svgValidation: SVGRenderingCheck,
    additionalMetrics?: QualityMetrics
  ): ComprehensiveQualityReport {
    const startTime = performance.now()

    // 计算质量指标
    const metrics: QualityMetrics = additionalMetrics || this.calculateQualityMetrics(pathValidation, svgValidation)

    // 计算总体质量分数
    const overallScore = this.calculateOverallQualityScore(metrics)

    // 合并所有问题
    const allIssues = [
      ...pathValidation.issues,
      ...svgValidation.renderingIssues.map(issue => ({
        type: 'rendering_error' as const,
        severity: 'medium' as const,
        message: issue.description,
        element: issue.element,
        expectedValue: '正确渲染',
        actualValue: issue.issue
      }))
    ]

    // 生成推荐集合
    const recommendationSet = this.generateRecommendations(allIssues, metrics)

    // 获取浏览器兼容性信息
    const browserCompatibility = this.getBrowserCompatibilityInfo()

    // 创建导出质量元数据
    const exportMetadata: ExportQualityMetadata = {
      timestamp: new Date().toISOString(),
      exportFormat: 'unknown', // 这将由调用者提供
      canvasSize: { width: 0, height: 0 }, // 这将由调用者提供
      elementCount: 0, // 这将由调用者提供
      svgElementCount: svgValidation.svgElementsFound,
      pathElementCount: svgValidation.pathElementsFound,
      validationDuration: performance.now() - startTime
    }

    const baseReport = this.generateQualityReport([pathValidation])

    return {
      ...baseReport,
      overallScore,
      pathCompleteness: metrics.pathCompleteness,
      renderingQuality: metrics.renderingAccuracy,
      styleAccuracy: metrics.styleConsistency,
      recommendations: this.flattenRecommendations(recommendationSet),
      executionTime: performance.now() - startTime,
      memoryUsage: this.getMemoryUsage(),
      browserCompatibility,
      exportMetadata
    }
  }

  /**
   * 计算总体质量分数
   * @param metrics 质量指标
   * @returns 总体质量分数 (0-1)
   */
  calculateOverallQualityScore(metrics: QualityMetrics): number {
    const weights = {
      pathCompleteness: 0.25,
      renderingAccuracy: 0.25,
      styleConsistency: 0.20,
      performanceScore: 0.10,
      elementCoverage: 0.10,
      visualFidelity: 0.10
    }

    return (
      metrics.pathCompleteness * weights.pathCompleteness +
      metrics.renderingAccuracy * weights.renderingAccuracy +
      metrics.styleConsistency * weights.styleConsistency +
      metrics.performanceScore * weights.performanceScore +
      metrics.elementCoverage * weights.elementCoverage +
      metrics.visualFidelity * weights.visualFidelity
    )
  }

  /**
   * 生成推荐集合
   * @param issues 问题列表
   * @param metrics 质量指标
   * @returns 推荐集合
   */
  generateRecommendations(issues: ValidationIssue[], metrics: QualityMetrics): RecommendationSet {
    const critical: Recommendation[] = []
    const important: Recommendation[] = []
    const suggested: Recommendation[] = []
    const optimizations: Recommendation[] = []

    // 分析严重问题
    const criticalIssues = issues.filter(issue => issue.severity === 'critical')
    if (criticalIssues.length > 0) {
      critical.push({
        id: 'critical-rendering-issues',
        category: 'rendering',
        priority: 'critical',
        title: '严重渲染问题',
        description: `发现 ${criticalIssues.length} 个严重渲染问题，可能导致导出失败或内容缺失`,
        actionItems: [
          '检查SVG元素的可见性和样式设置',
          '验证路径数据的完整性',
          '考虑使用备用渲染方法'
        ],
        expectedImprovement: '解决后可显著提升导出质量',
        technicalDetails: criticalIssues.map(issue => issue.message).join('; ')
      })
    }

    // 分析路径完整性
    if (metrics.pathCompleteness < 0.8) {
      important.push({
        id: 'path-completeness-low',
        category: 'quality',
        priority: 'high',
        title: '路径完整性不足',
        description: `路径完整性仅为 ${(metrics.pathCompleteness * 100).toFixed(1)}%，部分路径可能未正确导出`,
        actionItems: [
          '启用SVG样式内联转换',
          '使用Canvas备用渲染器',
          '检查路径元素的CSS样式'
        ],
        expectedImprovement: '提升路径渲染准确性至90%以上'
      })
    }

    // 分析渲染准确性
    if (metrics.renderingAccuracy < 0.7) {
      important.push({
        id: 'rendering-accuracy-low',
        category: 'rendering',
        priority: 'high',
        title: '渲染准确性较低',
        description: `渲染准确性为 ${(metrics.renderingAccuracy * 100).toFixed(1)}%，导出图像与原始设计存在差异`,
        actionItems: [
          '增加导出分辨率和缩放比例',
          '优化SVG元素的渲染设置',
          '使用更高质量的渲染引擎'
        ],
        expectedImprovement: '提升视觉保真度和细节表现'
      })
    }

    // 分析样式一致性
    if (metrics.styleConsistency < 0.8) {
      suggested.push({
        id: 'style-consistency-issues',
        category: 'quality',
        priority: 'medium',
        title: '样式一致性问题',
        description: '部分元素的样式在导出时可能发生变化',
        actionItems: [
          '强制内联所有CSS样式',
          '检查CSS变量和自定义属性',
          '验证字体和颜色的渲染'
        ],
        expectedImprovement: '确保导出结果与原始设计完全一致'
      })
    }

    // 性能优化建议
    if (metrics.performanceScore < 0.6) {
      optimizations.push({
        id: 'performance-optimization',
        category: 'performance',
        priority: 'medium',
        title: '性能优化建议',
        description: '导出过程可以进一步优化以提升速度',
        actionItems: [
          '启用元素缓存机制',
          '使用Web Worker进行后台处理',
          '减少不必要的重复计算'
        ],
        expectedImprovement: '减少导出时间30-50%'
      })
    }

    // 元素覆盖率建议
    if (metrics.elementCoverage < 0.9) {
      suggested.push({
        id: 'element-coverage-improvement',
        category: 'quality',
        priority: 'medium',
        title: '元素覆盖率改进',
        description: '部分设计元素可能未被正确识别或处理',
        actionItems: [
          '扩展元素检测算法',
          '添加对自定义元素的支持',
          '改进复杂图形的处理逻辑'
        ],
        expectedImprovement: '确保所有设计元素都被正确导出'
      })
    }

    return { critical, important, suggested, optimizations }
  }

  /**
   * 从画布中提取路径信息 - 公共接口实现
   * @param canvas 画布元素
   * @returns 路径信息数组
   */
  extractPathsFromCanvas(canvas: HTMLElement): PathInfo[] {
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
   * 从导出的画布中提取路径信息 - 公共接口实现
   * @param canvas 导出的画布
   * @returns 路径信息数组
   */
  async extractPathsFromExportedCanvas(canvas: HTMLCanvasElement): Promise<PathInfo[]> {
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
   * 比较路径完整性 - 公共接口实现
   * @param originalPaths 原始路径
   * @param exportedPaths 导出的路径
   * @returns 路径比较结果
   */
  comparePathIntegrity(originalPaths: PathInfo[], exportedPaths: PathInfo[]): PathComparisonResult {
    const issues: ValidationIssue[] = []
    const missingPaths: PathInfo[] = []
    const matchedPaths: Array<{ original: PathInfo; exported: PathInfo; similarity: number }> = []

    if (originalPaths.length === 0) {
      return {
        completenessPercentage: 100,
        validatedKeyPoints: 0,
        continuityScore: 100,
        missingPaths: [],
        matchedPaths: [],
        issues: []
      }
    }

    let totalKeyPoints = 0
    let validatedKeyPoints = 0

    // 为每个原始路径寻找匹配的导出路径
    for (const originalPath of originalPaths) {
      const matchingPath = this.findMatchingPath(originalPath, exportedPaths)
      totalKeyPoints += originalPath.keyPoints.length

      if (matchingPath) {
        const similarity = this.calculatePathSimilarity(originalPath, matchingPath)
        matchedPaths.push({ original: originalPath, exported: matchingPath, similarity })

        // 验证关键点
        const keyPointValidation = this.validatePathKeyPoints(originalPath, matchingPath)
        validatedKeyPoints += keyPointValidation.validatedPoints
        issues.push(...keyPointValidation.issues)

        // 验证路径连续性
        const continuityValidation = this.validatePathContinuity(matchingPath)
        issues.push(...continuityValidation.issues)
      } else {
        missingPaths.push(originalPath)
        issues.push({
          type: 'missing_path',
          severity: 'critical',
          message: `路径缺失: ${originalPath.id}`,
          element: originalPath.element || undefined,
          expectedValue: originalPath.pathData,
          actualValue: null
        })
      }
    }

    const completenessPercentage = ((originalPaths.length - missingPaths.length) / originalPaths.length) * 100
    const continuityScore = totalKeyPoints > 0 ? (validatedKeyPoints / totalKeyPoints) * 100 : 100

    return {
      completenessPercentage,
      validatedKeyPoints,
      continuityScore,
      missingPaths,
      matchedPaths,
      issues
    }
  }

  /**
   * 分析路径完整性 - 内部方法
   * @param originalPaths 原始路径
   * @param exportedPaths 导出的路径
   * @returns 路径分析结果
   */
  private async analyzePathCompleteness(
    originalPaths: PathInfo[],
    exportedPaths: PathInfo[]
  ): Promise<PathCompletenessAnalysis> {
    const comparisonResult = this.comparePathIntegrity(originalPaths, exportedPaths)

    return {
      completenessPercentage: comparisonResult.completenessPercentage,
      validatedKeyPoints: comparisonResult.validatedKeyPoints,
      continuityScore: comparisonResult.continuityScore
    }
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
   * 生成基础建议 - 原有方法重命名
   * @param issues 问题列表
   * @param overallScore 总体评分
   * @param pathCompleteness 路径完整性
   * @returns 建议列表
   */
  private generateBasicRecommendations(
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

  /**
   * 创建参考渲染用于比较
   * @param element SVG元素
   * @param width 宽度
   * @param height 高度
   * @returns 参考图像数据
   */
  private async createReferenceRendering(
    element: SVGElement,
    width: number,
    height: number
  ): Promise<ImageData> {
    try {
      // 创建临时画布用于渲染参考图像
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = width
      tempCanvas.height = height
      const tempContext = tempCanvas.getContext('2d')

      if (!tempContext) {
        throw new Error('无法创建临时画布上下文')
      }

      // 清空画布
      tempContext.clearRect(0, 0, width, height)

      // 尝试使用SVG序列化和图像渲染
      const svgData = this.serializeSVGElement(element)
      const blob = new Blob([svgData], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)

      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          tempContext.drawImage(img, 0, 0, width, height)
          const imageData = tempContext.getImageData(0, 0, width, height)
          URL.revokeObjectURL(url)
          resolve(imageData)
        }
        img.onerror = () => {
          URL.revokeObjectURL(url)
          // 如果SVG渲染失败，创建一个基本的参考图像
          const fallbackImageData = tempContext.createImageData(width, height)
          resolve(fallbackImageData)
        }
        img.src = url
      })

    } catch (error) {
      console.warn('创建参考渲染失败，使用空白参考:', error)

      // 创建空白参考图像
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = width
      tempCanvas.height = height
      const tempContext = tempCanvas.getContext('2d')!
      return tempContext.createImageData(width, height)
    }
  }

  /**
   * 序列化SVG元素
   * @param element SVG元素
   * @returns SVG字符串
   */
  private serializeSVGElement(element: SVGElement): string {
    try {
      const serializer = new XMLSerializer()
      let svgString = serializer.serializeToString(element)

      // 如果不是完整的SVG，包装在SVG标签中
      if (!svgString.startsWith('<svg')) {
        const rect = element.getBoundingClientRect()
        svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}" viewBox="0 0 ${rect.width} ${rect.height}">${svgString}</svg>`
      }

      return svgString
    } catch (error) {
      console.warn('SVG序列化失败:', error)
      return '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    }
  }

  /**
   * 计算渲染质量
   * @param pixelAccuracy 像素准确性结果
   * @param isRendered 是否已渲染
   * @returns 渲染质量分数 (0-1)
   */
  private calculateRenderingQuality(pixelAccuracy: PixelAccuracyResult, isRendered: boolean): number {
    if (!isRendered) {
      return 0
    }

    // 综合考虑像素准确性和结构相似性
    const accuracyWeight = 0.6
    const structuralWeight = 0.4

    return (pixelAccuracy.accuracy * accuracyWeight) + (pixelAccuracy.structuralSimilarity * structuralWeight)
  }

/**
   * 计算质量指标
   * @param pathValidation 路径验证结果
   * @param svgValidation SVG验证结果
   * @returns 质量指标
   */
  private calculateQualityMetrics(pathValidation: ValidationResult, svgValidation: SVGRenderingCheck): QualityMetrics {
    const pathCompleteness = pathValidation.pathCompleteness / 100
    const continuityScore = pathValidation.continuityScore / 100

    // 计算渲染准确性
    const renderingAccuracy = svgValidation.svgElementsFound > 0
      ? svgValidation.svgElementsRendered / svgValidation.svgElementsFound
      : 1

    // 计算样式一致性（基于问题类型）
    const styleIssues = pathValidation.issues.filter(issue => issue.type === 'style_mismatch')
    const styleConsistency = Math.max(0, 1 - (styleIssues.length * 0.1))

    // 计算性能分数（基于验证速度和复杂度）
    const performanceScore = Math.min(1, continuityScore * renderingAccuracy)

    // 计算元素覆盖率
    const totalElements = svgValidation.svgElementsFound + svgValidation.pathElementsFound
    const renderedElements = svgValidation.svgElementsRendered + svgValidation.pathElementsRendered
    const elementCoverage = totalElements > 0 ? renderedElements / totalElements : 1

    // 计算视觉保真度（综合指标）
    const visualFidelity = (pathCompleteness + renderingAccuracy + styleConsistency) / 3

    return {
      pathCompleteness,
      renderingAccuracy,
      styleConsistency,
      performanceScore,
      elementCoverage,
      visualFidelity
    }
  }

  /**
   * 获取浏览器兼容性信息
   * @returns 浏览器兼容性信息
   */
  private getBrowserCompatibilityInfo(): BrowserCompatibilityInfo {
    const userAgent = navigator.userAgent
    const browser = this.detectBrowser(userAgent)
    const version = this.detectBrowserVersion(userAgent)

    const supportedFeatures: string[] = []
    const limitations: string[] = []
    const recommendations: string[] = []

    // 检测HTML2Canvas支持
    if (typeof window !== 'undefined' && 'HTMLCanvasElement' in window) {
      supportedFeatures.push('Canvas API')
    } else {
      limitations.push('Canvas API不可用')
      recommendations.push('使用支持Canvas API的现代浏览器')
    }

    // 检测SVG支持
    if (document.implementation.hasFeature('http://www.w3.org/TR/SVG11/feature#BasicStructure', '1.1')) {
      supportedFeatures.push('SVG 1.1')
    } else {
      limitations.push('SVG支持有限')
      recommendations.push('升级到支持SVG的浏览器版本')
    }

    // 检测Web Workers支持
    if (typeof Worker !== 'undefined') {
      supportedFeatures.push('Web Workers')
    } else {
      limitations.push('Web Workers不可用')
      recommendations.push('某些性能优化功能可能不可用')
    }

    // 检测Blob支持
    if (typeof Blob !== 'undefined') {
      supportedFeatures.push('Blob API')
    } else {
      limitations.push('Blob API不可用')
      recommendations.push('文件下载功能可能受限')
    }

    return {
      browser,
      version,
      supportedFeatures,
      limitations,
      recommendations
    }
  }

  /**
   * 检测浏览器类型
   * @param userAgent 用户代理字符串
   * @returns 浏览器名称
   */
  private detectBrowser(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome'
    if (userAgent.includes('Firefox')) return 'Firefox'
    if (userAgent.includes('Safari')) return 'Safari'
    if (userAgent.includes('Edge')) return 'Edge'
    if (userAgent.includes('Opera')) return 'Opera'
    return 'Unknown'
  }

  /**
   * 检测浏览器版本
   * @param userAgent 用户代理字符串
   * @returns 浏览器版本
   */
  private detectBrowserVersion(userAgent: string): string {
    const matches = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+\.\d+)/)
    return matches ? matches[2] : 'Unknown'
  }

  /**
   * 获取内存使用情况
   * @returns 内存使用量（字节）
   */
  private getMemoryUsage(): number | undefined {
    if ('memory' in performance) {
      const memory = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory
      return memory.usedJSHeapSize
    }
    return undefined
  }

  /**
   * 扁平化推荐集合
   * @param recommendationSet 推荐集合
   * @returns 推荐字符串数组
   */
  private flattenRecommendations(recommendationSet: RecommendationSet): string[] {
    const allRecommendations = [
      ...recommendationSet.critical,
      ...recommendationSet.important,
      ...recommendationSet.suggested,
      ...recommendationSet.optimizations
    ]

    return allRecommendations.map(rec => `${rec.title}: ${rec.description}`)
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
