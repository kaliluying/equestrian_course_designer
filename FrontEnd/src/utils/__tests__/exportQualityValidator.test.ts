/**
 * 导出质量验证器测试
 */

import { ExportQualityValidator } from '../exportQualityValidator'

describe('ExportQualityValidator', () => {
  let validator: ExportQualityValidator

  beforeEach(() => {
    validator = new ExportQualityValidator()
  })

  describe('路径完整性验证', () => {
    it('应该能够从画布中提取路径信息', () => {
      // 创建模拟的画布元素
      const mockCanvas = document.createElement('div')
      mockCanvas.innerHTML = `
        <svg>
          <path id="test-path" d="M 10 10 L 20 20" stroke="black" stroke-width="2" fill="none"/>
        </svg>
      `

      const paths = validator.extractPathsFromCanvas(mockCanvas)

      expect(paths).toHaveLength(1)
      expect(paths[0].id).toBe('test-path')
      expect(paths[0].pathData).toBe('M 10 10 L 20 20')
    })

    it('应该能够比较路径完整性', () => {
      const originalPaths = [{
        id: 'path1',
        element: null,
        pathData: 'M 0 0 L 10 10',
        boundingBox: { x: 0, y: 0, width: 10, height: 10 },
        style: { stroke: 'black', strokeWidth: 1, strokeDashArray: 'none', fill: 'none' },
        keyPoints: [
          { x: 0, y: 0, type: 'start' as const, isPresent: true, tolerance: 2 },
          { x: 10, y: 10, type: 'end' as const, isPresent: true, tolerance: 2 }
        ]
      }]

      const exportedPaths = [{
        id: 'path1-exported',
        element: null,
        pathData: 'M 0 0 L 10 10',
        boundingBox: { x: 0, y: 0, width: 10, height: 10 },
        style: { stroke: 'black', strokeWidth: 1, strokeDashArray: 'none', fill: 'none' },
        keyPoints: [
          { x: 0, y: 0, type: 'start' as const, isPresent: true, tolerance: 2 },
          { x: 10, y: 10, type: 'end' as const, isPresent: true, tolerance: 2 }
        ]
      }]

      const result = validator.comparePathIntegrity(originalPaths, exportedPaths)

      expect(result.completenessPercentage).toBe(100)
      expect(result.matchedPaths).toHaveLength(1)
      expect(result.missingPaths).toHaveLength(0)
    })
  })

  describe('SVG渲染验证', () => {
    it('应该能够检测SVG元素', () => {
      const mockCanvas = document.createElement('div')
      mockCanvas.innerHTML = `
        <svg>
          <circle cx="50" cy="50" r="25" fill="red"/>
          <rect x="10" y="10" width="30" height="20" fill="blue"/>
        </svg>
      `

      const svgElements = validator.detectSVGElements(mockCanvas)

      expect(svgElements).toHaveLength(3) // svg + circle + rect
      expect(svgElements.some(el => el.type === 'circle')).toBe(true)
      expect(svgElements.some(el => el.type === 'rect')).toBe(true)
    })
  })

  describe('质量报告生成', () => {
    it('应该能够生成基础质量报告', () => {
      const validationResults = [{
        isValid: true,
        issues: [],
        pathCompleteness: 95,
        keyPointsValidated: 10,
        continuityScore: 90
      }]

      const report = validator.generateQualityReport(validationResults)

      expect(report.overallScore).toBeGreaterThan(0.9)
      expect(report.pathCompleteness).toBe(95)
      expect(report.recommendations).toBeDefined()
    })

    it('应该能够生成综合质量报告', () => {
      const pathValidation = {
        isValid: true,
        issues: [],
        pathCompleteness: 85,
        keyPointsValidated: 8,
        continuityScore: 80
      }

      const svgValidation = {
        svgElementsFound: 5,
        svgElementsRendered: 4,
        pathElementsFound: 3,
        pathElementsRendered: 3,
        renderingIssues: []
      }

      const report = validator.generateComprehensiveReport(pathValidation, svgValidation)

      expect(report.overallScore).toBeDefined()
      expect(report.executionTime).toBeGreaterThan(0)
      expect(report.browserCompatibility).toBeDefined()
      expect(report.exportMetadata).toBeDefined()
    })

    it('应该能够计算总体质量分数', () => {
      const metrics = {
        pathCompleteness: 0.9,
        renderingAccuracy: 0.8,
        styleConsistency: 0.85,
        performanceScore: 0.7,
        elementCoverage: 0.95,
        visualFidelity: 0.88
      }

      const score = validator.calculateOverallQualityScore(metrics)

      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(1)
    })
  })
})
