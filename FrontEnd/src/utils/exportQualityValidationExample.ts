/**
 * 导出质量验证系统使用示例
 * 展示如何使用增强的质量验证功能
 */

import { ExportQualityValidator } from './exportQualityValidator'
import type { ValidationResult, SVGRenderingCheck, ComprehensiveQualityReport } from './exportQualityValidator'

/**
 * 质量验证系统使用示例
 */
export class ExportQualityValidationExample {
  private validator: ExportQualityValidator

  constructor() {
    this.validator = new ExportQualityValidator()
  }

  /**
   * 完整的质量验证流程示例
   * @param originalCanvas 原始画布元素
   * @param exportedCanvas 导出的画布
   * @returns 综合质量报告
   */
  async performCompleteValidation(
    originalCanvas: HTMLElement,
    exportedCanvas: HTMLCanvasElement
  ): Promise<ComprehensiveQualityReport> {
    console.log('开始执行完整的质量验证流程...')

    // 1. 路径完整性验证
    console.log('步骤 1: 验证路径完整性...')
    const pathValidation: ValidationResult = await this.validator.validatePathCompleteness(
      exportedCanvas,
      originalCanvas
    )

    console.log(`路径完整性: ${pathValidation.pathCompleteness}%`)
    console.log(`验证的关键点: ${pathValidation.keyPointsValidated}`)
    console.log(`连续性评分: ${pathValidation.continuityScore}%`)

    // 2. SVG渲染验证
    console.log('步骤 2: 验证SVG渲染质量...')
    const svgValidation: SVGRenderingCheck = await this.validator.checkSVGRendering(
      exportedCanvas,
      originalCanvas
    )

    console.log(`发现SVG元素: ${svgValidation.svgElementsFound}`)
    console.log(`成功渲染: ${svgValidation.svgElementsRendered}`)
    console.log(`渲染问题: ${svgValidation.renderingIssues.length}`)

    // 3. 生成综合质量报告
    console.log('步骤 3: 生成综合质量报告...')
    const comprehensiveReport = this.validator.generateComprehensiveReport(
      pathValidation,
      svgValidation
    )

    // 4. 输出报告摘要
    this.printReportSummary(comprehensiveReport)

    return comprehensiveReport
  }

  /**
   * 单独的路径验证示例
   * @param originalCanvas 原始画布
   * @param exportedCanvas 导出画布
   */
  async validatePathsOnly(
    originalCanvas: HTMLElement,
    exportedCanvas: HTMLCanvasElement
  ): Promise<void> {
    console.log('执行路径验证...')

    // 提取原始路径
    const originalPaths = this.validator.extractPathsFromCanvas(originalCanvas)
    console.log(`提取到 ${originalPaths.length} 个原始路径`)

    // 提取导出路径
    const exportedPaths = await this.validator.extractPathsFromExportedCanvas(exportedCanvas)
    console.log(`检测到 ${exportedPaths.length} 个导出路径`)

    // 比较路径完整性
    const comparison = this.validator.comparePathIntegrity(originalPaths, exportedPaths)

    console.log('路径比较结果:')
    console.log(`- 完整性: ${comparison.completenessPercentage.toFixed(1)}%`)
    console.log(`- 匹配路径: ${comparison.matchedPaths.length}`)
    console.log(`- 缺失路径: ${comparison.missingPaths.length}`)
    console.log(`- 发现问题: ${comparison.issues.length}`)

    // 输出详细问题
    if (comparison.issues.length > 0) {
      console.log('发现的问题:')
      comparison.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. [${issue.severity}] ${issue.message}`)
      })
    }
  }

  /**
   * SVG元素检测示例
   * @param canvas 画布元素
   */
  detectSVGElements(canvas: HTMLElement): void {
    console.log('检测SVG元素...')

    const svgElements = this.validator.detectSVGElements(canvas)

    console.log(`发现 ${svgElements.length} 个SVG元素:`)
    svgElements.forEach((element, index) => {
      console.log(`  ${index + 1}. ${element.type} - 可见性: ${element.styles.visibility}`)
      console.log(`     边界: ${element.boundingBox.width}x${element.boundingBox.height}`)

      if (element.pathData) {
        console.log(`     路径数据: ${element.pathData.substring(0, 50)}...`)
      }

      if (element.textContent) {
        console.log(`     文本内容: ${element.textContent}`)
      }
    })
  }

  /**
   * 质量指标计算示例
   * @param pathValidation 路径验证结果
   * @param svgValidation SVG验证结果
   */
  demonstrateQualityMetrics(
    pathValidation: ValidationResult,
    svgValidation: SVGRenderingCheck
  ): void {
    console.log('计算质量指标...')

    // 使用内部方法计算质量指标（在实际使用中，这些会通过公共接口访问）
    const metrics = {
      pathCompleteness: pathValidation.pathCompleteness / 100,
      renderingAccuracy: svgValidation.svgElementsFound > 0
        ? svgValidation.svgElementsRendered / svgValidation.svgElementsFound
        : 1,
      styleConsistency: 0.9, // 示例值
      performanceScore: 0.8, // 示例值
      elementCoverage: 0.95, // 示例值
      visualFidelity: 0.85 // 示例值
    }

    const overallScore = this.validator.calculateOverallQualityScore(metrics)

    console.log('质量指标:')
    console.log(`- 路径完整性: ${(metrics.pathCompleteness * 100).toFixed(1)}%`)
    console.log(`- 渲染准确性: ${(metrics.renderingAccuracy * 100).toFixed(1)}%`)
    console.log(`- 样式一致性: ${(metrics.styleConsistency * 100).toFixed(1)}%`)
    console.log(`- 性能评分: ${(metrics.performanceScore * 100).toFixed(1)}%`)
    console.log(`- 元素覆盖率: ${(metrics.elementCoverage * 100).toFixed(1)}%`)
    console.log(`- 视觉保真度: ${(metrics.visualFidelity * 100).toFixed(1)}%`)
    console.log(`- 总体评分: ${(overallScore * 100).toFixed(1)}%`)
  }

  /**
   * 打印报告摘要
   * @param report 综合质量报告
   */
  private printReportSummary(report: ComprehensiveQualityReport): void {
    console.log('\n=== 质量验证报告摘要 ===')
    console.log(`总体评分: ${(report.overallScore * 100).toFixed(1)}%`)
    console.log(`路径完整性: ${report.pathCompleteness.toFixed(1)}%`)
    console.log(`渲染质量: ${(report.renderingQuality * 100).toFixed(1)}%`)
    console.log(`样式准确性: ${(report.styleAccuracy * 100).toFixed(1)}%`)
    console.log(`执行时间: ${report.executionTime.toFixed(2)}ms`)

    if (report.memoryUsage) {
      console.log(`内存使用: ${(report.memoryUsage / 1024 / 1024).toFixed(2)}MB`)
    }

    console.log(`浏览器: ${report.browserCompatibility.browser} ${report.browserCompatibility.version}`)

    console.log('\n推荐操作:')
    report.recommendations.slice(0, 3).forEach((rec, index) => {
      console.log(`  ${index + 1}. ${rec}`)
    })

    if (report.recommendations.length > 3) {
      console.log(`  ... 还有 ${report.recommendations.length - 3} 条建议`)
    }

    console.log('\n验证元数据:')
    console.log(`- SVG元素数量: ${report.exportMetadata.svgElementCount}`)
    console.log(`- 路径元素数量: ${report.exportMetadata.pathElementCount}`)
    console.log(`- 验证耗时: ${report.exportMetadata.validationDuration.toFixed(2)}ms`)
    console.log('========================\n')
  }
}

// 使用示例
export function createQualityValidationExample(): ExportQualityValidationExample {
  return new ExportQualityValidationExample()
}
